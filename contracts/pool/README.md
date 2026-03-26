# Funding Pool Contract

## Overview

The Funding Pool Contract enables investors to pool USDC capital and co-fund invoices created by SMEs. It manages deposits, withdrawals, invoice funding commitments, repayments, and yield distribution. Multiple investors can participate in funding a single invoice, with yields distributed proportionally based on their contribution.

## Contract Purpose

- Accept USDC deposits from investors
- Enable co-funding of invoices by multiple investors
- Disburse funds to SMEs when invoices are fully funded
- Calculate and distribute time-based yields on repayment
- Track individual investor positions and earnings
- Provide liquidity management for the pool

## Constants

- `DEFAULT_YIELD_BPS`: 800 (8% APY)
- `BPS_DENOM`: 10,000 (basis points denominator)
- `SECS_PER_YEAR`: 31,536,000 (365 days)

## Data Structures

### PoolConfig

```rust
struct PoolConfig {
    usdc_token: Address,           // USDC token contract address
    invoice_contract: Address,     // Invoice contract address
    admin: Address,                // Pool administrator
    yield_bps: u32,                // Annual yield in basis points (800 = 8%)
    total_deposited: i128,         // Total USDC deposited (including earned interest)
    total_deployed: i128,          // USDC currently deployed in active invoices
    total_paid_out: i128,          // Total USDC paid out (principal + interest)
}
```

### InvestorPosition

```rust
struct InvestorPosition {
    deposited: i128,      // Total amount deposited (net of withdrawals)
    available: i128,      // Undeployed balance available for withdrawal/funding
    deployed: i128,       // Amount currently locked in active invoices
    earned: i128,         // Total interest earned
    deposit_count: u32,   // Number of deposits made
}
```

### FundedInvoice

```rust
struct FundedInvoice {
    invoice_id: u64,      // Invoice ID from invoice contract
    sme: Address,         // SME receiving the funds
    principal: i128,      // Total funding target
    committed: i128,      // Amount committed so far (equals principal when fully funded)
    funded_at: u64,       // Timestamp when fully funded (0 while open)
    due_date: u64,        // Invoice due date
    repaid: bool,         // Whether invoice has been repaid
}
```

### CoFundKey

```rust
struct CoFundKey {
    invoice_id: u64,
    investor: Address,
}
```

## Storage Keys

- `Config`: Pool configuration (instance storage)
- `Investor(Address)`: Maps investor address to InvestorPosition (persistent storage)
- `FundedInvoice(u64)`: Maps invoice ID to FundedInvoice (persistent storage)
- `CoFunders(u64)`: Vec<Address> of all investors who committed to an invoice (persistent storage)
- `CoFundShare(CoFundKey)`: i128 principal share committed by specific investor to specific invoice (persistent storage)
- `Initialized`: Boolean flag indicating contract initialization (instance storage)

## Events

All events are published with topic `POOL`.

### deposit

- **Data**: `(investor: Address, amount: i128)`
- **Emitted**: When an investor deposits USDC

### funded

- **Data**: `(invoice_id: u64, sme: Address, principal: i128)`
- **Emitted**: When an invoice becomes fully funded and USDC is disbursed to SME

### repaid

- **Data**: `(invoice_id: u64, principal: i128, interest: i128)`
- **Emitted**: When an invoice is repaid with interest

### withdraw

- **Data**: `(investor: Address, amount: i128)`
- **Emitted**: When an investor withdraws USDC

---

## Public Functions

### initialize(admin: Address, usdc_token: Address, invoice_contract: Address)

Initializes the pool contract. Can only be called once.

**Auth:** None (but can only be called once)

**Panics:**

- `"already initialized"` - if contract has already been initialized

**Events:** None

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --usdc_token <USDC_TOKEN_ADDRESS> \
  --invoice_contract <INVOICE_CONTRACT_ADDRESS>
