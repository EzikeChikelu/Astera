#![cfg(test)]

//! #1036: end-to-end test of liquidate_collateral routing a seized,
//! cross-asset collateral deposit through a *real* `auction` contract (not a
//! mock) — consigning the sale, a keeper taking it (or letting it expire),
//! and pool's settle_liquidation_sale reconciling the outcome back into pool
//! accounting. This is the genuine cross-wasm-boundary exercise of the
//! `AuctionClient` mirror trait defined in `pool/src/lib.rs`, which the
//! in-crate unit tests (mocking the auction call away entirely) can't cover.

use auction::{AuctionContract, AuctionContractClient};
use pool::{AdminOperation, FundingPool, FundingPoolClient, PoolError, ReflectorAsset, ReflectorPriceData};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    token, Address, Env, Symbol,
};

#[contract]
pub struct DummyShare;

#[contractimpl]
impl DummyShare {
    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "tot"))
            .unwrap_or(0)
    }
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
    pub fn mint(env: Env, to: Address, amount: i128) {
        let total = Self::total_supply(env.clone());
        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "tot"), &(total + amount));
        env.storage().persistent().set(&to, &(balance + amount));
    }
    pub fn burn(env: Env, from: Address, amount: i128) {
        let total = Self::total_supply(env.clone());
        let balance = Self::balance(env.clone(), from.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "tot"), &(total - amount));
        env.storage().persistent().set(&from, &(balance - amount));
    }
}

#[contract]
pub struct DummyInvoice;

#[contractimpl]
impl DummyInvoice {
    pub fn get_authorized_pool(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "pool"))
            .expect("not initialized")
    }
    pub fn set_pool(env: Env, pool: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "pool"), &pool);
    }
    pub fn is_invoice_defaulted(_env: Env, _id: u64) -> bool {
        false
    }
}

#[contract]
pub struct MockReflector;

#[contractimpl]
impl MockReflector {
    pub fn set_price(env: Env, asset: ReflectorAsset, price: i128, timestamp: u64) {
        let ReflectorAsset::Stellar(token) = asset else {
            panic!("mock only supports Stellar assets");
        };
        env.storage()
            .persistent()
            .set(&token, &ReflectorPriceData { price, timestamp });
    }
    pub fn lastprice(env: Env, asset: ReflectorAsset) -> Option<ReflectorPriceData> {
        let ReflectorAsset::Stellar(token) = asset else {
            return None;
        };
        env.storage().persistent().get(&token)
    }
}

fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

struct Fixture {
    env: Env,
    pool: FundingPoolClient<'static>,
    auction: AuctionContractClient<'static>,
    admin: Address,
    usdc_id: Address,
    xlm_id: Address,
    oracle: MockReflectorClient<'static>,
    sme: Address,
    principal: i128,
}

/// Deposits sufficient xlm collateral against a 10,000-usdc invoice (20%
/// collateral_bps, 0 threshold so it always applies) and funds it, at prices
/// (usdc=1_000_000, xlm=500_000) chosen so the required 2,000-usdc-value is
/// exactly covered by 4,000 xlm — a live ratio of exactly 10_000 bps. A 9,000
/// bps danger threshold and 86_400s grace period are configured.
fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 100_000);

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let usdc_id = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let invoice_contract = env.register(DummyInvoice, ());
    let pool_id = env.register(FundingPool, ());
    let pool = FundingPoolClient::new(&env, &pool_id);
    DummyInvoiceClient::new(&env, &invoice_contract).set_pool(&pool_id);
    let share_token = env.register(DummyShare, ());
    pool.initialize(&admin, &usdc_id, &share_token, &invoice_contract);
    pool.set_max_investor_concentration(&admin, &10_000u32);

    let xlm_admin = Address::generate(&env);
    let xlm_id = env
        .register_stellar_asset_contract_v2(xlm_admin)
        .address();
    pool.add_token(&admin, &xlm_id, &share_token);

    let oracle_id = env.register(MockReflector, ());
    let oracle = MockReflectorClient::new(&env, &oracle_id);
    pool.set_oracle_contract(&admin, &oracle_id);

    let auction_id = env.register(AuctionContract, ());
    let auction = AuctionContractClient::new(&env, &auction_id);
    pool.set_auction_contract(&admin, &auction_id);

    let delay = pool.get_operation_delay();
    let collateral_proposal =
        pool.propose_operation(&admin, &AdminOperation::SetCollateralConfig(0i128, 2_000u32));
    let risk_proposal = pool.propose_operation(
        &admin,
        &AdminOperation::SetCollateralRiskConfig(9_000u32, 86_400u64),
    );
    env.ledger().with_mut(|l| l.timestamp += delay + 1);
    pool.execute_operation(&admin, &collateral_proposal);
    pool.execute_operation(&admin, &risk_proposal);

    let investor = Address::generate(&env);
    let sme = Address::generate(&env);
    let principal: i128 = 10_000;
    let required = pool.required_collateral_for(&principal); // 2,000

    let now = env.ledger().timestamp();
    oracle.set_price(&ReflectorAsset::Stellar(usdc_id.clone()), &1_000_000i128, &now);
    oracle.set_price(&ReflectorAsset::Stellar(xlm_id.clone()), &500_000i128, &now);
    let xlm_amount = required * 2; // 4,000

    mint(&env, &usdc_id, &investor, 20_000);
    mint(&env, &xlm_id, &sme, xlm_amount);
    pool.deposit(&investor, &usdc_id, &20_000, &None);
    pool.deposit_collateral(&1u64, &sme, &xlm_id, &xlm_amount);
    pool.fund_invoice(&admin, &1u64, &principal, &sme, &(now + 10_000), &usdc_id);

    Fixture {
        env,
        pool,
        auction,
        admin: admin.clone(),
        usdc_id,
        xlm_id,
        oracle,
        sme,
        principal,
    }
}

