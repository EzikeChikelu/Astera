# Interacting with Astera Smart Contracts

This guide is designed for frontend developers, product managers, and other non-Rust contributors who want to interact with the Astera smart contracts directly. You **do not** need to know Rust to read from or write to the contracts on the testnet.

## Prerequisites
1. [Install Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
2. Get some testnet XLM for your account (using [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test) or `stellar keys fund`)

## Section 1: Reading Contract State (no wallet needed)

Reading from a contract is free and doesn't require a funded wallet.

**Get Pool Configuration:**
```bash
stellar contract invoke \
  --id $POOL_CONTRACT_ID \
  --network testnet \
  -- get_config
```

**Get Your Investor Position:**
```bash
stellar contract invoke \
  --id $POOL_CONTRACT_ID \
  --network testnet \
  -- get_investor_position \
  --investor GABC...YOUR_ADDRESS \
  --token $USDC_TOKEN_ID
```

## Section 2: Writing Transactions (wallet needed)

To write data or change state, you need to sign the transaction.

**Create an Invoice:**
```bash
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --source-account YOUR_SECRET_KEY \
  --network testnet \
  -- create_invoice \
  --owner GABC...YOUR_ADDRESS \
  --debtor "Acme Corp" \
  --amount 1000000000 \
  --due_date 1735689600
```
*(Note: `amount` is specified in stroops. 1 USDC = 10,000,000 stroops. So 1000000000 = 100 USDC.)*

## Section 3: Using the JavaScript SDK

*(Coming soon: Once issue #165 is merged, you will be able to use the SDK directly in JS/TS).*

```typescript
import { AsteraClient } from '@astera/sdk';
const client = new AsteraClient({ network: 'testnet' });
const invoice = await client.invoice.get(42n);
console.log("Invoice Principal:", invoice.principal);
```

## Section 4: Understanding Contract Responses

- **ScVal Encoding**: The Stellar CLI often returns data as `ScVal`. The CLI automatically decodes it into readable JSON-like formats.
- **Amounts (Stroops)**: All token amounts are represented in stroops (7 decimal places). `10000000` = 1 Token.
- **Addresses**: Stellar addresses start with `G...` (for accounts) or `C...` (for contracts).

## Section 5: Common Tasks Cookbook

- **"How do I check if my withdrawal is ready?"**
  Invoke `get_withdrawal_queue` or check the last withdrawal timestamp using `get_config` to see if your cooldown period has passed.

- **"How do I see how much yield I've earned?"**
  Invoke `get_token_totals` on the pool contract. The `reward_per_share` field helps calculate accrued yield since your last snapshot.

- **"How do I check an SME's credit score?"**
  Invoke the Credit Score contract using `get_credit_score`:
  ```bash
  stellar contract invoke \
    --id $CREDIT_CONTRACT_ID \
    --network testnet \
    -- get_credit_score \
    --sme GABC...
  ```
