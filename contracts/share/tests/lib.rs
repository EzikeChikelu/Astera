#![cfg(test)]

use share::{ShareToken, ShareTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup(env: &Env) -> (ShareTokenClient<'_>, Address) {
    let contract_id = env.register(ShareToken, ());
    let client = ShareTokenClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(
        &admin,
        &7u32,
        &String::from_str(env, "Pool Shares"),
        &String::from_str(env, "POOL"),
    );
    (client, admin)
}

// ── Allowance ────────────────────────────────────────────────────────────────

#[test]
fn test_approve_overwrites_existing_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);

    client.approve(&owner, &spender, &500i128);
    assert_eq!(client.allowance(&owner, &spender), 500);

    // Lower overwrite — no residual allowance that could be double-spent
    client.approve(&owner, &spender, &200i128);
    assert_eq!(client.allowance(&owner, &spender), 200);

    // Higher overwrite
    client.approve(&owner, &spender, &1_000i128);
    assert_eq!(client.allowance(&owner, &spender), 1_000);
}

#[test]
fn test_approve_zero_clears_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);

    client.approve(&owner, &spender, &300i128);
    assert_eq!(client.allowance(&owner, &spender), 300);

    client.approve(&owner, &spender, &0i128);
    assert_eq!(client.allowance(&owner, &spender), 0);
}

#[test]
fn test_allowance_for_unknown_pair_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    assert_eq!(
        client.allowance(&Address::generate(&env), &Address::generate(&env)),
        0
    );
}

#[test]
fn test_multiple_spenders_track_allowances_independently() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender_a = Address::generate(&env);
    let spender_b = Address::generate(&env);

    client.mint(&owner, &1_000i128);
    client.approve(&owner, &spender_a, &300i128);
    client.approve(&owner, &spender_b, &400i128);

    let recipient = Address::generate(&env);
    client.transfer_from(&spender_a, &owner, &recipient, &100i128);

    // spender_b's allowance must be unaffected
    assert_eq!(client.allowance(&owner, &spender_a), 200);
    assert_eq!(client.allowance(&owner, &spender_b), 400);
}

// ── transfer_from edge cases ─────────────────────────────────────────────────

#[test]
#[should_panic(expected = "insufficient balance")]
fn test_transfer_from_sufficient_allowance_insufficient_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Allowance is generous but owner only holds 50 tokens
    client.mint(&owner, &50i128);
    client.approve(&owner, &spender, &200i128);
    client.transfer_from(&spender, &owner, &recipient, &100i128);
}

#[test]
fn test_transfer_from_to_self_preserves_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let addr = Address::generate(&env);

    client.mint(&addr, &500i128);
    // Approve self as spender
    client.approve(&addr, &addr, &200i128);
    client.transfer_from(&addr, &addr, &addr, &100i128);

    assert_eq!(client.balance(&addr), 500);
    assert_eq!(client.allowance(&addr, &addr), 100);
    assert_eq!(client.total_supply(), 500);
}

#[test]
fn test_transfer_from_reduces_allowance_exactly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    client.mint(&owner, &1_000i128);
    client.approve(&owner, &spender, &400i128);
    client.transfer_from(&spender, &owner, &recipient, &250i128);

    assert_eq!(client.balance(&owner), 750);
    assert_eq!(client.balance(&recipient), 250);
    assert_eq!(client.allowance(&owner, &spender), 150);
    assert_eq!(client.total_supply(), 1_000);
}

// ── Admin-only guards ────────────────────────────────────────────────────────

#[test]
fn test_burn_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let holder = Address::generate(&env);

    // Mint tokens to holder so the test isolates the auth check, not zero balance
    client.mint(&holder, &100i128);

    // Disable auth mocking — burn must fail because admin auth is not satisfied
    env.set_auths(&[]);
    let result = client.try_burn(&holder, &100i128);
    assert!(result.is_err());
}

#[test]
fn test_transfer_requires_sender_auth() {
    let env = Env::default();
    // No mock_all_auths — from.require_auth() must be satisfied explicitly.
    // initialize does not require auth, so setup still succeeds.
    let (client, _admin) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let result = client.try_transfer(&alice, &bob, &100i128);
    assert!(
        result.is_err(),
        "transfer must fail without sender authorization"
    );
}

// ── Overflow safety ──────────────────────────────────────────────────────────

#[test]
fn test_mint_large_amount_no_overflow() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let holder = Address::generate(&env);

    // i128::MAX / 2 is safely within range
    let large = i128::MAX / 2;
    client.mint(&holder, &large);
    assert_eq!(client.balance(&holder), large);
    assert_eq!(client.total_supply(), large);
}

#[test]
fn test_transfer_of_entire_large_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let large = i128::MAX / 2;
    client.mint(&alice, &large);
    client.transfer(&alice, &bob, &large);

    assert_eq!(client.balance(&alice), 0);
    assert_eq!(client.balance(&bob), large);
    assert_eq!(client.total_supply(), large);
}

#[test]
fn test_two_large_mints_total_supply_correct() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    // Each is i128::MAX / 4 so their sum won't overflow i128
    let quarter = i128::MAX / 4;
    client.mint(&alice, &quarter);
    client.mint(&bob, &quarter);

    assert_eq!(client.total_supply(), quarter * 2);
    assert_eq!(client.balance(&alice) + client.balance(&bob), quarter * 2);
}