```

---

### deposit(investor: Address, amount: i128)

Investor deposits USDC into the pool. USDC is transferred from investor to pool contract.

**Auth:** `investor` must sign

**Panics:**

- `"amount must be positive"` - if amount <= 0
- `"not initialized"` - if contract not initialized

**Events:** `deposit` with `(investor, amount)`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <INVESTOR_SECRET> \
  -- deposit \
  --investor <INVESTOR_ADDRESS> \
  --amount 1000000000
```

---

### init_co_funding(admin: Address, invoice_id: u64, principal: i128, sme: Address, due_date: u64)

Admin registers an invoice for co-funding, establishing the principal target. Investors then call `commit_to_invoice` to fill their shares.

**Auth:** `admin` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"unauthorized"` - if caller is not admin
- `"principal must be positive"` - if principal <= 0
- `"invoice already registered for funding"` - if invoice_id already exists

**Events:** None

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  -- init_co_funding \
  --admin <ADMIN_ADDRESS> \
  --invoice_id 1 \
  --principal 3000000000 \
  --sme <SME_ADDRESS> \
  --due_date 1735689600
```

---

### commit_to_invoice(investor: Address, invoice_id: u64, amount: i128)

Investor commits a portion of their available pool balance toward an invoice. When the total committed reaches the principal target, USDC is disbursed to the SME and a "funded" event is emitted.

**Auth:** `investor` must sign

**Panics:**

- `"amount must be positive"` - if amount <= 0
- `"not initialized"` - if contract not initialized
- `"invoice not registered for co-funding"` - if invoice_id doesn't exist
- `"invoice already fully funded"` - if invoice is already fully funded
- `"invoice already repaid"` - if invoice has been repaid
- `"amount exceeds remaining funding gap"` - if amount > (principal - committed)
- `"investor has no position"` - if investor has never deposited
- `"insufficient available balance"` - if investor's available balance < amount

**Events:** `funded` with `(invoice_id, sme, principal)` when invoice becomes fully funded

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <INVESTOR_SECRET> \
  -- commit_to_invoice \
  --investor <INVESTOR_ADDRESS> \
  --invoice_id 1 \
  --amount 2000000000
```

---

### repay_invoice(invoice_id: u64, payer: Address)

SME repays the invoice. Principal and pro-rata yield are credited back to each co-funder's available balance. Interest is calculated based on time elapsed since funding.

**Formula:** `interest = (principal × yield_bps × elapsed_seconds) / (10000 × 31536000)`

**Auth:** `payer` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"invoice not found"` - if invoice_id doesn't exist
- `"invoice not fully funded yet"` - if invoice hasn't been fully funded
- `"already repaid"` - if invoice has already been repaid

**Events:** `repaid` with `(invoice_id, principal, interest)`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <SME_SECRET> \
  -- repay_invoice \
  --invoice_id 1 \
  --payer <SME_ADDRESS>
```

---

### withdraw(investor: Address, amount: i128)

Investor withdraws their available (undeployed) USDC from the pool.

**Auth:** `investor` must sign

**Panics:**

- `"amount must be positive"` - if amount <= 0
- `"not initialized"` - if contract not initialized
- `"no position found"` - if investor has no position
- `"insufficient available balance"` - if investor's available balance < amount

**Events:** `withdraw` with `(investor, amount)`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <INVESTOR_SECRET> \
  -- withdraw \
  --investor <INVESTOR_ADDRESS> \
  --amount 500000000
```

---

### set_yield(admin: Address, yield_bps: u32)

Admin updates the pool yield rate (in basis points).

**Auth:** `admin` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"unauthorized"` - if caller is not admin
- `"yield cannot exceed 50%"` - if yield_bps > 5000

**Events:** None

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  -- set_yield \
  --admin <ADMIN_ADDRESS> \
  --yield_bps 1000
```

---

### get_config() -> PoolConfig

Returns the pool configuration.

**Auth:** None (read-only)

**Panics:**

- `"not initialized"` - if contract not initialized

**Events:** None

**Returns:** PoolConfig struct

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_config
```

---

### get_position(investor: Address) -> Option<InvestorPosition>

Returns the position details for a specific investor.

**Auth:** None (read-only)

**Panics:** None

**Events:** None

**Returns:** Option<InvestorPosition> (None if investor has no position)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_position \
  --investor <INVESTOR_ADDRESS>
```

