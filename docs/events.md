# Contract event topics

Every Astera contract event now has a two-segment topic:

| Contract         | Namespace | Action format          | Examples                                                           |
| ---------------- | --------- | ---------------------- | ------------------------------------------------------------------ |
| Invoice          | `invoice` | lowercase `snake_case` | `created`, `funded`, `default`, `due_ext`, `meta_img`              |
| Pool             | `pool`    | lowercase `snake_case` | `deposit`, `funded`, `part_pay`, `repaid`, `yld_claim`, `wd_queue` |
| Secondary market | `market`  | lowercase `snake_case` | `lst_open`, `lst_buy`, `ord_open`, `ord_fill`, `ord_cncl`          |
| Credit score     | `credit`  | lowercase `snake_case` | `score_cfg`, `payment`, `dispute`, `resolved`, `lt_upd`            |

## Secondary market (`market` namespace)

The `secondary_market` satellite contract (see `contracts/secondary_market`) emits
under its own `market` topic — the indexer classifies these into the `pool` API
category (see `indexer/src/parser.ts`'s `classifyContract`) since it's a satellite
of pool, not a distinct product area.

Fixed-price listings (#1025 — `list_position`/`cancel_listing`/`buy_listing`):

| Action     | Payload                                             |
| ---------- | ---------------------------------------------------- |
| `lst_open` | `(listing_id, invoice_id, seller, amount_or_bps, price)` |
| `lst_cncl` | `(listing_id, invoice_id, seller)`                   |
| `lst_buy`  | `(listing_id, invoice_id, seller, buyer, price)`     |

Limit order book (#1035 — `place_order`/`cancel_order`/`expire_order`), which sits
alongside the fixed-price flow rather than replacing it:

| Action     | Payload                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| `ord_open` | `(order_id, invoice_id, owner, side, amount_or_bps, price)`             |
| `ord_fill` | `(taker_order_id, maker_order_id, invoice_id, buyer, seller, fill_qty, price)` |
| `ord_cncl` | `(order_id, invoice_id, owner)`                                         |
| `ord_exp`  | `(order_id, invoice_id, owner)`                                         |

`ord_fill`'s `price` is the fill's total price for `fill_qty` units (always at the
resting/maker order's per-unit price), not the per-unit `price` carried on
`ord_open`. `pool`'s own `mkt_stl` event (under the `pool` topic, emitted once per
fill from the trusted `market_settle_listing` entrypoint) carries the same trade
as `(invoice_id, seller, buyer, price)`.

Actions are Soroban `Symbol` values and must therefore remain within the SDK's
symbol length limit. Existing short actions are retained for ABI compatibility;
new actions must be lowercase and use underscores when they contain more than
one word.

## Indexer migration

Deployed consumers previously received uppercase namespaces (`INVOICE`, `POOL`,
and `CREDIT`). Update all filters and parsers to use the lowercase namespaces
above. During a contract rollout, indexers that must process historical ledgers
should accept both the old and new namespace values; events emitted by a
redeployed contract use only the new form.

The TypeScript event consumers in `frontend/app/history`, invoice detail,
monitoring, and the recent-events feed use the new namespace values.
