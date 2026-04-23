# Astera Smart Contract Security Audit Report

**Version:** 1.0  
**Scope:** Soroban smart contracts — `invoice`, `pool`, `credit_score`  
**Network:** Stellar / Soroban (WASM)  
**Status:** Pre-mainnet — third-party audit recommended before production deployment

---

## Executive Summary

This document records the automated and manual security review findings for the Astera protocol. It covers reentrancy, integer overflow, access control, and economic attack vectors as required by issue #114. Findings are classified as **Critical**, **High**, **Medium**, **Low**, or **Informational**.

---

## 1. Reentrancy

**Finding:** No reentrancy risk detected.  
**Severity:** Informational  
**Detail:** The Soroban host enforces single-contract-at-a-time execution semantics. Cross-contract calls are synchronous and the host prevents a contract from being re-entered mid-execution. The pool contract uses `env.invoke_contract` to interact with share tokens; these calls complete before state is written, so no reentrancy window exists.  
**Verification:** Pool `deposit` mints shares after updating `pool_value`; `withdraw` burns shares before transferring tokens. State transitions are atomic per invocation.

---

## 2. Integer Overflow / Underflow

**Finding:** Mitigated by Rust and build configuration.  
**Severity:** Informational  
**Detail:** `Cargo.toml` sets `overflow-checks = true` in the release profile, meaning arithmetic overflow panics at runtime rather than wrapping silently. All arithmetic uses `i128` (signed) and `u128` for intermediate calculations to prevent overflow in interest and fee computations.  
**Verification:** Interest formula:  
```
(principal as u128 * yield_bps as u128 * elapsed_secs as u128) / (BPS_DENOM as u128 * SECS_PER_YEAR as u128)
```
Widening to `u128` before multiplication prevents overflow for any realistic principal value.

---

## 3. Access Control

### 3.1 Invoice Contract

| Function | Guard | Notes |
|---|---|---|
| `initialize` | One-shot (`Initialized` flag) | Cannot be called twice |
| `pause` / `unpause` | `admin.require_auth()` + identity check | Dual check — signature + stored admin |
| `set_oracle` | Admin only | Oracle cannot be set without admin sig |
| `create_invoice` | `owner.require_auth()` | Rate-limited to 10/day per address |
| `verify_invoice` | Oracle only | Stored oracle address verified |
| `resolve_dispute` | Admin only | — |
| `mark_funded` | Stored pool address only | **Fixed in this PR** — was incorrectly using admin as placeholder |
| `mark_paid` | Owner, pool, or admin | Inclusive allow-list |
| `mark_defaulted` | Stored pool address only | — |
| `cleanup_invoice` | Admin only | Only on Paid/Defaulted |
| `propose_upgrade` / `execute_upgrade` | Admin + 24-hour timelock | Time-delayed upgrade pattern |

