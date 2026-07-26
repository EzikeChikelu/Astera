#![cfg(test)]

use referral::{ReferralContract, ReferralContractClient, ReferralError};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, Symbol,
};

fn setup(env: &Env) -> (ReferralContractClient<'_>, Address, Address) {
    env.ledger().with_mut(|l| l.timestamp = 1_000_000);
    let contract_id = env.register(ReferralContract, ());
    let client = ReferralContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let pool = Address::generate(env);
    client.initialize(&admin, &pool);
    (client, admin, pool)
}

fn setup_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

#[test]
fn test_register_sets_referrer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);

    client.register(&referee, &referrer);

    assert_eq!(client.get_referrer(&referee), Some(referrer));
}

#[test]
fn test_register_rejects_self_referral() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _pool) = setup(&env);
    let referee = Address::generate(&env);

    let result = client.try_register(&referee, &referee);
    assert_eq!(
        result,
        Err(Ok::<soroban_sdk::Error, _>(ReferralError::SelfReferral.into()))
    );
}

#[test]
fn test_register_cannot_change_referrer() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer_a = Address::generate(&env);
    let referrer_b = Address::generate(&env);

    client.register(&referee, &referrer_a);
    let result = client.try_register(&referee, &referrer_b);

    assert_eq!(
        result,
        Err(Ok::<soroban_sdk::Error, _>(
            ReferralError::AlreadyRegistered.into()
        ))
    );
    assert_eq!(client.get_referrer(&referee), Some(referrer_a));
}

#[test]
fn test_record_activity_rejects_non_pool_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    let attacker = Address::generate(&env);
    let result = client.try_record_activity(
        &attacker,
        &referee,
        &Symbol::new(&env, "borrow"),
        &1_000i128,
        &token,
    );
    assert_eq!(
        result,
        Err(Ok::<soroban_sdk::Error, _>(ReferralError::Unauthorized.into()))
    );
}

#[test]
fn test_record_activity_no_referrer_returns_zero_reward() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let token = setup_token(&env);

    let reward = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "borrow"),
        &1_000i128,
        &token,
    );
    assert_eq!(reward, 0);
}

#[test]
fn test_record_activity_activates_on_zero_fee_first_deposit() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    // A $0-fee first deposit still activates (counts) the referral, even
    // though it earns no reward (no yield fee to share yet).
    let reward = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "deposit"),
        &0i128,
        &token,
    );
    assert_eq!(reward, 0);
    assert_eq!(client.get_stats(&referrer).referral_count, 1);
    assert_eq!(client.get_pending_reward(&referrer, &token), 0);
}

#[test]
fn test_record_activity_credits_borrow_reward_and_activates_once() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    // Default borrow bps is 500 (5%): 5% of 1_000_0000000 = 50_0000000.
    let reward1 = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "borrow"),
        &1_000_0000000i128,
        &token,
    );
    assert_eq!(reward1, 50_0000000i128);
    assert_eq!(client.get_stats(&referrer).referral_count, 1);
    assert_eq!(
        client.get_pending_reward(&referrer, &token),
        50_0000000i128
    );

    // A second qualifying activity accrues more reward but does not bump
    // referral_count again (activation is a one-time event).
    let reward2 = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "borrow"),
        &200_0000000i128,
        &token,
    );
    assert_eq!(reward2, 10_0000000i128);
    assert_eq!(client.get_stats(&referrer).referral_count, 1);
    assert_eq!(
        client.get_pending_reward(&referrer, &token),
        60_0000000i128
    );
}

#[test]
fn test_record_activity_uses_deposit_bps_for_deposit_kind() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    // Default deposit bps is 1_000 (10%): 10% of 500_0000000 = 50_0000000.
    let reward = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "deposit"),
        &500_0000000i128,
        &token,
    );
    assert_eq!(reward, 50_0000000i128);
}

#[test]
fn test_admin_can_configure_reward_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    client.set_borrow_reward_bps(&admin, &1_000u32); // 10%
    assert_eq!(client.get_borrow_reward_bps(), 1_000u32);

    let reward = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "borrow"),
        &1_000_0000000i128,
        &token,
    );
    assert_eq!(reward, 100_0000000i128);
}

#[test]
fn test_set_reward_bps_above_max_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _pool) = setup(&env);

    let result = client.try_set_borrow_reward_bps(&admin, &10_001u32);
    assert_eq!(
        result,
        Err(Ok::<soroban_sdk::Error, _>(ReferralError::InvalidBps.into()))
    );
}

#[test]
fn test_claim_rewards_transfers_token_and_resets_pending() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);
    client.register(&referee, &referrer);

    let reward = client.record_activity(
        &pool,
        &referee,
        &Symbol::new(&env, "borrow"),
        &1_000_0000000i128,
        &token,
    );
    // The pool is responsible for funding this contract with the reward it
    // just credited — mirror that here so claim_rewards has funds to pay out.
    mint(&env, &token, &client.address, reward);

    let token_client = token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&referrer), 0);

    let claimed = client.claim_rewards(&referrer, &token);
    assert_eq!(claimed, reward);
    assert_eq!(token_client.balance(&referrer), reward);
    assert_eq!(client.get_pending_reward(&referrer, &token), 0);

    // Claiming again with nothing pending is a harmless no-op.
    assert_eq!(client.claim_rewards(&referrer, &token), 0);
}

#[test]
fn test_pause_blocks_register_and_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _pool) = setup(&env);
    let referee = Address::generate(&env);
    let referrer = Address::generate(&env);
    let token = setup_token(&env);

    client.pause(&admin);

    let result = client.try_register(&referee, &referrer);
    assert_eq!(
        result,
        Err(Ok::<soroban_sdk::Error, _>(
            ReferralError::ContractPaused.into()
        ))
    );

    let claim_result = client.try_claim_rewards(&referrer, &token);
    assert_eq!(
        claim_result,
        Err(Ok::<soroban_sdk::Error, _>(
            ReferralError::ContractPaused.into()
        ))
    );
}
