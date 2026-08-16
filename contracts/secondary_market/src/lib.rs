#![no_std]

// A `pool` satellite contract, split out because pool.wasm was over
// Soroban's 200KB deploy limit. Covers two originally-pool-native features
// that don't need pool's own trusted execution context:
//   - the #1025 secondary market for pool positions and co-funding shares
//     (listing lifecycle/storage lives here; the actual balance movement
//     between buyer and seller happens on `pool` via the trusted
//     `market_settle_listing` entrypoint, called after validating a listing
//     is open)
//   - the #865 withdrawal-wait/liquidity-forecast read-only analytics views,
//     recomputed here from pool's public getters (`get_withdrawal_queue`,
//     `get_token_totals`, `get_open_invoices_for_token`,
//     `get_trailing_inflow_rate`, `get_share_token`)
//
// Deliberately calls into `pool` via raw `env.invoke_contract`/
// `try_invoke_contract` rather than `pool`'s generated `FundingPoolClient` —
// `pool` is only a dev-dependency here (used by tests to spin up a real
// pool instance). Depending on it as a normal dependency and using its
// Client in real (non-test) code pulls the whole pool crate's compiled
// object code into this crate's wasm build (codegen-units=1 means pool
// compiles to a single object file, and any reference to it drags the
// entire file in), which then collides at link time: pool's own
// `#[contractimpl]` entrypoints (e.g. `pause`, `unpause`, `initialize`) get
// exported into this contract's wasm alongside this crate's own
// same-named entrypoints, producing duplicate wasm export symbols.
// `#[contracttype]` structs encode as a field-name-keyed map (sorted by
// field name, not declaration order — see soroban-sdk-macros
// `derive_struct.rs`), so the local mirror structs below decode
// cross-contract calls into pool correctly as long as field names/types
// match pool's, with no dependency on pool's crate needed.
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, IntoVal, Map, Symbol, Vec,
};

/// Mirrors `pool::FundedInvoice`.
#[contracttype]
#[derive(Clone)]
struct FundedInvoiceView {
    pub invoice_id: u64,
    pub sme: Address,
    pub token: Address,
    pub principal: i128,
    pub funded_at: u64,
    pub factoring_fee: i128,
    pub due_date: u64,
    pub repaid_amount: i128,
    pub co_funding_round_id: Option<u64>,
    pub locked_yield_bps: u32,
}

/// Mirrors `pool::PoolTokenTotals`.
#[contracttype]
#[derive(Clone)]
struct TokenTotalsView {
    pub pool_value: i128,
    pub total_deployed: i128,
    pub total_paid_out: i128,
    pub total_fee_revenue: i128,
    pub reward_per_share: i128,
    pub protocol_revenue: i128,
}

/// Mirrors `pool::WithdrawalRequest`.
#[contracttype]
#[derive(Clone)]
struct WithdrawalRequestView {
    pub investor: Address,
    pub token: Address,
    pub shares: i128,
    pub requested_at: u64,
    pub request_id: u64,
}

/// Mirrors `pool::ListingSettlement`, sent as an arg to `market_settle_listing`.
#[contracttype]
#[derive(Clone)]
struct PoolListingSettlement {
    pub buyer: Address,
    pub seller: Address,
    pub invoice_id: u64,
    pub is_co_funding: bool,
    pub amount_or_bps: u64,
    pub price: i128,
}

const SECS_PER_DAY: u64 = 86_400;
// #865: clamp bounds for the predictive wait estimate so a sparse/empty inflow history
// or a huge queue never produces a nonsensical (zero or unbounded) estimate.
const MIN_WAIT_ESTIMATE_SECS: u64 = 3_600; // 1 hour
const MAX_WAIT_ESTIMATE_SECS: u64 = 31_536_000; // 365 days
                                                // #865: liquidity forecast is capped to this many days to bound loop iteration/gas cost.
