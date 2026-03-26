# Invoice Contract

## Overview

The Invoice Contract manages on-chain invoice tokens for SMEs (Small and Medium Enterprises). It tracks invoice lifecycle from creation through funding, payment, or default. The contract works in conjunction with the Pool Contract to enable invoice financing.

## Contract Purpose

- Create and manage invoice tokens representing receivables
- Track invoice status (Pending, Funded, Paid, Defaulted)
- Coordinate with the Pool Contract for invoice funding
- Provide transparency and immutability for invoice financing operations

## Data Structures

### InvoiceStatus

```rust
enum InvoiceStatus {
    Pending,    // Invoice created, awaiting funding
    Funded,     // Pool has funded the invoice
    Paid,       // Invoice has been repaid
    Defaulted,  // Invoice missed due date without repayment
}
```

### Invoice

```rust
struct Invoice {
    id: u64,
    owner: Address,              // SME who created the invoice
    debtor: String,              // Name of the company that owes payment
    amount: i128,                // Invoice amount in USDC (7 decimals)
    due_date: u64,               // Unix timestamp when payment is due
    description: String,         // Invoice description
    status: InvoiceStatus,       // Current status
    created_at: u64,             // Unix timestamp of creation
    funded_at: u64,              // Unix timestamp when funded (0 if not funded)
    paid_at: u64,                // Unix timestamp when paid (0 if not paid)
    pool_contract: Address,      // Address of pool that funded this invoice
}
```

## Storage Keys

- `Invoice(u64)`: Maps invoice ID to Invoice struct (persistent storage)
- `InvoiceCount`: Total number of invoices created (instance storage)
- `Admin`: Contract administrator address (instance storage)
- `Pool`: Authorized pool contract address (instance storage)
- `Initialized`: Boolean flag indicating contract initialization (instance storage)

## Events

All events are published with topic `INVOICE`.

### created

- **Data**: `(id: u64, owner: Address, amount: i128)`
- **Emitted**: When a new invoice is created

### funded

- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as funded by the pool

### paid

- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as paid

### default

- **Data**: `id: u64`
- **Emitted**: When an invoice is marked as defaulted

---

## Public Functions

### initialize(admin: Address, pool: Address)

Initializes the contract with admin and pool addresses. Can only be called once.

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
  --pool <POOL_CONTRACT_ADDRESS>
```

---

### create_invoice(owner: Address, debtor: String, amount: i128, due_date: u64, description: String) -> u64

SME creates a new invoice token on-chain.

**Auth:** `owner` must sign

**Panics:**

- `"amount must be positive"` - if amount <= 0
- `"due date must be in the future"` - if due_date <= current timestamp

**Events:** `created` with `(id, owner, amount)`

**Returns:** Invoice ID (u64)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <SME_SECRET> \
  -- create_invoice \
  --owner <SME_ADDRESS> \
  --debtor "ACME Corp" \
  --amount 1000000000 \
  --due_date 1735689600 \
  --description "Invoice #001 - Goods delivery"
```

---

### mark_funded(id: u64, pool: Address)

Called by the pool contract when it funds an invoice. Updates status to Funded.

**Auth:** `pool` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"unauthorized pool"` - if caller is not the authorized pool
- `"invoice not found"` - if invoice ID doesn't exist
- `"invoice is not pending"` - if invoice status is not Pending

**Events:** `funded` with `id`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <POOL_SECRET> \
  -- mark_funded \
  --id 1 \
  --pool <POOL_ADDRESS>
```

---

### mark_paid(id: u64, caller: Address)

Called when repayment is confirmed. Updates status to Paid. Can be called by invoice owner, pool, or admin.

**Auth:** `caller` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"invoice not found"` - if invoice ID doesn't exist
- `"unauthorized"` - if caller is not owner, pool, or admin
- `"invoice is not funded"` - if invoice status is not Funded

**Events:** `paid` with `id`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <OWNER_SECRET> \
  -- mark_paid \
  --id 1 \
  --caller <OWNER_ADDRESS>
```

---

### mark_defaulted(id: u64, pool: Address)

Mark invoice as defaulted (missed due date, no repayment). Only callable by authorized pool.

**Auth:** `pool` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"unauthorized pool"` - if caller is not the authorized pool
- `"invoice not found"` - if invoice ID doesn't exist
- `"invoice is not funded"` - if invoice status is not Funded

**Events:** `default` with `id`

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <POOL_SECRET> \
  -- mark_defaulted \
  --id 1 \
  --pool <POOL_ADDRESS>
```

---

### get_invoice(id: u64) -> Invoice

Retrieves invoice details by ID.

**Auth:** None (read-only)

**Panics:**

- `"invoice not found"` - if invoice ID doesn't exist

**Events:** None

**Returns:** Invoice struct

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_invoice \
  --id 1
```

---

### get_invoice_count() -> u64

Returns the total number of invoices created.

**Auth:** None (read-only)

**Panics:** None

**Events:** None

**Returns:** Total invoice count (u64)

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  -- get_invoice_count
```

---

### set_pool(admin: Address, pool: Address)

Update authorized pool address. Admin only.

**Auth:** `admin` must sign

**Panics:**

- `"not initialized"` - if contract not initialized
- `"unauthorized"` - if caller is not the admin

**Events:** None

**Example:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET> \
  -- set_pool \
  --admin <ADMIN_ADDRESS> \
  --pool <NEW_POOL_ADDRESS>
```

---

## Error Conditions

| Error Message                      | Cause                                                   |
| ---------------------------------- | ------------------------------------------------------- |
| `"already initialized"`            | Attempting to initialize contract twice                 |
| `"not initialized"`                | Calling functions before initialization                 |
| `"amount must be positive"`        | Invoice amount <= 0                                     |
| `"due date must be in the future"` | Due date <= current timestamp                           |
| `"invoice not found"`              | Invalid invoice ID                                      |
| `"unauthorized pool"`              | Caller is not the authorized pool contract              |
| `"unauthorized"`                   | Caller lacks permission for the operation               |
| `"invoice is not pending"`         | Attempting to fund non-pending invoice                  |
| `"invoice is not funded"`          | Attempting to mark paid/defaulted on non-funded invoice |

## Integration Notes

- The Invoice Contract is designed to work with the Pool Contract
- Pool Contract calls `mark_funded` when disbursing funds to SME
- Pool Contract calls `mark_paid` after receiving repayment
- Pool Contract may call `mark_defaulted` for overdue invoices
- Invoice IDs are sequential starting from 1
