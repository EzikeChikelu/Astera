use soroban_sdk::{panic_with_error, token, Address, Env, IntoVal, Symbol, Vec};

use crate::{
    errors::TrancheError,
    events::{EVT, WITHDRAW},
    state::{DataKey, InvestorPosition, TrancheAccounting, TrancheClass, TranchePool},
};

pub fn withdraw(env: &Env, investor: Address, token: Address, tranche: TrancheClass, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TrancheError::InvalidAmount);
    }

    investor.require_auth();

    let mut pool: TranchePool = env
        .storage()
        .instance()
        .get(&DataKey::Pool(token.clone()))
        .unwrap_or_else(|| panic_with_error!(env, TrancheError::PoolNotFound));

    let key = DataKey::Investor(investor.clone(), token.clone(), tranche);

    let mut position: InvestorPosition = env.storage().instance().get(&key).unwrap_or_default();

    if position.shares < amount {
        panic_with_error!(env, TrancheError::InsufficientBalance);
    }

    match tranche {
        TrancheClass::Senior => {
            update_accounting(env, &mut pool.senior, amount);
        }
        TrancheClass::Junior => {
            update_accounting(env, &mut pool.junior, amount);
        }
    }

    position.shares -= amount;
    position.deposited -= amount;

    let share_token = match tranche {
        TrancheClass::Senior => pool.senior_share_token.clone(),
        TrancheClass::Junior => pool.junior_share_token.clone(),
    };

    let token_client = token::Client::new(&env, &token);
    token_client.transfer(&env.current_contract_address(), &investor, &amount);

    env.storage().instance().set(&key, &position);
    env.storage()
        .instance()
        .set(&DataKey::Pool(token.clone()), &pool);

    let mut burn_args = Vec::new(env);
    burn_args.push_back(investor.clone().into_val(env));
    burn_args.push_back(amount.into_val(env));
    let _: () = env.invoke_contract(&share_token, &Symbol::new(env, "burn"), burn_args);

    env.events()
        .publish((EVT, WITHDRAW), (investor, token, tranche, amount));
}

fn update_accounting(env: &Env, accounting: &mut TrancheAccounting, amount: i128) {
    if accounting.available < amount {
        panic_with_error!(env, TrancheError::InsufficientBalance);
    }

    accounting.available -= amount;
    accounting.deposited -= amount;
}
