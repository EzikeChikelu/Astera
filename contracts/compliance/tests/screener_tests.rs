#![cfg(test)]

use compliance::{
    ComplianceContract, ComplianceContractClient, ComplianceError, ComplianceStatus, RiskTier,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn setup(env: &Env) -> (ComplianceContractClient<'_>, Address) {
    env.ledger().with_mut(|l| l.timestamp = 1_000_000);
    let contract_id = env.register(ComplianceContract, ());
    let client = ComplianceContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

#[test]
fn test_screener_registration_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let screener = Address::generate(&env);

    // Default timelock is 24h.
    client.register_screener(&admin, &screener);
    assert!(!client.is_screener(&screener));

    // Confirm before timelock fails.
    let too_soon = client.try_confirm_screener_registration(&admin, &screener);
    assert_eq!(too_soon, Err(Ok(ComplianceError::ScreenerTimelockActive)));

    env.ledger().with_mut(|l| l.timestamp = 1_000_000 + 86_400);
    client.confirm_screener_registration(&admin, &screener);
    assert!(client.is_screener(&screener));

    let list = client.list_screeners();
    assert_eq!(list.len(), 1);
    assert_eq!(list.get(0).unwrap(), screener);
}

#[test]
fn test_zero_timelock_registers_immediately() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);

    client.register_screener(&admin, &screener);
    assert!(client.is_screener(&screener));
}

#[test]
fn test_only_screener_or_admin_can_submit() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    let stranger = Address::generate(&env);
    let target = Address::generate(&env);
    client.register_screener(&admin, &screener);

    let denied = client.try_submit_screening_result(
        &stranger,
        &target,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "x"),
    );
    assert_eq!(denied, Err(Ok(ComplianceError::Unauthorized)));

    client.submit_screening_result(
        &screener,
        &target,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "ok"),
    );
    assert!(client.is_cleared(&target));
}

#[test]
fn test_deregister_screener() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);
    assert!(client.is_screener(&screener));

    client.deregister_screener(&admin, &screener);
    assert!(!client.is_screener(&screener));
    assert_eq!(client.list_screeners().len(), 0);
}

#[test]
fn test_cancel_pending_screener_via_deregister() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);
    assert!(!client.is_screener(&screener));

    client.deregister_screener(&admin, &screener);
    let confirm = client.try_confirm_screener_registration(&admin, &screener);
    assert_eq!(confirm, Err(Ok(ComplianceError::NoPendingScreener)));
}

#[test]
fn test_double_register_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);
    let again = client.try_register_screener(&admin, &screener);
    assert_eq!(again, Err(Ok(ComplianceError::ScreenerAlreadyRegistered)));
}

#[test]
fn test_request_review_no_screener_privilege_needed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let target = Address::generate(&env);
    let anyone = Address::generate(&env);

    client.submit_screening_result(
        &admin,
        &target,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 99_999),
        &String::from_str(&env, "ok"),
    );

    // Monitor / anyone can request review without being a screener.
    client.request_review(&anyone, &target, &String::from_str(&env, "alert"));
    assert!(!client.is_cleared(&target));
}