/// Drops the xlm price 20% (ratio falls to 8,000 bps, below the 9,000 danger
/// line), flags it via check_collateral_risk, and advances past the grace
/// period with both feeds refreshed so liquidate_collateral's fresh-price
/// recheck succeeds.
fn flag_at_risk_and_advance_past_grace(f: &Fixture) {
    let now = f.env.ledger().timestamp();
    f.oracle
        .set_price(&ReflectorAsset::Stellar(f.xlm_id.clone()), &400_000i128, &now);
    f.pool.check_collateral_risk(&1u64);

    f.env.ledger().with_mut(|l| l.timestamp += 86_401);
    let now = f.env.ledger().timestamp();
    f.oracle
        .set_price(&ReflectorAsset::Stellar(f.usdc_id.clone()), &1_000_000i128, &now);
    f.oracle
        .set_price(&ReflectorAsset::Stellar(f.xlm_id.clone()), &400_000i128, &now);
}

#[test]
fn test_liquidate_collateral_consigns_to_auction_when_configured() {
    let f = setup();
    flag_at_risk_and_advance_past_grace(&f);

    f.pool.liquidate_collateral(&1u64);

    let deposit = f.pool.get_collateral_deposit(&1u64).unwrap();
    assert!(deposit.settled);
    assert!(deposit.auction_sale_id.is_some());
    let sale_id = deposit.auction_sale_id.unwrap();

    let sale = f.auction.get_sale(&sale_id).unwrap();
    assert_eq!(sale.token, f.xlm_id);
    assert_eq!(sale.amount, 4_000);
    assert_eq!(sale.proceeds_token, f.usdc_id);
    assert_eq!(sale.proceeds_recipient, f.pool.address);
    assert_eq!(sale.seller, f.pool.address);

    // The seized xlm actually moved out of pool's custody into auction's.
    let xlm_client = token::Client::new(&f.env, &f.xlm_id);
    assert_eq!(xlm_client.balance(&f.auction.address), 4_000);
    assert_eq!(xlm_client.balance(&f.pool.address), 0);
}

#[test]
fn test_take_then_settle_credits_usdc_proceeds_to_pool() {
    let f = setup();
    flag_at_risk_and_advance_past_grace(&f);
    f.pool.liquidate_collateral(&1u64);

    let sale_id = f.pool.get_collateral_deposit(&1u64).unwrap().auction_sale_id.unwrap();
    let taker = Address::generate(&f.env);
    mint(&f.env, &f.usdc_id, &taker, 10_000);

    let price_before = f.auction.current_sale_price(&sale_id);
    f.auction.take_collateral_sale(&taker, &sale_id);

    // Keeper receives the xlm, pool's raw usdc balance grows by the price —
    // but pool_value accounting isn't touched yet (matches the existing,
    // separately-tested fact that a raw transfer into pool doesn't
    // auto-update pool_value).
    let usdc_client = token::Client::new(&f.env, &f.usdc_id);
    let pool_usdc_before = usdc_client.balance(&f.pool.address);
    assert_eq!(pool_usdc_before, price_before);
    assert_eq!(f.pool.get_token_totals(&f.usdc_id).pool_value, 20_000);

    f.pool.settle_liquidation_sale(&1u64);

    assert_eq!(
        f.pool.get_token_totals(&f.usdc_id).pool_value,
        20_000 + price_before,
    );
    assert!(f.pool.get_collateral_deposit(&1u64).unwrap().auction_sale_id.is_none());

    // Idempotent: a second call finds nothing pending.
    let result = f.pool.try_settle_liquidation_sale(&1u64);
    assert_eq!(result, Err(Ok(PoolError::NoPendingLiquidationSale)));
}

#[test]
fn test_reclaim_expired_sale_then_settle_credits_collateral_token() {
    let f = setup();
    flag_at_risk_and_advance_past_grace(&f);
    f.pool.liquidate_collateral(&1u64);

    let sale_id = f.pool.get_collateral_deposit(&1u64).unwrap().auction_sale_id.unwrap();

    // No taker before the 24h auction window elapses.
    f.env.ledger().with_mut(|l| l.timestamp += 86_401);
    let keeper = Address::generate(&f.env);
    f.auction.reclaim_expired_sale(&keeper, &sale_id);

    let xlm_client = token::Client::new(&f.env, &f.xlm_id);
    assert_eq!(xlm_client.balance(&f.pool.address), 4_000);
    assert_eq!(f.pool.get_token_totals(&f.xlm_id).pool_value, 0);

    f.pool.settle_liquidation_sale(&1u64);

    assert_eq!(f.pool.get_token_totals(&f.xlm_id).pool_value, 4_000);
    assert!(f.pool.get_collateral_deposit(&1u64).unwrap().auction_sale_id.is_none());
}

#[test]
fn test_settle_liquidation_sale_rejected_while_sale_still_open() {
    let f = setup();
    flag_at_risk_and_advance_past_grace(&f);
    f.pool.liquidate_collateral(&1u64);

    let result = f.pool.try_settle_liquidation_sale(&1u64);
    assert_eq!(result, Err(Ok(PoolError::LiquidationSaleNotSettled)));
}

#[test]
fn test_settle_liquidation_sale_rejected_with_nothing_pending() {
    let f = setup();
    let result = f.pool.try_settle_liquidation_sale(&1u64);
    assert_eq!(result, Err(Ok(PoolError::NoPendingLiquidationSale)));
    // Silence unused-field warnings for fields only some tests in this file need.
    let _ = (&f.admin, f.principal, &f.sme);
}
