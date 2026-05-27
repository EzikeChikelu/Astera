# Contract Events (Pool & Share)

On-chain events for off-chain indexers and dashboards.

---

## Pool Contract Events

Liquidity and yield events emitted by `contracts/pool/src/lib.rs`.

## Topic Schema

All liquidity-flow events use the same contract namespace topic:

| Topic 0 | Topic 1 |
|---------|---------|
| `pool` | `deposit` \| `withdrawal` \| `yield_claimed` |

## Events

### `deposit`

Emitted when an investor deposits stablecoin into the pool.

| Field | Type | Description |
|-------|------|-------------|
| depositor | `Address` | Investor who deposited |
| token | `Address` | Accepted stablecoin contract |
| amount | `i128` | Token amount transferred in |
| shares_minted | `i128` | Share tokens minted to the depositor |
| timestamp | `u64` | Ledger timestamp (`env.ledger().timestamp()`) |

```rust
env.events().publish(
    (Symbol::new(&env, "pool"), Symbol::new(&env, "deposit")),
    (depositor, token, amount, shares_minted, env.ledger().timestamp()),
);
```

### `withdrawal`

Emitted when an investor burns shares and withdraws underlying tokens.

| Field | Type | Description |
|-------|------|-------------|
| withdrawer | `Address` | Investor who withdrew |
| token | `Address` | Stablecoin withdrawn |
| amount | `i128` | Token amount transferred out |
| shares_burned | `i128` | Share tokens burned |
| timestamp | `u64` | Ledger timestamp |

```rust
env.events().publish(
    (Symbol::new(&env, "pool"), Symbol::new(&env, "withdrawal")),
    (withdrawer, token, amount, shares_burned, env.ledger().timestamp()),
);
```

### `yield_claimed`

Emitted when an investor claims accrued yield for a token position.

| Field | Type | Description |
|-------|------|-------------|
| claimer | `Address` | Investor claiming yield |
| token | `Address` | Stablecoin paid out |
| amount | `i128` | Yield amount transferred (0 if nothing claimable) |
| timestamp | `u64` | Ledger timestamp |

```rust
env.events().publish(
    (Symbol::new(&env, "pool"), Symbol::new(&env, "yield_claimed")),
    (claimer, token, amount, env.ledger().timestamp()),
);
```

## Other Pool Events

Administrative and lifecycle events (funding, repayment, pausing, configuration) continue to use the `POOL` short-symbol namespace documented in [event-reference.md](./event-reference.md).

## Indexer Parsing (Pool)

```ts
const [namespace, action] = event.topic;
if (namespace === 'pool' && action === 'deposit') {
  const [depositor, token, amount, sharesMinted, timestamp] = event.value;
}
```

---

## Share Token Events

Share token lifecycle events emitted by `contracts/share/src/lib.rs`.

### Topic Schema

| Topic 0 | Topic 1 |
|---------|---------|
| `share` | `mint` \| `burn` \| `transfer` \| `approve` |

### `mint`

Emitted when the pool admin mints shares to an investor.

| Field | Type | Description |
|-------|------|-------------|
| to | `Address` | Recipient of minted shares |
| amount | `i128` | Shares minted |
| timestamp | `u64` | Ledger timestamp |

```rust
env.events().publish(
    (Symbol::new(&env, "share"), Symbol::new(&env, "mint")),
    (to.clone(), amount, env.ledger().timestamp()),
);
```

### `burn`

Emitted when the pool admin burns shares from a holder.

| Field | Type | Description |
|-------|------|-------------|
| from | `Address` | Holder whose shares are burned |
| amount | `i128` | Shares burned |
| timestamp | `u64` | Ledger timestamp |

```rust
env.events().publish(
    (Symbol::new(&env, "share"), Symbol::new(&env, "burn")),
    (from.clone(), amount, env.ledger().timestamp()),
);
```

### `transfer`

Emitted when shares move between holders.

| Field | Type | Description |
|-------|------|-------------|
| from | `Address` | Sender |
| to | `Address` | Recipient |
| amount | `i128` | Shares transferred |

```rust
env.events().publish(
    (Symbol::new(&env, "share"), Symbol::new(&env, "transfer")),
    (from.clone(), to.clone(), amount),
);
```

### `approve`

Emitted when an owner sets a spender allowance.

| Field | Type | Description |
|-------|------|-------------|
| owner | `Address` | Allowance owner |
| spender | `Address` | Approved spender |
| amount | `i128` | Allowance amount |

```rust
env.events().publish(
    (Symbol::new(&env, "share"), Symbol::new(&env, "approve")),
    (owner.clone(), spender.clone(), amount),
);
```

## Indexer Parsing (Share)

```ts
const [namespace, action] = event.topic;
if (namespace === 'share' && action === 'mint') {
  const [to, amount, timestamp] = event.value;
}
if (namespace === 'share' && action === 'transfer') {
  const [from, to, amount] = event.value;
}
```

> **Note:** `initialize` still emits a legacy `("share", "init")` short-symbol event for contract setup; liquidity events above use full `Symbol::new` topic names.
