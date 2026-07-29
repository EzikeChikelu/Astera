use soroban_sdk::{panic_with_error, Address, Env};

use crate::{
    errors::TrancheError,
    events::{DEPOSIT, EVT},
    state::{
        DataKey, InvestorPosition, TrancheAccounting, TrancheClass, TranchePool,
    },
};

pub fn deposit(
    env: &Env,
    investor: Address,
    token: Address,
    tranche: TrancheClass,
    amount: i128,
) {
    if amount <= 0 {
        panic_with_error!(env, TrancheError::InvalidAmount);
    }

    investor.require_auth();

    let mut pool: TranchePool = env
        .storage()
        .instance()
        .get(&DataKey::Pool(token.clone()))
        .unwrap_or_else(|| panic_with_error!(env, TrancheError::PoolNotFound));

    let key = DataKey::Investor(
        investor.clone(),
        token.clone(),
        tranche,
    );

    let mut position: InvestorPosition = env
        .storage()
        .instance()
        .get(&key)
        .unwrap_or_default();

    match tranche {
        TrancheClass::Senior => {
            // Enforce senior advance rate: seniors can't exceed their configured
            // percentage of total pool value
            let new_total_deposited = pool.junior.deposited + pool.senior.deposited + amount;
            let senior_target = pool.config.senior_advance_rate_bps as i128 * new_total_deposited / 10_000;
            if pool.senior.deposited + amount > senior_target {
                panic_with_error!(env, TrancheError::AdvanceRateExceeded);
            }
            update_accounting(&mut pool.senior, amount);
        }
        TrancheClass::Junior => {
            update_accounting(&mut pool.junior, amount);
        }
    }

    position.deposited += amount;
    position.shares += amount;

    env.storage().instance().set(&key, &position);
    env.storage()
        .instance()
        .set(&DataKey::Pool(token.clone()), &pool);

    env.events().publish(
        (EVT, DEPOSIT),
        (investor, token, tranche, amount),
    );
}

fn update_accounting(
    accounting: &mut TrancheAccounting,
    amount: i128,
) {
    accounting.deposited += amount;
    accounting.available += amount;
}