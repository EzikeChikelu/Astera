# Contract event topics

Every Astera contract event now has a two-segment topic:

| Contract     | Namespace | Action format          | Examples                                                           |
| ------------ | --------- | ---------------------- | ------------------------------------------------------------------ |
| Invoice      | `invoice` | lowercase `snake_case` | `created`, `funded`, `default`, `due_ext`, `meta_img`              |
| Pool         | `pool`    | lowercase `snake_case` | `deposit`, `funded`, `part_pay`, `repaid`, `yld_claim`, `wd_queue` |
| Credit score | `credit`  | lowercase `snake_case` | `score_cfg`, `payment`, `dispute`, `resolved`, `lt_upd`            |

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
