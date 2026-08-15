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

#[test]
fn test_screener_can_audit_own_submissions() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);

    let subject1 = Address::generate(&env);
    let subject2 = Address::generate(&env);
    let subject3 = Address::generate(&env);

    // Screener submits results for multiple subjects
    client.submit_screening_result(
        &screener,
        &subject1,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "ok1"),
    );

    client.submit_screening_result(
        &screener,
        &subject2,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + 2000),
        &String::from_str(&env, "sanctions"),
    );

    client.submit_screening_result(
        &screener,
        &subject3,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Medium,
        &(1_000_000u64 + 3000),
        &String::from_str(&env, "ok2"),
    );

    // Screener can retrieve their own submission history
    let submissions = client.get_screener_submissions(&screener);
    assert_eq!(submissions.len(), 3);

    // Verify entries are in order (most recent last)
    let sub1 = submissions.get(0).unwrap();
    assert_eq!(sub1.subject_address, subject1);
    assert_eq!(sub1.status, ComplianceStatus::Cleared);
    assert_eq!(sub1.risk_tier, RiskTier::Low);

    let sub2 = submissions.get(1).unwrap();
    assert_eq!(sub2.subject_address, subject2);
    assert_eq!(sub2.status, ComplianceStatus::Flagged);
    assert_eq!(sub2.risk_tier, RiskTier::High);
    assert_eq!(sub2.reason_code, 42);

    let sub3 = submissions.get(2).unwrap();
    assert_eq!(sub3.subject_address, subject3);
    assert_eq!(sub3.status, ComplianceStatus::Cleared);
    assert_eq!(sub3.risk_tier, RiskTier::Medium);
}

#[test]
fn test_request_review_tracked_in_caller_submissions() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let target = Address::generate(&env);
    let monitor = Address::generate(&env);

    client.submit_screening_result(
        &admin,
        &target,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 99_999),
        &String::from_str(&env, "ok"),
    );

    // Monitor requests review
    client.request_review(&monitor, &target, &String::from_str(&env, "alert"));

    // Monitor can see their submission history
    let submissions = client.get_screener_submissions(&monitor);
    assert_eq!(submissions.len(), 1);
    let sub = submissions.get(0).unwrap();
    assert_eq!(sub.subject_address, target);
    assert_eq!(sub.status, ComplianceStatus::PendingReview);
    assert_eq!(sub.notes_hash, String::from_str(&env, "alert"));
}

#[test]
fn test_screener_submissions_empty_for_new_screener() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);

    // New screener has empty submission history
    let submissions = client.get_screener_submissions(&screener);
    assert_eq!(submissions.len(), 0);
}

#[test]
fn test_rescreening_interval_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);

    let subject = Address::generate(&env);

    // First screening succeeds
    client.submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "ok"),
    );

    // Attempt to rescreen immediately fails (default interval is 180 days)
    let too_soon = client.try_submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + 2000),
        &String::from_str(&env, "sanctions"),
    );
    assert_eq!(too_soon, Err(Ok(ComplianceError::RescreeningTooSoon)));

    // Advance time past the rescreening interval
    let interval = client.get_rescreening_interval();
    env.ledger()
        .with_mut(|l| l.timestamp = 1_000_000 + interval + 1);

    // Rescreening after interval succeeds
    client.submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + interval + 2000),
        &String::from_str(&env, "sanctions"),
    );
}

#[test]
fn test_different_screeners_can_screen_same_subject() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener1 = Address::generate(&env);
    let screener2 = Address::generate(&env);
    client.register_screener(&admin, &screener1);
    client.register_screener(&admin, &screener2);

    let subject = Address::generate(&env);

    // Screener1 screens the subject
    client.submit_screening_result(
        &screener1,
        &subject,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "ok1"),
    );

    // Screener2 can screen the same subject immediately (different screener)
    client.submit_screening_result(
        &screener2,
        &subject,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + 2000),
        &String::from_str(&env, "sanctions"),
    );
}

