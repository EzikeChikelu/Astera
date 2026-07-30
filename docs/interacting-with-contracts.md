# Interacting with Contracts

## Secondary Market for Pool Positions and Co-Funding Shares

Investors who have deployed capital into a funded invoice can list their
position for sale before the invoice repays, providing early-exit liquidity
without touching the withdrawal queue.

### Concepts

| Term | Meaning |
|------|---------|
| `CoFunding` listing | Seller offers some or all of their `CoFundShare` bps in a filled co-funding round |
| `SingleFunded` listing | Seller offers a raw token amount of their `deployed` principal in a single-funded invoice |
| `price` | Flat token amount the buyer pays from their `available` pool balance |

### Entrypoints

#### `list_position(seller, invoice_id, kind, amount_or_bps, price) -> u64`

Creates an open listing and returns its `listing_id`.

- `kind = CoFunding`: `amount_or_bps` is the bps of the seller's `CoFundShare`
  to offer (must be ≤ seller's current share; round must be `Filled`).
- `kind = SingleFunded`: `amount_or_bps` is the raw token amount of deployed
  principal to offer (must be ≤ seller's `deployed` balance).
- Compliance gate and KYC are checked on the seller at listing time.
- At most `50` open listings per invoice are allowed.

```bash
stellar contract invoke --id <POOL_CONTRACT_ID> --source seller --network testnet \
  -- list_position \
  --seller <SELLER_ADDRESS> \
  --invoice_id 42 \
  --kind '{"CoFunding": []}' \
  --amount_or_bps 5000 \
  --price 4800
```

#### `cancel_listing(seller, listing_id)`

Cancels an open listing. Only the original seller may cancel.

```bash
stellar contract invoke --id <POOL_CONTRACT_ID> --source seller --network testnet \
  -- cancel_listing \
  --seller <SELLER_ADDRESS> \
  --listing_id 1
```

#### `buy_listing(buyer, listing_id)`

Atomically:
1. Debits `listing.price` from the buyer's `available` balance.
2. Credits `listing.price` to the seller's `available` balance.
3. Transfers the claim (CoFundShare bps or deployed principal slice) to the buyer.
4. Marks the listing `Filled`.

Compliance, KYC, and the per-investor concentration cap
(`PoolConfig.max_single_investor_bps`) are enforced on the buyer.

```bash
stellar contract invoke --id <POOL_CONTRACT_ID> --source buyer --network testnet \
  -- buy_listing \
  --buyer <BUYER_ADDRESS> \
  --listing_id 1
```

#### `get_listing(listing_id) -> Option<Listing>`

Read a single listing by ID.

#### `list_listings_for_invoice(invoice_id) -> Vec<u64>`

Returns all listing IDs (open and closed) for a given invoice.

#### `list_listings_for_investor(seller) -> Vec<u64>`

Returns all listing IDs (open and closed) created by a given seller.

### Repayment after a transfer

When `repay_invoice` is called after a secondary-market transfer:

- **Co-funded invoices**: `repay_invoice_request` distributes proceeds
  pro-rata by the *current* `CoFundShare` bps, so the buyer (new holder)
  receives the repayment, not the original seller.
- **Single-funded invoices**: the buyer's `deployed` balance is credited
  when the invoice repays via the `reward_per_share` accumulator, which
  tracks the current holder's share token balance.

### Default after a transfer

If `mark_defaulted` fires after a secondary-market transfer, any
insurance-reserve payout resolves to the *current* holder of the claim,
consistent with the repayment logic above.

### SDK usage

```typescript
import { PoolClient } from '@astera/sdk';

const pool = new PoolClient({ rpcUrl, network, contractId: POOL_CONTRACT_ID });

// List a co-funding share
const listingId = await pool.listPosition({
  signer,
  seller: sellerAddress,
  invoiceId: 42n,
  kind: 'CoFunding',
  amountOrBps: 5000n,
  price: 4800n,
});

// Buy a listing
await pool.buyListing({ signer, buyer: buyerAddress, listingId });

// Cancel a listing
await pool.cancelListing({ signer, seller: sellerAddress, listingId });

// Query
const listing = await pool.getListing(listingId);
const invoiceListings = await pool.listListingsForInvoice(42n);
const myListings = await pool.listListingsForInvestor(sellerAddress);
```

### Events

| Event symbol | Payload | Description |
|---|---|---|
| `lst_open` | `(listing_id, invoice_id, seller, amount_or_bps, price)` | New listing created |
| `lst_cncl` | `(listing_id, invoice_id, seller)` | Listing cancelled by seller |
| `lst_buy`  | `(listing_id, invoice_id, seller, buyer, price)` | Listing filled by buyer |
