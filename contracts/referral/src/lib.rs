#![no_std]

// === AUTHORIZED CALLERS ===
// - Admin: initialize(), set_pool(), set_borrow_reward_bps(),
//   set_deposit_reward_bps(), pause()/unpause()
// - Referee (new user): register()
// - Pool contract: record_activity()
// - Referrer: claim_rewards()
// - Anyone: read-only view functions (get_stats, get_referrer, get_pending_reward)
//
// #799: on-chain referral program. A referee names their referrer once via
// register(). The pool contract calls record_activity() whenever it
// realizes a fee attributable to a referred user (a repaid invoice's
// factoring fee, or — once the pool has a yield fee to share — a deposit),
// which both activates the referral (counted once) and credits the
// referrer's pending reward. Referrers withdraw accrued rewards via
// claim_rewards(); the pool contract is responsible for actually
// transferring each reward amount to this contract at the moment it's
// credited (see record_activity's return value).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Symbol,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = LEDGERS_PER_DAY * 30;
const INSTANCE_LIFETIME_THRESHOLD: u32 = LEDGERS_PER_DAY * 7;
const REGISTRY_TTL: u32 = LEDGERS_PER_DAY * 365;

const BPS_DENOM: i128 = 10_000;
const MAX_BPS: u32 = 10_000;
/// Referee borrows: referrer earns 5% of factoring fees from their invoices.
const DEFAULT_BORROW_REWARD_BPS: u32 = 500;
/// Referee deposits: referrer earns 10% of the yield fee from their deposits.
const DEFAULT_DEPOSIT_REWARD_BPS: u32 = 1_000;