#[test]
fn test_custom_rescreening_interval() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    client.set_screener_timelock(&admin, &0u64);
    let screener = Address::generate(&env);
    client.register_screener(&admin, &screener);

    // Set custom short interval (1 hour = 3600 seconds)
    client.set_rescreening_interval(&admin, &3600u64);

    let subject = Address::generate(&env);

    // First screening
    client.submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Cleared,
        &0u32,
        &RiskTier::Low,
        &(1_000_000u64 + 1000),
        &String::from_str(&env, "ok"),
    );

    // Attempt to rescreen before custom interval fails
    let too_soon = client.try_submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + 2000),
        &String::from_str(&env, "sanctions"),
    );
    assert_eq!(too_soon, Err(Ok(ComplianceError::RescreeningTooSoon)));

    // Advance past custom interval
    env.ledger()
        .with_mut(|l| l.timestamp = 1_000_000 + 3600 + 1);

    // Rescreening succeeds
    client.submit_screening_result(
        &screener,
        &subject,
        &ComplianceStatus::Flagged,
        &42u32,
        &RiskTier::High,
        &(1_000_000u64 + 3600 + 2000),
        &String::from_str(&env, "sanctions"),
    );
}

// ── #926: reducing screener timelock must not unlock pending registrations ───

#[test]
fn test_reducing_timelock_does_not_shorten_pending_registration() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let screener = Address::generate(&env);

    // Default 24h timelock; register freezes effective_at = now + 86400.
    client.register_screener(&admin, &screener);
    assert!(!client.is_screener(&screener));

    // Admin shortens (or zeros) the configured timelock mid-flight.
    client.set_screener_timelock(&admin, &0u64);
    assert_eq!(client.get_screener_timelock(), 0u64);

    // Still before the *original* effective_at — confirm must fail.
    env.ledger().with_mut(|l| l.timestamp = 1_000_000 + 3_600);
    let too_soon = client.try_confirm_screener_registration(&admin, &screener);
    assert_eq!(too_soon, Err(Ok(ComplianceError::ScreenerTimelockActive)));
    assert!(!client.is_screener(&screener));

    // After original 24h window, confirm succeeds.
    env.ledger().with_mut(|l| l.timestamp = 1_000_000 + 86_400);
    client.confirm_screener_registration(&admin, &screener);
    assert!(client.is_screener(&screener));
}

#[test]
fn test_re_register_while_pending_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let screener = Address::generate(&env);

    client.register_screener(&admin, &screener);
    // Lower timelock then try to re-register — must not overwrite frozen effective_at
    // or instantly activate with the new (zero) timelock.
    client.set_screener_timelock(&admin, &0u64);
    let again = client.try_register_screener(&admin, &screener);
    assert_eq!(again, Err(Ok(ComplianceError::ScreenerAlreadyRegistered)));
    assert!(!client.is_screener(&screener));

    // Original commitment still governs confirm.
    env.ledger().with_mut(|l| l.timestamp = 1_000_000 + 1);
    let early = client.try_confirm_screener_registration(&admin, &screener);
    assert_eq!(early, Err(Ok(ComplianceError::ScreenerTimelockActive)));
}

#[test]
fn test_reducing_timelock_only_affects_future_registrations() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);
    let pending = Address::generate(&env);
    let fresh = Address::generate(&env);

    client.register_screener(&admin, &pending);
    client.set_screener_timelock(&admin, &3_600u64);

    // New registration uses the shortened 1h timelock.
    client.register_screener(&admin, &fresh);
    env.ledger().with_mut(|l| l.timestamp = 1_000_000 + 3_600);
    client.confirm_screener_registration(&admin, &fresh);
    assert!(client.is_screener(&fresh));

    // Original pending still needs the full original 24h.
    let still_pending = client.try_confirm_screener_registration(&admin, &pending);
    assert_eq!(
        still_pending,
        Err(Ok(ComplianceError::ScreenerTimelockActive))
    );
}
