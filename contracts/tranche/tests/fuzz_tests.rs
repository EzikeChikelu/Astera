#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::Env;
use tranche::math::{calculate_loss_allocation, calculate_waterfall_split};

const YEAR_SECS: u64 = 365 * 24 * 60 * 60;

// ── dust / rounding boundary tests ──────────────────────────────────────────

#[test]
fn test_waterfall_split_dust_total_due() {
    let env = Env::default();
    // 1-unit total_due: all goes to senior, junior gets 0
    let (s, j) = calculate_waterfall_split(&env, 1, 1_000_000, 1000, YEAR_SECS);
    assert_eq!(s, 1);
    assert_eq!(j, 0);
}

#[test]
fn test_waterfall_split_elapsed_secs_one() {
    let env = Env::default();
    // elapsed_secs = 1: interest rounds to 0 for typical principals, senior_cap == principal
    let (s, j) = calculate_waterfall_split(&env, 2_000, 1_000, 1000, 1);
    // interest = 1000 * 1000 * 1 / 10_000 / 31_536_000 = 0
    assert_eq!(s, 1_000);
    assert_eq!(j, 1_000);
}

#[test]
fn test_waterfall_split_total_due_one_below_cap() {
    let env = Env::default();
    // senior_cap = 1100 (1000 principal + 10% for 1 year); total_due = 1099
    let (s, j) = calculate_waterfall_split(&env, 1_099, 1_000, 1000, YEAR_SECS);
    assert_eq!(s, 1_099);
    assert_eq!(j, 0);
}

#[test]
fn test_waterfall_split_total_due_one_above_cap() {
    let env = Env::default();
    // total_due = 1101, cap = 1100
    let (s, j) = calculate_waterfall_split(&env, 1_101, 1_000, 1000, YEAR_SECS);
    assert_eq!(s, 1_100);
    assert_eq!(j, 1);
}

#[test]
fn test_loss_allocation_dust_shortfall() {
    // 1-unit shortfall, junior has plenty
    let (jl, sl) = calculate_loss_allocation(1, 1_000_000);
    assert_eq!(jl, 1);
    assert_eq!(sl, 0);
}

#[test]
fn test_loss_allocation_shortfall_one_above_junior() {
    // shortfall = junior + 1: junior wiped, senior takes 1
    let (jl, sl) = calculate_loss_allocation(101, 100);
    assert_eq!(jl, 100);
    assert_eq!(sl, 1);
}

#[test]
fn test_loss_allocation_shortfall_one_below_junior() {
    // shortfall = junior - 1: junior absorbs all, senior untouched
    let (jl, sl) = calculate_loss_allocation(99, 100);
    assert_eq!(jl, 99);
    assert_eq!(sl, 0);
}

// ── property tests ───────────────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(500))]

    /// senior_amount + junior_amount == total_due for all inputs
    #[test]
    fn prop_waterfall_split_sum_invariant(
        total_due in 0i128..1_000_000_000i128,
        senior_principal in 1i128..500_000_000i128,
        yield_bps in 0u32..5_000u32,
        elapsed in 1u64..YEAR_SECS * 5,
    ) {
        let env = Env::default();
        let (s, j) = calculate_waterfall_split(&env, total_due, senior_principal, yield_bps, elapsed);
        prop_assert_eq!(s + j, total_due, "sum must equal total_due");
    }

    /// senior_amount never exceeds the computed cap
    #[test]
    fn prop_waterfall_split_senior_never_exceeds_cap(
        total_due in 0i128..1_000_000_000i128,
        senior_principal in 1i128..500_000_000i128,
        yield_bps in 0u32..5_000u32,
        elapsed in 1u64..YEAR_SECS * 5,
    ) {
        let env = Env::default();
        let interest = senior_principal * yield_bps as i128 * elapsed as i128
            / 10_000
            / YEAR_SECS as i128;
        let cap = senior_principal + interest;
        let (s, _) = calculate_waterfall_split(&env, total_due, senior_principal, yield_bps, elapsed);
        prop_assert!(s <= cap, "senior {} must not exceed cap {}", s, cap);
    }

    /// senior_amount is monotonically non-decreasing in total_due
    #[test]
    fn prop_waterfall_split_monotonic_senior(
        lower in 0i128..500_000_000i128,
        delta in 0i128..500_000_000i128,
        senior_principal in 1i128..500_000_000i128,
        yield_bps in 0u32..5_000u32,
        elapsed in 1u64..YEAR_SECS * 5,
    ) {
        let env = Env::default();
        let higher = lower + delta;
        let (s_low, _) = calculate_waterfall_split(&env, lower, senior_principal, yield_bps, elapsed);
        let (s_high, _) = calculate_waterfall_split(&env, higher, senior_principal, yield_bps, elapsed);
        prop_assert!(s_high >= s_low, "senior must be non-decreasing in total_due");
    }

    /// junior_loss + senior_loss == shortfall for all inputs
    #[test]
    fn prop_loss_allocation_sum_invariant(
        shortfall in 0i128..1_000_000_000i128,
        junior_remaining in 0i128..1_000_000_000i128,
    ) {
        let (jl, sl) = calculate_loss_allocation(shortfall, junior_remaining);
        prop_assert_eq!(jl + sl, shortfall, "loss sum must equal shortfall");
    }

    /// junior absorbs first; senior_loss > 0 only when junior is exhausted
    #[test]
    fn prop_loss_allocation_junior_first(
        shortfall in 0i128..1_000_000_000i128,
        junior_remaining in 0i128..1_000_000_000i128,
    ) {
        let (jl, sl) = calculate_loss_allocation(shortfall, junior_remaining);
        if shortfall <= junior_remaining {
            prop_assert_eq!(sl, 0, "senior must take no loss when junior covers shortfall");
        } else {
            prop_assert_eq!(jl, junior_remaining, "junior must be fully wiped before senior takes loss");
        }
    }

    /// junior_loss never exceeds junior_remaining
    #[test]
    fn prop_loss_allocation_junior_loss_bounded(
        shortfall in 0i128..1_000_000_000i128,
        junior_remaining in 0i128..1_000_000_000i128,
    ) {
        let (jl, _) = calculate_loss_allocation(shortfall, junior_remaining);
        prop_assert!(jl <= junior_remaining, "junior loss {} must not exceed junior_remaining {}", jl, junior_remaining);
    }
}
