#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Map, Vec};

// ── Constants ─────────────────────────────────────────────────────────────────
const CREDIT_SCORE_MULTIPLIER: u32 = 10; // weight per credit-score point

// ── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AuctionStatus {
    Open,
    Clearing,
    Settled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FundingAuction {
    pub round_id: u64,
    pub token: Address,
    pub available_liquidity_snapshot: i128,
    pub opened_at: u64,
    pub bid_window_secs: u64,
    pub status: AuctionStatus,
    pub clearing_discount_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct InvoiceBid {
    pub invoice_id: u64,
    pub sme: Address,
    pub principal: i128,
    pub max_discount_bps: u32,
    pub min_priority_score: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Allocation {
    pub invoice_id: u64,
    pub allocated_amount: i128,
    pub clearing_discount_bps: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AuctionError {
    AlreadyInitialized = 0,
    NotInitialized = 1,
    Unauthorized = 2,
    RoundNotFound = 3,
    RoundNotOpen = 4,
    RoundAlreadySettled = 5,
    BidWindowExpired = 6,
    InvoiceNotVerified = 7,
    InvoiceAlreadyBid = 8,
    DiscountTooHigh = 9,
    NoBids = 10,
    InsufficientLiquidity = 11,
    AllocationOverflow = 12,
    RoundNotClearing = 13,
    PoolCallFailed = 14,
}

// ── Clearing Algorithm (pure function) ────────────────────────────────────────

/// Rank bids by composite score: effective_priority = max_discount_bps * (1 + credit_score * CREDIT_SCORE_MULTIPLIER / 10000).
/// This weights discount offers by creditworthiness:
/// a high-score SME's smaller discount can outrank a low-score SME's larger one.
fn composite_score(max_discount_bps: u32, credit_score: u32) -> u128 {
    let discount_weight = max_discount_bps as u128;
    let score_weight = (credit_score as u128)
        .saturating_mul(CREDIT_SCORE_MULTIPLIER as u128)
        .saturating_mul(discount_weight)
        / 10_000;
    discount_weight.saturating_add(score_weight)
}

/// Clear a set of bids against an available liquidity pool.
/// Returns a vec of allocations, each with the uniform clearing discount.
///
/// Algorithm:
/// 1. Compute composite score for each bid (discount × credit-score multiplier).
/// 2. Sort descending by composite score (deterministic tie-break: lower invoice_id first).
/// 3. Greedily allocate liquidity down the ranked list.
/// 4. Compute uniform clearing discount = max_discount_bps of the lowest-ranked funded bid.
/// 5. If insufficient liquidity for the marginal invoice, either allocate partially
///    if remaning liquidity > 0, or skip to the next invoice that fits.
pub fn clear_auction(
    bids: Vec<InvoiceBid>,
    available_liquidity: i128,
    credit_scores: Map<Address, u32>,
) -> Vec<Allocation> {
    let env = bids.env();
    let mut result: Vec<Allocation> = Vec::new(env);

    if available_liquidity <= 0 || bids.is_empty() {
        return result;
    }

    // Compute scores and create ranked list
    // Stores (composite_score, max_discount_bps, invoice_id, principal, sme)
    let mut scored: Vec<(u128, u32, u64, i128, Address)> = Vec::new(env);
    for i in 0..bids.len() {
        let bid = bids.get(i).unwrap();
        let cs = credit_scores.get(bid.sme.clone()).unwrap_or(0);
        let score = composite_score(bid.max_discount_bps, cs);
        scored.push_back((
            score,
            bid.max_discount_bps,
            bid.invoice_id,
            bid.principal,
            bid.sme,
        ));
    }

    // Sort descending by score, tie-break by invoice_id ascending
    let mut sorted: Vec<(u128, u32, u64, i128, Address)> = Vec::new(env);
    let len = scored.len();
    for _ in 0..len {
        let mut best_idx = 0;
        let mut best = scored.get(0).unwrap();
        for j in 1..scored.len() {
            let current = scored.get(j).unwrap();
            let is_better = current.0 > best.0 || (current.0 == best.0 && current.2 < best.2);
            if is_better {
                best_idx = j;
                best = current;
            }
        }
        sorted.push_back(best);
        scored.remove(best_idx);
    }

    // Greedily allocate
    let mut remaining = available_liquidity;
    let mut lowest_funded_discount: u32 = 0;
    let mut has_allocations = false;

    for i in 0..sorted.len() {
        let (_score, max_discount, invoice_id, principal, _sme) = sorted.get(i).unwrap();

        if remaining <= 0 {
            break;
        }

        let allocated = if principal <= remaining {
            principal
        } else {
            // Partial allocation: allocate the remaining liquidity
            remaining
        };

        result.push_back(Allocation {
            invoice_id,
            allocated_amount: allocated,
            clearing_discount_bps: 0, // Will be set after we know the marginal winner
        });
        remaining = remaining.saturating_sub(allocated);
        lowest_funded_discount = max_discount;
        has_allocations = true;
    }

    if !has_allocations {
        return result;
    }

    // Uniform clearing discount = the discount of the lowest-ranked funded bid
    let uniform_discount = lowest_funded_discount;

    // Apply uniform discount to all allocations
    let mut final_result: Vec<Allocation> = Vec::new(env);
    for i in 0..result.len() {
        let alloc = result.get(i).unwrap();
        final_result.push_back(Allocation {
            invoice_id: alloc.invoice_id,
            allocated_amount: alloc.allocated_amount,
            clearing_discount_bps: uniform_discount,
        });
    }

    final_result
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct AuctionContract;

#[contractimpl]
impl AuctionContract {
    pub fn version(_env: Env) -> u32 {
        1
    }

    /// Pure clearing algorithm exposed as a view function for frontend simulation.
    pub fn simulate_clearing(
        _env: Env,
        bids: Vec<InvoiceBid>,
        available_liquidity: i128,
        credit_scores: Map<Address, u32>,
    ) -> Vec<Allocation> {
        clear_auction(bids, available_liquidity, credit_scores)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, Map};

    fn test_env() -> Env {
        Env::default()
    }

    fn make_bid(
        env: &Env,
        invoice_id: u64,
        sme: Address,
        principal: i128,
        max_discount_bps: u32,
        min_priority_score: u32,
    ) -> InvoiceBid {
        InvoiceBid {
            invoice_id,
            sme,
            principal,
            max_discount_bps,
            min_priority_score,
        }
    }

    #[test]
    fn test_exact_fit_liquidity() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, sme1.clone(), 1000, 500, 0),
            make_bid(&env, 2, sme2.clone(), 2000, 300, 0),
        ];
        let scores = Map::new(&env);

        let result = clear_auction(bids, 3000, scores);
        assert_eq!(result.len(), 2);
        assert_eq!(result.get(0).unwrap().invoice_id, 1);
        assert_eq!(result.get(0).unwrap().allocated_amount, 1000);
        assert_eq!(result.get(1).unwrap().invoice_id, 2);
        assert_eq!(result.get(1).unwrap().allocated_amount, 2000);
    }

    #[test]
    fn test_insufficient_liquidity() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);
        let sme3 = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, sme1.clone(), 5000, 400, 0),
            make_bid(&env, 2, sme2.clone(), 3000, 600, 0),
            make_bid(&env, 3, sme3.clone(), 2000, 200, 0),
        ];
        let scores = Map::new(&env);

        // Only 4000 liquidity — enough for bid 2 (highest discount, 3000) + partially bid 1
        let result = clear_auction(bids, 4000, scores);
        assert_eq!(result.len(), 2);
        // Highest discount bid first (600 bps)
        assert_eq!(result.get(0).unwrap().invoice_id, 2);
        assert_eq!(result.get(0).unwrap().allocated_amount, 3000);
        // Then remaining 1000 goes to next highest
        assert_eq!(result.get(1).unwrap().allocated_amount, 1000);
    }

    #[test]
    fn test_credit_score_weighting() {
        let env = test_env();
        // High-score SME with smaller discount should outrank low-score SME with larger discount
        let high_score_sme = Address::generate(&env);
        let low_score_sme = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, low_score_sme.clone(), 1000, 500, 0),
            make_bid(&env, 2, high_score_sme.clone(), 1000, 400, 0),
        ];

        let mut scores = Map::new(&env);
        scores.set(high_score_sme.clone(), 800); // High score: 800
        scores.set(low_score_sme.clone(), 100); // Low score: 100

        // High-score SME's composite: 400 + (400*800*10/10000) = 400 + 320 = 720
        // Low-score SME's composite: 500 + (500*100*10/10000) = 500 + 50 = 550
        // High-score wins despite offering lower discount

        let result = clear_auction(bids, 2000, scores);
        assert_eq!(result.len(), 2);
        assert_eq!(
            result.get(0).unwrap().invoice_id,
            2,
            "High-score SME should be ranked first"
        );
    }

    #[test]
    fn test_deterministic_tie_breaking() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);

        // Same discount, same credit score → lower invoice_id wins
        let bids = vec![
            &env,
            make_bid(&env, 10, sme1.clone(), 1000, 500, 0),
            make_bid(&env, 5, sme2.clone(), 1000, 500, 0),
        ];
        let scores = Map::new(&env);

        let result = clear_auction(bids, 2000, scores);
        assert_eq!(result.len(), 2);
        assert_eq!(
            result.get(0).unwrap().invoice_id,
            5,
            "Lower invoice_id should win tie-break"
        );
    }

    #[test]
    fn test_uniform_clearing_discount() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);
        let sme3 = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, sme1.clone(), 1000, 700, 0), // Highest discount - wins first
            make_bid(&env, 2, sme2.clone(), 1000, 500, 0), // Marginal winner
            make_bid(&env, 3, sme3.clone(), 1000, 300, 0), // Lowest discount - loses, no liquidity left
        ];
        let scores = Map::new(&env);

        // Only enough for 2 bids (2000 liquidity)
        let result = clear_auction(bids, 2000, scores);
        assert_eq!(result.len(), 2);

        // Both winners should pay the marginal winner's discount (500 bps)
        assert_eq!(result.get(0).unwrap().clearing_discount_bps, 500);
        assert_eq!(result.get(1).unwrap().clearing_discount_bps, 500);
    }

    #[test]
    fn test_no_bids() {
        let env = test_env();
        let bids = Vec::new(&env);
        let scores = Map::new(&env);

        let result = clear_auction(bids, 10000, scores);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_zero_liquidity() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let bids = vec![&env, make_bid(&env, 1, sme1, 1000, 500, 0)];
        let scores = Map::new(&env);

        let result = clear_auction(bids, 0, scores);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_winning_bid_not_exceeding_own_discount() {
        let env = test_env();
        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, sme1.clone(), 1000, 600, 0),
            make_bid(&env, 2, sme2.clone(), 1000, 200, 0),
        ];
        let scores = Map::new(&env);

        let result = clear_auction(bids, 1500, scores);
        assert_eq!(result.len(), 2);

        // Both pay 200 bps uniform — bid 1 offered 600, gets 200 (better than offered)
        assert_eq!(result.get(0).unwrap().clearing_discount_bps, 200);
        assert!(result.get(0).unwrap().clearing_discount_bps <= 600);
    }

    #[test]
    fn test_simulate_clearing_contract_fn() {
        let env = test_env();
        let contract_id = env.register_contract(None, AuctionContract);
        let client = crate::AuctionContractClient::new(&env, &contract_id);

        let sme1 = Address::generate(&env);
        let sme2 = Address::generate(&env);

        let bids = vec![
            &env,
            make_bid(&env, 1, sme1, 1000, 500, 0),
            make_bid(&env, 2, sme2, 2000, 300, 0),
        ];
        let scores = Map::new(&env);

        let result = client.simulate_clearing(&bids, &3000, &scores);
        assert_eq!(result.len(), 2);
    }
}