const EVT: Symbol = symbol_short!("REFERRAL");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReferralError {
    AlreadyInitialized = 0,
    Unauthorized = 1,
    AlreadyRegistered = 2,
    SelfReferral = 3,
    InvalidBps = 4,
    ContractPaused = 5,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ReferralStats {
    pub referrer: Address,
    pub referral_count: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Pool,
    Initialized,
    Paused,
    BorrowRewardBps,
    DepositRewardBps,
    /// referee -> referrer
    Referrer(Address),
    /// referee -> has earned at least one reward yet (locks referrer, and
    /// gates the one-time ReferralCount increment)
    Activated(Address),
    /// (referrer, token) -> unclaimed reward balance
    PendingReward(Address, Address),
    /// referrer -> number of referees who have completed a qualifying
    /// activity
    ReferralCount(Address),
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn require_not_paused(env: &Env) {
    if env
        .storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Paused)
        .unwrap_or(false)
    {
        panic_with_error!(env, ReferralError::ContractPaused);
    }
}

fn require_admin(env: &Env, admin: &Address) {
    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized");
    if admin != &stored_admin {
        panic_with_error!(env, ReferralError::Unauthorized);
    }
}

#[contract]
pub struct ReferralContract;

#[contractimpl]
impl ReferralContract {
    pub fn initialize(env: Env, admin: Address, pool: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, ReferralError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .set(&DataKey::BorrowRewardBps, &DEFAULT_BORROW_REWARD_BPS);
        env.storage()
            .instance()
            .set(&DataKey::DepositRewardBps, &DEFAULT_DEPOSIT_REWARD_BPS);
        bump_instance(&env);
    }

    pub fn pause(env: Env, admin: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        env.storage().instance().set(&DataKey::Paused, &true);
        bump_instance(&env);
        env.events().publish((EVT, symbol_short!("paused")), admin);
    }

    pub fn unpause(env: Env, admin: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&env);
        env.events()
            .publish((EVT, symbol_short!("unpaused")), admin);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<DataKey, bool>(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Update the pool contract address authorized to call record_activity().
    pub fn set_pool(env: Env, admin: Address, pool: Address) {
        admin.require_auth();
        require_admin(&env, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        bump_instance(&env);
        env.events()
            .publish((EVT, symbol_short!("pool_set")), (admin, pool));
    }

    pub fn get_pool(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized")
    }

    /// Admin-configurable share (bps) of the factoring fee a referrer earns
    /// when their referee's invoice is repaid.
    pub fn set_borrow_reward_bps(env: Env, admin: Address, bps: u32) {
        admin.require_auth();
        require_admin(&env, &admin);
        if bps > MAX_BPS {
            panic_with_error!(&env, ReferralError::InvalidBps);
        }
        env.storage()
            .instance()
            .set(&DataKey::BorrowRewardBps, &bps);
        bump_instance(&env);
        env.events()
            .publish((EVT, symbol_short!("brw_bps")), (admin, bps));
    }

    /// Admin-configurable share (bps) of the yield fee a referrer earns
    /// from their referee's deposits.
    pub fn set_deposit_reward_bps(env: Env, admin: Address, bps: u32) {
        admin.require_auth();
        require_admin(&env, &admin);
        if bps > MAX_BPS {
            panic_with_error!(&env, ReferralError::InvalidBps);
        }
        env.storage()
            .instance()
            .set(&DataKey::DepositRewardBps, &bps);
        bump_instance(&env);
        env.events()
            .publish((EVT, symbol_short!("dep_bps")), (admin, bps));
    }

    pub fn get_borrow_reward_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::BorrowRewardBps)
            .unwrap_or(DEFAULT_BORROW_REWARD_BPS)
    }

    pub fn get_deposit_reward_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::DepositRewardBps)
            .unwrap_or(DEFAULT_DEPOSIT_REWARD_BPS)
    }

    /// Register `referrer` as the caller's referrer. Callable once per
    /// referee — the referrer cannot be changed afterwards (#799).
    pub fn register(env: Env, referee: Address, referrer: Address) {
        referee.require_auth();
        require_not_paused(&env);
        if referee == referrer {
            panic_with_error!(&env, ReferralError::SelfReferral);
        }
        let key = DataKey::Referrer(referee.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, ReferralError::AlreadyRegistered);
        }
        env.storage().persistent().set(&key, &referrer);
        env.storage()
            .persistent()
            .extend_ttl(&key, REGISTRY_TTL, REGISTRY_TTL);
        bump_instance(&env);
        env.events()
            .publish((EVT, symbol_short!("registerd")), (referee, referrer));
    }

    pub fn get_referrer(env: Env, referee: Address) -> Option<Address> {
        env.storage().persistent().get(&DataKey::Referrer(referee))
    }

    /// Records a qualifying activity (`kind` is `"borrow"` or `"deposit"`)
    /// for `referee`. Callable only by the configured pool contract.
    ///
    /// On the referee's first qualifying activity this activates the
    /// referral, incrementing the referrer's `ReferralCount` exactly once.
    /// Every qualifying activity (including the first) credits the
    /// referrer's pending balance with `fee_amount * bps / 10_000` of
    /// `token`, using the borrow or deposit reward rate as appropriate.
    /// Returns the reward amount credited (0 if the referee has no
    /// referrer, or `fee_amount` is not positive) — the pool contract is
    /// expected to transfer that exact amount of `token` to this contract.
    pub fn record_activity(
        env: Env,
        caller: Address,
        referee: Address,
        kind: Symbol,
        fee_amount: i128,
        token: Address,
    ) -> i128 {
        caller.require_auth();
        require_not_paused(&env);
        let pool: Address = env
            .storage()
            .instance()
            .get(&DataKey::Pool)
            .expect("not initialized");
        if caller != pool {
            panic_with_error!(&env, ReferralError::Unauthorized);
        }
        let referrer: Address = match env
            .storage()
            .persistent()
            .get(&DataKey::Referrer(referee.clone()))
        {
            Some(r) => r,
            None => return 0,
        };

        // #799: activation (first qualifying action, counted once) happens
        // regardless of fee_amount — a $0-fee first deposit still "records
        // the referral on-chain" per the program design. Only the reward
        // accrual below is gated on there being a positive fee to share.
        let activated_key = DataKey::Activated(referee.clone());
        if !env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&activated_key)
            .unwrap_or(false)
        {
            env.storage().persistent().set(&activated_key, &true);
            env.storage()
                .persistent()
                .extend_ttl(&activated_key, REGISTRY_TTL, REGISTRY_TTL);
            let count_key = DataKey::ReferralCount(referrer.clone());
            let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
            env.storage().persistent().set(&count_key, &(count + 1));
            env.storage()
                .persistent()
                .extend_ttl(&count_key, REGISTRY_TTL, REGISTRY_TTL);
            env.events().publish(
                (EVT, symbol_short!("activatd")),
                (referee.clone(), referrer.clone()),
            );
        }

        if fee_amount <= 0 {
            return 0;
        }

        let bps: u32 = if kind == symbol_short!("borrow") {
            Self::get_borrow_reward_bps(env.clone())
        } else {
            Self::get_deposit_reward_bps(env.clone())
        };
        // #799: floor (not ceiling) — this is a payout carved out of an
        // already-collected fee, so rounding in the protocol's favor
        // (never overpaying the referrer) is the safe direction.
        let reward = fee_amount.saturating_mul(bps as i128) / BPS_DENOM;
        if reward > 0 {
            let reward_key = DataKey::PendingReward(referrer.clone(), token);
            let pending: i128 = env.storage().persistent().get(&reward_key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&reward_key, &(pending + reward));
            env.storage()
                .persistent()
                .extend_ttl(&reward_key, REGISTRY_TTL, REGISTRY_TTL);
            bump_instance(&env);
            env.events()
                .publish((EVT, symbol_short!("accrued")), (referrer, reward));
        }
        reward
    }

    pub fn get_pending_reward(env: Env, referrer: Address, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::PendingReward(referrer, token))
            .unwrap_or(0)
    }

    /// Claim all pending rewards in `token`. Requires this contract to
    /// actually hold the tokens — the pool contract transfers each
    /// referrer's cut here at the moment `record_activity` credits it.
    pub fn claim_rewards(env: Env, referrer: Address, token: Address) -> i128 {
        referrer.require_auth();
        require_not_paused(&env);
        let reward_key = DataKey::PendingReward(referrer.clone(), token.clone());
        let amount: i128 = env.storage().persistent().get(&reward_key).unwrap_or(0);
        if amount <= 0 {
            return 0;
        }
        env.storage().persistent().set(&reward_key, &0i128);
        bump_instance(&env);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &referrer, &amount);

        env.events()
            .publish((EVT, symbol_short!("claimed")), (referrer, token, amount));
        amount
    }

    pub fn get_stats(env: Env, referrer: Address) -> ReferralStats {
        let referral_count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ReferralCount(referrer.clone()))
            .unwrap_or(0);
        ReferralStats {
            referrer,
            referral_count,
        }
    }
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod test {
    // Unit tests live in tests/lifecycle_tests.rs.
}
