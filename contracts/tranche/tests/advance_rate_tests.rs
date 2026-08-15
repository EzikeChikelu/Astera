use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};
use tranche::{state::TrancheClass, TrancheContract};

#[test]
fn test_advance_rate_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let senior_share_token = Address::generate(&env);
    let junior_share_token = Address::generate(&env);

    let contract_id = env.register_contract(None, TrancheContract);

    env.as_contract(&contract_id, || {
        TrancheContract::initialize(
            env.clone(),
            admin.clone(),
            token.clone(),
            senior_share_token.clone(),
            junior_share_token.clone(),
            tranche::state::TrancheConfig {
                senior_target_yield_bps: 1000,
                senior_advance_rate_bps: 8000,
                junior_first_loss_bps: 10000,
            },
        );
    });

    env.as_contract(&contract_id, || {
        TrancheContract::open_tranche_for_token(
            env.clone(),
            admin.clone(),
            token.clone(),
            senior_share_token,
            junior_share_token,
            tranche::state::TrancheConfig {
                senior_target_yield_bps: 1000,
                senior_advance_rate_bps: 8000,
                junior_first_loss_bps: 10000,
            },
        );
    });

    let investor1 = Address::generate(&env);
    let investor2 = Address::generate(&env);

    // First, deposit junior to create capacity
    env.as_contract(&contract_id, || {
        TrancheContract::deposit_tranche(
            env.clone(),
            investor2.clone(),
            token.clone(),
            TrancheClass::Junior,
            2000,
        );
    });

    // Senior can deposit up to 80% of total (2000 junior + X senior)
    // 0.8 * (2000 + X) = X => 1600 + 0.8X = X => 1600 = 0.2X => X = 8000
    // So senior can deposit up to 8000 with 2000 junior

    // This should succeed
    env.as_contract(&contract_id, || {
        TrancheContract::deposit_tranche(
            env.clone(),
            investor1.clone(),
            token.clone(),
            TrancheClass::Senior,
            8000,
        );
    });

    // Verify the pool state
    env.as_contract(&contract_id, || {
        let pool = TrancheContract::get_pool(env.clone(), token.clone());
        assert_eq!(pool.senior.deposited, 8000);
        assert_eq!(pool.junior.deposited, 2000);
    });
}

#[test]
fn test_advance_rate_100_percent() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let senior_share_token = Address::generate(&env);
    let junior_share_token = Address::generate(&env);

    let contract_id = env.register_contract(None, TrancheContract);

    env.as_contract(&contract_id, || {
        TrancheContract::initialize(
            env.clone(),
            admin.clone(),
            token.clone(),
            senior_share_token.clone(),
            junior_share_token.clone(),
            tranche::state::TrancheConfig {
                senior_target_yield_bps: 1000,
                senior_advance_rate_bps: 10000,
                junior_first_loss_bps: 10000,
            },
        );
    });

    env.as_contract(&contract_id, || {
        TrancheContract::open_tranche_for_token(
            env.clone(),
            admin.clone(),
            token.clone(),
            senior_share_token,
            junior_share_token,
            tranche::state::TrancheConfig {
                senior_target_yield_bps: 1000,
                senior_advance_rate_bps: 10000,
                junior_first_loss_bps: 10000,
            },
        );
    });

    let investor1 = Address::generate(&env);

    // With 100% advance rate, senior can deposit without junior
    env.as_contract(&contract_id, || {
        TrancheContract::deposit_tranche(
            env.clone(),
            investor1.clone(),
            token.clone(),
            TrancheClass::Senior,
            10000,
        );
    });

    env.as_contract(&contract_id, || {
        let pool = TrancheContract::get_pool(env.clone(), token.clone());
        assert_eq!(pool.senior.deposited, 10000);
    });
}