const MAX_FORECAST_HORIZON_DAYS: u32 = 365;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MarketError {
    AlreadyInitialized = 0,
    NotInitialized = 1,
    Unauthorized = 2,
    ContractPaused = 3,
    ZeroAmount = 4,
    InvalidAmount = 5,
    ListingNotFound = 6,
    ListingNotOpen = 7,
    ListingNotSeller = 8,
    TooManyListings = 9,
    /// The cross-contract call into pool's `market_settle_listing` failed.
    /// Pool's own `PoolError` isn't re-exposed here since it's a different
    /// contract's error domain (KYC, compliance, concentration cap, etc.) —
    /// callers that need the specific reason should simulate the transaction.
    SettlementFailed = 10,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingStatus {
    Open,
    Filled,
    Cancelled,
}

/// Whether the listing covers a co-funded share (bps of a CoFundingRound)
/// or a single-funded position slice (raw token amount of deployed principal).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingKind {
    CoFunding,
    SingleFunded,
}

/// A secondary-market listing created by `list_position`.
/// `amount_or_bps` is:
///   - for `CoFunding`: the bps of the seller's CoFundShare being offered
///   - for `SingleFunded`: the raw token amount of deployed principal being offered
/// `price` is the flat token amount the buyer must pay.
#[contracttype]
#[derive(Clone)]
pub struct Listing {
    pub listing_id: u64,
    pub invoice_id: u64,
    pub seller: Address,
    pub token: Address,
    pub kind: ListingKind,
    pub amount_or_bps: u64,
    pub price: i128,
    pub created_at: u64,
    pub status: ListingStatus,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct WaitEstimate {
    pub queue_position: u32,
    pub capital_ahead: i128,
    pub nearest_invoice_due_date: u64,
    /// #865: predicted seconds until this request is likely to clear, projected from
    /// `capital_ahead` divided by the trailing deposit-inflow rate, combined with
    /// `nearest_invoice_due_date` and clamped to
    /// `[MIN_WAIT_ESTIMATE_SECS, MAX_WAIT_ESTIMATE_SECS]`. This is an estimate, not a
    /// guarantee — actual settlement depends on future deposits/repayments.
    pub estimated_wait_secs: u64,
}

/// #865: a single projected point in `get_liquidity_forecast`'s horizon.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LiquidityForecastPoint {
    /// Days from now (1-indexed; day 1 is the first point after "now").
    pub day: u32,
    /// Projected `available_liquidity` at this point: current liquidity, plus principal
    /// from open invoices whose `due_date` falls within the window, plus the trailing
    /// deposit-inflow rate extrapolated over the elapsed days.
    pub projected_available: i128,
}

#[contracttype]
pub enum DataKey {
    Admin,
    PoolContract,
    Initialized,
    Paused,
}

const LISTING_DATA: Symbol = symbol_short!("lst_data");
const LISTING_IDS_INV: Symbol = symbol_short!("lst_inv"); // invoice_id -> Vec<u64>
const LISTING_IDS_SELLER: Symbol = symbol_short!("lst_sel"); // seller -> Vec<u64>
const LISTING_COUNTER: Symbol = symbol_short!("lst_cnt");
const EVT: Symbol = symbol_short!("market");
// Maximum open listings per invoice to bound iteration gas cost.
const MAX_LISTINGS_PER_INVOICE: u32 = 50;

fn require_not_paused(env: &Env) {
    if env
        .storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Paused)
        .unwrap_or(false)
    {
        panic_with_error!(env, MarketError::ContractPaused);
    }
}

#[contract]
pub struct SecondaryMarket;

#[contractimpl]
impl SecondaryMarket {
    pub fn initialize(env: Env, admin: Address, pool_contract: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, MarketError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::PoolContract, &pool_contract);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn pause(env: Env, admin: Address) -> Result<(), MarketError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(MarketError::NotInitialized)?;
        if admin != stored_admin {
            return Err(MarketError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env, admin: Address) -> Result<(), MarketError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(MarketError::NotInitialized)?;
        if admin != stored_admin {
            return Err(MarketError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn get_pool_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PoolContract)
    }

    /// List part or all of a position for sale on the secondary market.
    ///
    /// For `CoFunding` kind: `amount_or_bps` is the bps of the seller's
    /// `CoFundShare` to offer. For `SingleFunded` kind: `amount_or_bps` is
    /// the raw token amount of deployed principal to offer. Ownership is
    /// best-effort validated here against pool's current state — settlement
    /// re-validates independently at buy time regardless, so a listing that
    /// outlives the seller's actual holding (e.g. after a withdrawal) simply
    /// fails to fill rather than being exploitable.
    pub fn list_position(
        env: Env,
        seller: Address,
        invoice_id: u64,
        kind: ListingKind,
        amount_or_bps: u64,
        price: i128,
    ) -> Result<u64, MarketError> {
        seller.require_auth();
        require_not_paused(&env);

        if amount_or_bps == 0 {
            return Err(MarketError::ZeroAmount);
        }
        if price <= 0 {
            return Err(MarketError::InvalidAmount);
        }

        let pool_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::PoolContract)
            .ok_or(MarketError::NotInitialized)?;

        let record: Option<FundedInvoiceView> = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_funded_invoice"),
            Vec::from_array(&env, [invoice_id.into_val(&env)]),
        );
        let record = record.ok_or(MarketError::InvalidAmount)?;
        let token = record.token.clone();