**Previous finding (Issue #56 — Fixed):** `create_invoice` stored `DataKey::Admin` as the `pool_contract` placeholder on new invoices, allowing the admin to call `mark_funded` directly without going through the pool contract. Fixed by reading `DataKey::Pool` instead.

### 3.2 Pool Contract

| Function | Guard | Notes |
|---|---|---|
| `initialize` | One-shot | — |
| `pause` / `unpause` | `require_admin` | — |
| `deposit` | `investor.require_auth()` | Amount > 0 validated |
| `withdraw` | `investor.require_auth()` | Share balance checked before burn |
| `fund_invoice` | Admin only | Liquidity availability checked |
| `repay_invoice` | `payer.require_auth()` | Double-repay prevented (`repaid` flag) |
| `add_token` / `remove_token` | Admin only | Balance check on remove |
| `set_yield` | Admin only | Capped at 50% |
| `set_factoring_fee` | Admin only | Capped at 100% |
| `propose_upgrade` / `execute_upgrade` | Admin + 24-hour timelock | — |

### 3.3 Credit Score Contract

| Function | Guard | Notes |
|---|---|---|
| `initialize` | One-shot | — |
| `pause` / `unpause` | `require_admin` | — |
| `record_payment` | Pool contract auth | Non-pool callers must get pool to co-sign |
| `record_default` | Pool contract auth | Same as above |
| `propose_upgrade` / `execute_upgrade` | Admin + 24-hour timelock | — |

---

## 4. Economic Attack Vectors

### 4.1 Fee Manipulation

**Finding:** No manipulation path identified.  
**Detail:** `factoring_fee_bps` is admin-controlled and capped at `BPS_DENOM` (100%). Fees are locked at invoice-funding time (`fund_invoice` snapshots `config.factoring_fee_bps`). Changing the fee after funding does not retroactively affect existing invoices. `estimate_repayment` correctly returns `principal + interest + factoring_fee` using the locked fee.

### 4.2 Yield Rate Manipulation

**Finding:** No manipulation path identified.  
**Detail:** `yield_bps` is admin-controlled and capped at 5 000 (50% APY). Interest accrues continuously from `funded_at` to repayment time; the rate used is from the config at repayment time, not at funding time. This means admin could increase yield before repayment. Recommended: snapshot `yield_bps` at funding time (accepted risk for v1).

### 4.3 Pool Drain via Withdrawal

**Finding:** Liquidity safety check in place.  
**Detail:** `withdraw` checks `available_liquidity = pool_value - total_deployed`. Investors can only withdraw liquidity not currently funding invoices. Concurrent withdrawals are not possible in Soroban's sequential model.

### 4.4 Share Token Manipulation

**Finding:** Share token is an external dependency — trust boundary exists.  
**Detail:** The pool uses an external share token contract (passed as `initial_share_token` at initialization). The pool assumes this contract correctly implements `total_supply`, `balance`, `mint`, and `burn`. A malicious share token could misreport balances. Recommendation: use a verified, audited share token or deploy one alongside the pool under admin control.

### 4.5 Daily Invoice Rate Limiting

**Finding:** Rate limit enforced correctly.  
**Detail:** `create_invoice` limits each address to 10 invoices per 24-hour window using `DailyInvoiceCount` and `DailyInvoiceResetTime` keys. This prevents spam and storage exhaustion attacks.

---

## 5. Storage / DoS

**Finding:** Storage exhaustion mitigated via TTL and cleanup.  
**Detail:** Active invoices have a 365-day TTL; completed invoices have a 30-day TTL. Admin-controlled `cleanup_invoice` / `cleanup_funded_invoice` reduce persistent storage. Rate limiting on invoice creation (10/day/address) prevents storage spam.

---

## 6. Upgrade Security

**Finding:** 24-hour timelock on contract upgrades.  
**Detail:** All three contracts implement a two-step upgrade mechanism: `propose_upgrade` (stores hash + timestamp) followed by `execute_upgrade` (enforces 24h delay). This gives the community time to detect malicious upgrades.

---

## 7. Recommendations for Third-Party Audit

The following areas should receive dedicated attention from a formal auditor:

1. **Share token trust model** — verify that the external share token cannot be used to drain the pool.
2. **Yield rate snapshotting** — consider locking `yield_bps` at funding time.
3. **Credit score oracle trust** — the `record_payment` caller model relies on pool contract auth; verify this cannot be exploited with cross-contract calls.
4. **Mainnet key management** — audit admin key custody and rotation procedures (see `docs/mainnet-deployment.md`).
5. **Economic simulation** — run scenario analysis on co-funding, partial repayment, and mass default events.

---

## 8. Automated Tooling

Cargo audit is integrated in CI (`.github/workflows/ci.yml`). Additional tooling:

```bash
# Vulnerability scan
cargo audit

# Lint and undefined-behavior checks
cargo clippy -- -D warnings

# WASM size and build verification
cargo build --target wasm32-unknown-unknown --release
```

See `contracts/.cargo/audit.toml` for known-safe advisory overrides.