---

### get_funded_invoice(invoice_id: u64) -> Option<FundedInvoice>

Returns details of a funded invoice.

**Auth:** None (read-only)

**Panics:** None

**Events:** None

**Returns:** Option<FundedInvoice> (None if invoice not found)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_funded_invoice \
  --invoice_id 1
```

---

### get_co_fund_share(invoice_id: u64, investor: Address) -> i128

Returns the USDC amount this investor has committed to a specific invoice.

**Auth:** None (read-only)

**Panics:** None

**Events:** None

**Returns:** i128 (0 if no commitment)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_co_fund_share \
  --invoice_id 1 \
  --investor <INVESTOR_ADDRESS>
```

---

### available_liquidity() -> i128

Returns available undeployed liquidity in the pool.

**Formula:** `total_deposited - total_deployed`

**Auth:** None (read-only)

**Panics:**

- `"not initialized"` - if contract not initialized

**Events:** None

**Returns:** i128

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- available_liquidity
```

---

### estimate_repayment(invoice_id: u64) -> i128

Estimate total repayment for an invoice at current time (principal + accrued interest).

**Auth:** None (read-only)

**Panics:**

- `"not initialized"` - if contract not initialized
- `"invoice not funded"` - if invoice doesn't exist

**Events:** None

**Returns:** i128 (estimated repayment amount)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- estimate_repayment \
  --invoice_id 1
```

---

## Error Conditions

| Error Message                              | Cause                                        |
| ------------------------------------------ | -------------------------------------------- |
| `"already initialized"`                    | Attempting to initialize contract twice      |
| `"not initialized"`                        | Calling functions before initialization      |
| `"amount must be positive"`                | Amount parameter <= 0                        |
| `"unauthorized"`                           | Caller is not admin for admin-only functions |
| `"principal must be positive"`             | Principal <= 0 in init_co_funding            |
| `"invoice already registered for funding"` | Duplicate invoice_id in init_co_funding      |
| `"invoice not registered for co-funding"`  | Invalid invoice_id in commit_to_invoice      |
| `"invoice already fully funded"`           | Attempting to commit to fully funded invoice |
| `"invoice already repaid"`                 | Attempting to commit to repaid invoice       |
| `"amount exceeds remaining funding gap"`   | Commitment exceeds remaining needed amount   |
| `"investor has no position"`               | Investor never deposited                     |
| `"insufficient available balance"`         | Investor's available balance too low         |
| `"invoice not found"`                      | Invalid invoice_id in repay_invoice          |
| `"invoice not fully funded yet"`           | Attempting to repay before fully funded      |
| `"already repaid"`                         | Attempting to repay twice                    |
| `"no position found"`                      | Investor has no position for withdrawal      |
| `"yield cannot exceed 50%"`                | yield_bps > 5000 in set_yield                |

## Interest Calculation

Interest is calculated using the formula:

```
interest = (principal × yield_bps × elapsed_seconds) / (10000 × 31536000)
```

Where:

- `principal`: Invoice principal amount
- `yield_bps`: Annual yield in basis points (e.g., 800 = 8%)
- `elapsed_seconds`: Time between funding and repayment
- `10000`: Basis points denominator
- `31536000`: Seconds per year (365 days)

Interest is distributed proportionally to co-funders based on their share of the principal.

## Co-Funding Workflow

1. Admin calls `init_co_funding` to register an invoice with target principal
2. Investors call `commit_to_invoice` to commit portions of their available balance
3. When `committed == principal`, USDC is automatically disbursed to SME
4. SME calls `repay_invoice` when ready to repay
5. Principal + proportional interest is credited to each co-funder's available balance
6. Investors can withdraw their available balance anytime

## Integration Notes

- Works with Stellar USDC token (7 decimals: 1 USDC = 10,000,000)
- Coordinates with Invoice Contract for invoice lifecycle management
- Supports multiple investors per invoice with proportional yield distribution
- Investors can participate in multiple invoices simultaneously
- Available balance can be withdrawn at any time (only deployed capital is locked)
