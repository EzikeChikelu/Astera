# Contract event topics

Every Astera contract event now has a two-segment topic:

| Contract         | Namespace  | Action format          | Examples                                                           |
| ---------------- | ---------- | ---------------------- | ------------------------------------------------------------------ |
| Invoice          | `invoice`  | lowercase `snake_case` | `created`, `funded`, `default`, `due_ext`, `meta_img`              |
| Pool             | `pool`     | lowercase `snake_case` | `deposit`, `funded`, `part_pay`, `repaid`, `yld_claim`, `wd_queue` |
| Secondary market | `market`   | lowercase `snake_case` | `lst_open`, `lst_buy`, `ord_open`, `ord_fill`, `ord_cncl`          |
| Credit score     | `credit`   | lowercase `snake_case` | `score_cfg`, `payment`, `dispute`, `resolved`, `lt_upd`            |
| Tranche          | `TRANCHE`  | lowercase `snake_case` | `deposit`, `withdraw`, `fund`, `repay`, `default`, `config`        |
| Auction          | `auction`  | lowercase `snake_case` | `col_risk`, `col_safe`, `auc_liq`, `sale_open`, `sale_take`        |
| Compliance       | `COMPLY`   | lowercase `snake_case` | `screened`, `review`, `scr_prop`, `tl_set`, `paused`               |
| Oracle registry  | `ORACLE`   | lowercase `snake_case` | `registrd`, `rnd_open`, `voted`, `consensus`, `cfg_upd`            |

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

## Tranche (`TRANCHE` namespace)

The `tranche` contract (#862) implements invoice tranching (senior/junior) with
waterfall repayment and loss allocation. Events are emitted under the uppercase
`TRANCHE` topic.

| Action     | Payload                                                            |
| ---------- | ------------------------------------------------------------------ |
| `deposit`  | `(investor, token, amount, tranche_class)`                        |
| `withdraw` | `(investor, token, amount, tranche_class)`                        |
| `fund`     | `(invoice_id, token, senior_deployed, junior_deployed)`            |
| `repay`    | `(invoice_id, token, senior_payout, junior_payout)`                |
| `default`  | `(invoice_id, token, junior_loss, senior_loss)`                    |
| `config`   | `(admin, senior_bps, junior_bps, ...)`                             |

## Auction (`auction` namespace)

The `auction` satellite contract (#1036) handles collateral-liquidation Dutch
auctions and oracle-priced risk-response monitoring. It is classified as `pool`
by the indexer (satellite of pool). Events are emitted under the lowercase
`auction` topic.

| Action     | Payload                                                              |
| ---------- | -------------------------------------------------------------------- |
| `col_risk` | `(invoice_id, ratio_bps)`                                            |
| `col_safe` | `(invoice_id, ratio_bps)`                                            |
| `auc_liq`  | `(invoice_id, depositor, token, amount, ...)`                        |
| `risk_cfg` | `(admin, risk_contract, ...)`                                        |
| `sale_open`| `(listing_id, invoice_id, depositor, token, amount, start_price, ...)` |
| `sale_take`| `(listing_id, invoice_id, depositor, buyer, price, ...)`             |
| `sale_exp` | `(listing_id, invoice_id, depositor)`                                |

## Compliance (`COMPLY` namespace)

The `compliance` contract (#867) provides on-chain sanctions screening and
compliance registry. Events are emitted under the uppercase `COMPLY` topic.

| Action     | Payload                                                              |
| ---------- | -------------------------------------------------------------------- |
| `screened` | `(screener, subject, result, ...)`                                   |
| `review`   | `(screener, subject, status, ...)`                                   |
| `scr_prop` | `(proposer, subject, ...)`                                           |
| `scr_reg`  | `(admin, subject, ...)`                                              |
| `scr_del`  | `(admin, subject, ...)`                                              |
| `scr_can`  | `(admin, subject, ...)`                                              |
| `int_set`  | `(admin, interval, ...)`                                             |
| `tl_set`   | `(admin, threshold, ...)`                                            |
| `paused`   | `(admin)`                                                            |
| `unpaused` | `(admin)`                                                            |

## Oracle registry (`ORACLE` namespace)

The `oracle_registry` contract (#861) implements the N-of-M staked oracle
consensus network. Events are emitted under the uppercase `ORACLE` topic.

| Action       | Payload                                                            |
| ------------ | ------------------------------------------------------------------ |
| `registrd`   | `(oracle, ...)`                                                    |
| `dreg_req`   | `(requester, oracle, ...)`                                         |
| `dreg_done`  | `(oracle, ...)`                                                    |
| `slashed`    | `(oracle, amount, ...)`                                            |
| `rnd_open`   | `(round_id, ...)`                                                  |
| `voted`      | `(oracle, round_id, vote, ...)`                                    |
| `consensus`  | `(round_id, result, ...)`                                          |
| `rnd_exp`    | `(round_id, ...)`                                                  |
| `fallback`   | `(round_id, ...)`                                                  |
| `inv_set`    | `(admin, interval, ...)`                                           |
| `cfg_upd`    | `(admin, ...)`                                                     |
| `paused`     | `(admin)`                                                          |
| `unpaused`   | `(admin)`                                                          |

## Indexer migration

Deployed consumers previously received uppercase namespaces (`INVOICE`, `POOL`,
and `CREDIT`). Update all filters and parsers to use the lowercase namespaces
above. During a contract rollout, indexers that must process historical ledgers
should accept both the old and new namespace values; events emitted by a
redeployed contract use only the new form.

The TypeScript event consumers in `frontend/app/history`, invoice detail,
monitoring, and the recent-events feed use the new namespace values.