        match kind {
            ListingKind::CoFunding => {
                let seller_bps: u32 = env.invoke_contract(
                    &pool_id,
                    &Symbol::new(&env, "get_co_fund_share"),
                    Vec::from_array(&env, [invoice_id.into_val(&env), seller.into_val(&env)]),
                );
                if amount_or_bps as u32 > seller_bps || seller_bps == 0 {
                    return Err(MarketError::InvalidAmount);
                }
            }
            ListingKind::SingleFunded => {
                if record.co_funding_round_id.is_some() {
                    return Err(MarketError::InvalidAmount);
                }
                let (_available, deployed): (i128, i128) = env.invoke_contract(
                    &pool_id,
                    &Symbol::new(&env, "get_investor_position"),
                    Vec::from_array(&env, [seller.into_val(&env), token.into_val(&env)]),
                );
                if (amount_or_bps as i128) > deployed || deployed == 0 {
                    return Err(MarketError::InvalidAmount);
                }
            }
        }

        // Enforce per-invoice listing cap to bound iteration gas.
        let mut inv_map: Map<u64, Vec<u64>> = env
            .storage()
            .instance()
            .get(&LISTING_IDS_INV)
            .unwrap_or_else(|| Map::new(&env));
        let existing: Vec<u64> = inv_map.get(invoice_id).unwrap_or_else(|| Vec::new(&env));
        if existing.len() >= MAX_LISTINGS_PER_INVOICE {
            return Err(MarketError::TooManyListings);
        }

        let listing_id: u64 = env
            .storage()
            .instance()
            .get(&LISTING_COUNTER)
            .unwrap_or(0u64)
            .checked_add(1)
            .ok_or(MarketError::InvalidAmount)?;
        env.storage().instance().set(&LISTING_COUNTER, &listing_id);

        let listing = Listing {
            listing_id,
            invoice_id,
            seller: seller.clone(),
            token,
            kind,
            amount_or_bps,
            price,
            created_at: env.ledger().timestamp(),
            status: ListingStatus::Open,
        };

        let mut all_listings: Map<u64, Listing> = env
            .storage()
            .persistent()
            .get(&LISTING_DATA)
            .unwrap_or_else(|| Map::new(&env));
        all_listings.set(listing_id, listing);
        env.storage().persistent().set(&LISTING_DATA, &all_listings);

        let mut updated_inv = existing;
        updated_inv.push_back(listing_id);
        inv_map.set(invoice_id, updated_inv);
        env.storage().instance().set(&LISTING_IDS_INV, &inv_map);

        let mut sel_map: Map<Address, Vec<u64>> = env
            .storage()
            .instance()
            .get(&LISTING_IDS_SELLER)
            .unwrap_or_else(|| Map::new(&env));
        let mut seller_vec: Vec<u64> = sel_map
            .get(seller.clone())
            .unwrap_or_else(|| Vec::new(&env));
        seller_vec.push_back(listing_id);
        sel_map.set(seller.clone(), seller_vec);
        env.storage().instance().set(&LISTING_IDS_SELLER, &sel_map);

        env.events().publish(
            (EVT, symbol_short!("lst_open")),
            (listing_id, invoice_id, seller, amount_or_bps, price),
        );
        Ok(listing_id)
    }

    /// Cancel an open listing. Only the original seller may cancel.
    pub fn cancel_listing(env: Env, seller: Address, listing_id: u64) -> Result<(), MarketError> {
        seller.require_auth();
        require_not_paused(&env);

        let mut all_listings: Map<u64, Listing> = env
            .storage()
            .persistent()
            .get(&LISTING_DATA)
            .ok_or(MarketError::ListingNotFound)?;
        let mut listing: Listing = all_listings
            .get(listing_id)
            .ok_or(MarketError::ListingNotFound)?;

        if listing.seller != seller {
            return Err(MarketError::ListingNotSeller);
        }
        if listing.status != ListingStatus::Open {
            return Err(MarketError::ListingNotOpen);
        }

        listing.status = ListingStatus::Cancelled;
        all_listings.set(listing_id, listing.clone());
        env.storage().persistent().set(&LISTING_DATA, &all_listings);

        env.events().publish(
            (EVT, symbol_short!("lst_cncl")),
            (listing_id, listing.invoice_id, seller),
        );
        Ok(())
    }

    /// Buy an open listing. Delegates the actual balance movement to pool's
    /// `market_settle_listing`, which re-validates the underlying balances
    /// independently of what was checked at list time.
    pub fn buy_listing(env: Env, buyer: Address, listing_id: u64) -> Result<(), MarketError> {
        buyer.require_auth();
        require_not_paused(&env);

        let mut all_listings: Map<u64, Listing> = env
            .storage()
            .persistent()
            .get(&LISTING_DATA)
            .ok_or(MarketError::ListingNotFound)?;
        let mut listing: Listing = all_listings
            .get(listing_id)
            .ok_or(MarketError::ListingNotFound)?;

        if listing.status != ListingStatus::Open {
            return Err(MarketError::ListingNotOpen);
        }
        if listing.seller == buyer {
            return Err(MarketError::Unauthorized);
        }

        let pool_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::PoolContract)
            .ok_or(MarketError::NotInitialized)?;

        let settlement = PoolListingSettlement {
            buyer: buyer.clone(),
            seller: listing.seller.clone(),
            invoice_id: listing.invoice_id,
            is_co_funding: listing.kind == ListingKind::CoFunding,
            amount_or_bps: listing.amount_or_bps,
            price: listing.price,
        };
        let args = Vec::from_array(
            &env,
            [
                env.current_contract_address().into_val(&env),
                settlement.into_val(&env),
            ],
        );
        let result = env.try_invoke_contract::<(), soroban_sdk::Error>(
            &pool_id,
            &Symbol::new(&env, "market_settle_listing"),
            args,
        );
        match result {
            Ok(Ok(())) => {}
            _ => return Err(MarketError::SettlementFailed),
        }

        listing.status = ListingStatus::Filled;
        all_listings.set(listing_id, listing.clone());
        env.storage().persistent().set(&LISTING_DATA, &all_listings);

        env.events().publish(
            (EVT, symbol_short!("lst_buy")),
            (
                listing_id,
                listing.invoice_id,
                listing.seller,
                buyer,
                listing.price,
            ),
        );
        Ok(())
    }

    /// Read a single listing by ID. Returns `None` if not found.
    pub fn get_listing(env: Env, listing_id: u64) -> Option<Listing> {
        let all_listings: Map<u64, Listing> = env
            .storage()
            .persistent()
            .get(&LISTING_DATA)
            .unwrap_or_else(|| Map::new(&env));
        all_listings.get(listing_id)
    }

    /// List all listing IDs for a given invoice (open and closed).
    pub fn list_listings_for_invoice(env: Env, invoice_id: u64) -> Vec<u64> {
        let inv_listings: Map<u64, Vec<u64>> = env
            .storage()
            .instance()
            .get(&LISTING_IDS_INV)
            .unwrap_or_else(|| Map::new(&env));
        inv_listings
            .get(invoice_id)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// List all listing IDs created by a given seller (open and closed).
    pub fn list_listings_for_investor(env: Env, seller: Address) -> Vec<u64> {
        let sel_listings: Map<Address, Vec<u64>> = env
            .storage()
            .instance()
            .get(&LISTING_IDS_SELLER)
            .unwrap_or_else(|| Map::new(&env));
        sel_listings.get(seller).unwrap_or_else(|| Vec::new(&env))
    }

    /// #865: predict how long `investor`'s (already-queued) withdrawal
    /// request will take to clear, based on the pool's current withdrawal
    /// queue, its trailing deposit-inflow rate, and the nearest due date
    /// among its open invoices for `token`.
    pub fn estimate_withdrawal_wait(env: Env, investor: Address, token: Address) -> WaitEstimate {
        let pool_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::PoolContract)
            .expect("not initialized");

        let queue: Vec<WithdrawalRequestView> = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_withdrawal_queue"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let tt: TokenTotalsView = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_token_totals"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let share_token: Option<Address> = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_share_token"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let total_shares: i128 = match share_token {
            Some(share_token) => env.invoke_contract(
                &share_token,
                &Symbol::new(&env, "total_supply"),
                Vec::new(&env),
            ),
            None => 0,
        };

        let mut queue_position = 0u32;
        let mut capital_ahead = 0i128;
        let mut position = 1u32;
        for request in queue.iter() {
            if request.investor == investor {
                queue_position = position;
                break;
            }
            if total_shares > 0 {
                if let Some(amount) = request
                    .shares
                    .checked_mul(tt.pool_value)
                    .and_then(|value| value.checked_div(total_shares))
                {
                    capital_ahead = capital_ahead.saturating_add(amount);
                }
            }
            position = position.saturating_add(1);
        }

        let now = env.ledger().timestamp();
        let open_invoices: Vec<FundedInvoiceView> = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_open_invoices_for_token"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let mut nearest_invoice_due_date = 0u64;
        for record in open_invoices.iter() {
            if nearest_invoice_due_date == 0 || record.due_date < nearest_invoice_due_date {
                nearest_invoice_due_date = record.due_date;
            }
        }

        let rate: i128 = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_trailing_inflow_rate"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let via_rate = if rate > 0 && capital_ahead > 0 {
            Some((capital_ahead / rate) as u64)
        } else if capital_ahead <= 0 {
            Some(0)
        } else {
            None
        };
        let via_due_date = if nearest_invoice_due_date > now {
            Some(nearest_invoice_due_date - now)
        } else {
            None
        };
        let estimated_wait_secs = match (via_rate, via_due_date) {
            (Some(a), Some(b)) => a.min(b),
            (Some(a), None) => a,
            (None, Some(b)) => b,
            (None, None) => MAX_WAIT_ESTIMATE_SECS,
        }
        .clamp(MIN_WAIT_ESTIMATE_SECS, MAX_WAIT_ESTIMATE_SECS);

        WaitEstimate {
            queue_position,
            capital_ahead,
            nearest_invoice_due_date,
            estimated_wait_secs,
        }
    }

    /// #865: project available liquidity at up to `horizon_days` daily points, based on
    /// principal from open invoices' known due dates plus the trailing deposit-inflow
    /// rate extrapolated forward. `horizon_days` is clamped to
    /// `[1, MAX_FORECAST_HORIZON_DAYS]` to bound loop iteration cost.
    pub fn get_liquidity_forecast(
        env: Env,
        token: Address,
        horizon_days: u32,
    ) -> Vec<LiquidityForecastPoint> {
        let pool_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::PoolContract)
            .expect("not initialized");

        let horizon = horizon_days.clamp(1, MAX_FORECAST_HORIZON_DAYS);
        let tt: TokenTotalsView = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_token_totals"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let current_liquidity = tt.pool_value.checked_sub(tt.total_deployed).unwrap_or(0);
        let now = env.ledger().timestamp();
        let open_invoices: Vec<FundedInvoiceView> = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_open_invoices_for_token"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );
        let rate: i128 = env.invoke_contract(
            &pool_id,
            &Symbol::new(&env, "get_trailing_inflow_rate"),
            Vec::from_array(&env, [token.into_val(&env)]),
        );

        let mut points = Vec::new(&env);
        for day in 1..=horizon {
            let horizon_ts = now.saturating_add((day as u64) * SECS_PER_DAY);
            let mut expected_repayments: i128 = 0;
            for invoice in open_invoices.iter() {
                if invoice.due_date <= horizon_ts {
                    let outstanding = invoice.principal.saturating_sub(invoice.repaid_amount);
                    expected_repayments = expected_repayments.saturating_add(outstanding);
                }
            }
            let extrapolated_inflow = rate.saturating_mul((day as i128) * SECS_PER_DAY as i128);
            let projected_available = current_liquidity
                .saturating_add(expected_repayments)
                .saturating_add(extrapolated_inflow);
            points.push_back(LiquidityForecastPoint {
                day,
                projected_available,
            });
        }
        points
    }
}
