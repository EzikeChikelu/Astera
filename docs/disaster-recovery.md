# Disaster Recovery Runbook

This runbook is for production and staging incidents involving Astera contracts,
admin control, RPC availability, or protocol state. It is designed to be usable
under pressure, with concrete actions and communication templates.

Use this document together with:

- [SECURITY.md](../SECURITY.md)
- [docs/contract-upgrade-guide.md](contract-upgrade-guide.md)
- [docs/mainnet-checklist.md](mainnet-checklist.md)
- [docs/multisig-admin-setup.md](multisig-admin-setup.md)

Before merging any change to this runbook, the PR description should note review
and approval from at least one core team member in a security, protocol, or
operations role.

## Incident Handling Rules

- Use UTC timestamps in every note, announcement, and post-mortem.
- Assign one Incident Commander before taking parallel actions.
- Preserve evidence first. Record contract IDs, tx hashes, ledger numbers,
  screenshots, and exported logs before editing anything.
- If user funds may be at risk, pause first and investigate second.
- Do not execute a production upgrade until the same fix has been rehearsed on
  testnet or a mainnet-fork equivalent.

## Shared Variables

Use these environment variables in the emergency commands below:

```bash
export NETWORK=mainnet
export ADMIN_ADDRESS=G...
export INVOICE_CONTRACT_ID=C...
export POOL_CONTRACT_ID=C...
export CREDIT_SCORE_CONTRACT_ID=C...
```

Emergency pause commands:

```bash
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- pause \
  --admin $ADMIN_ADDRESS

stellar contract invoke \
  --id $POOL_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- pause \
  --admin $ADMIN_ADDRESS

stellar contract invoke \
  --id $CREDIT_SCORE_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- pause \
  --admin $ADMIN_ADDRESS
```

Emergency unpause commands:

```bash
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- unpause \
  --admin $ADMIN_ADDRESS

stellar contract invoke \
  --id $POOL_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- unpause \
  --admin $ADMIN_ADDRESS

stellar contract invoke \
  --id $CREDIT_SCORE_CONTRACT_ID \
  --source admin \
  --network $NETWORK \
  -- unpause \
  --admin $ADMIN_ADDRESS
```

## Scenario 1: Suspected Contract Exploit

### Immediate actions

1. Declare `P0 - suspected exploit` in the incident channel.
2. Assign:
   - Incident Commander
   - Protocol Lead
   - Security Lead
   - Communications Lead
3. Pause the invoice, pool, and credit score contracts immediately.
4. Freeze any manual admin activity that is not part of containment.
5. Export the latest known contract configuration and versions:
   - Invoice: `version`, `is_paused`, `get_storage_stats`
   - Pool: `version`, `is_paused`, `get_config`, `accepted_tokens`,
     `get_storage_stats`, `get_protocol_revenue`
   - Credit score: `version`, `is_paused`, `get_config`

### Assessment

- Check Stellar Expert for abnormal transactions on all protocol contracts.
- Prioritize suspicious calls such as:
  - `propose_upgrade`
  - `execute_upgrade`
  - `set_pool`
  - `set_pool_contract`
  - `set_invoice_contract`
  - `withdraw_revenue`
  - `fund_invoice`
  - `repay_invoice`
  - `seize_collateral`
  - unexpected `pause` / `unpause`
- Build a timeline with:
  - first suspicious tx hash
  - affected contracts
  - affected token addresses
  - changed admin-linked settings
  - investor or SME addresses touched by the incident
- Compare on-chain balances, pool accounting, and share supply before and after
  the suspicious transactions.

### Communication template

Discord / Telegram / community update:

```text
Astera incident update - [YYYY-MM-DD HH:MM UTC]

We detected suspicious protocol activity and have paused state-changing contract
operations as a precaution. User safety and evidence preservation are the
current priorities.

What is affected:
- New funding, repayments, withdrawals, and admin write actions are paused
- Read-only investigation is in progress

What we are doing:
- Reviewing on-chain transactions and contract events
- Confirming scope and affected balances
- Preparing next steps and a recovery plan

Next update by: [YYYY-MM-DD HH:MM UTC]
```

Short X / Twitter version:

```text
We have paused Astera protocol write operations while investigating suspicious
activity. Funds safety and evidence preservation are the priorities. Next update
by [HH:MM UTC].
```

### Remediation

1. Reproduce the exploit on a private test environment.
2. Patch the vulnerable contract or integration.
3. Run the relevant validation suite before any redeploy or upgrade.
4. If the fix can use the existing contract:
   - install new Wasm
   - `propose_upgrade`
   - wait out the timelock
   - `execute_upgrade`
5. If the fix requires a replacement pool or invoice contract:
   - deploy the new contract
   - update dependent references with:
     - invoice `set_pool`
     - credit score `set_pool_contract`
     - pool `set_credit_score_contract` or `set_invoice_contract` if applicable
6. If balances were changed incorrectly, prepare a written investor remediation
   plan before resuming operations. On-chain history is immutable, so recovery is
   usually a combination of patching, migration, and treasury or legal action.

### Resume checklist

- Root cause identified and documented
- Fix reviewed by protocol and security owners
- Testnet rehearsal completed
- Incident communication published with scope and next steps
- Contract references re-verified after patch or redeploy
- Pause state confirmed before smoke testing
- Smoke tests pass on small-value flows
- Invoice and credit score unpaused first
- Pool unpaused last

## Scenario 2: Admin Key Compromise

### Immediate actions

1. Treat as `P0` if the compromised key can still submit admin transactions.
2. If the admin account is still recoverable, rotate control at the Stellar
   account layer before the attacker acts:
   - add replacement signer(s)
   - raise thresholds if multisig is available
   - remove or zero-weight the compromised signer
3. Once control is restored, pause all contracts from the recovered admin
   account.
4. Snapshot all recent admin transactions and record whether the attacker used:
   - `pause` / `unpause`
   - `propose_upgrade` / `execute_upgrade`
   - `withdraw_revenue`
   - risk parameter setters
   - contract reference setters

### Assessment

- Confirm whether the stored admin address is:
  - a single-signature account
  - a multisig account managed per
    [docs/multisig-admin-setup.md](multisig-admin-setup.md)
- Determine whether the attacker changed:
  - treasury address
  - yield or fee parameters
  - pool / invoice / credit contract references
  - protocol revenue balances
  - funding, collateral, or KYC controls
- If the attacker drained funds, separate:
  - funds still in Astera-controlled contracts
  - funds sent to attacker-controlled Stellar accounts
  - funds sent to a token issuer or exchange

### Communication template

```text
Astera security update - [YYYY-MM-DD HH:MM UTC]

We identified a compromise affecting protocol administrative control. We have
paused contract write operations while we rotate control, review admin actions,
and confirm whether user funds were affected.

Current status:
- Administrative investigation in progress
- User-facing write operations remain paused
- Next update by [YYYY-MM-DD HH:MM UTC]
```

### Remediation

1. If multisig exists, revoke the compromised signer and verify the new signer
   set with one low-risk admin transaction before resuming any other action.
2. If the compromised key belonged to a single-signature admin account:
   - recover control of the Stellar account if possible
   - if recovery is impossible, treat the existing contracts as permanently
     compromised and prepare a migration to newly deployed contracts
3. Reconcile every admin action taken since the compromise window opened.
4. Reapply correct configuration values if they were changed.
5. If an unauthorized upgrade was proposed, leave the contracts paused until the
   queued Wasm hash is understood and a safe upgrade path is chosen.
6. If funds were drained:
   - export all tx hashes and recipient accounts
   - contact the affected stablecoin issuer immediately if that asset supports
     issuer-side freezes or clawback
   - engage legal, compliance, and exchange escalation channels
   - prepare an investor restitution or migration plan

### Recovery notes

- There is no contract-level `set_admin` function today. Recovery depends on
  control of the Stellar admin account itself.
- If attacker-controlled transactions already changed on-chain state, those
  writes are not reversible by decree. Use signer rotation, patching, and
  migration planning rather than assuming a rollback exists.

## Scenario 3: Stellar RPC Outage

### Immediate actions

1. Decide whether the outage is:
   - one RPC provider failing
   - a Horizon-only issue
   - a broader Stellar network incident
2. Check:
   - [Stellar Status Page](https://status.stellar.org)
   - direct `curl` or `POST getHealth` checks against candidate RPC endpoints
   - Stellar Expert for fresh ledgers and transactions
3. If write flows cannot be simulated or submitted safely, move the protocol into
   operational read-only mode:
   - do not start new funding actions
   - do not tell users to submit deposits or repayments
   - keep read-only pages and status updates live if they still work

### Fallback endpoints

| Network | Soroban RPC | Horizon |
| --- | --- | --- |
| Mainnet | `https://soroban-mainnet.stellar.org` | `https://horizon.stellar.org` |
| Testnet | `https://soroban-testnet.stellar.org` | `https://horizon-testnet.stellar.org` |

### Frontend configuration

Current repo knobs:

- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_HORIZON_URL`
- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_STELLAR_RPC_URL` for the `/api/health` route

Operator procedure:

1. Point `NEXT_PUBLIC_HORIZON_URL` and `NEXT_PUBLIC_SOROBAN_RPC_URL` at the
   fallback endpoints.
2. Also set `NEXT_PUBLIC_STELLAR_RPC_URL` to the same fallback endpoint so the
   health route and alerting use the same provider.
3. Verify `/api/health` reports the fallback endpoint as healthy before telling
   users the outage is mitigated.

Important limitation:

- `frontend/lib/stellar.ts` currently hardcodes the default Soroban and Horizon
  endpoints for the contract client path. That means a true client-side failover
  without redeployment is not fully guaranteed today. If runtime env overrides do
  not take effect for the affected path, keep the app in read-only mode and ship
  a hotfix deployment instead of claiming full recovery.

### Communication template

```text
Astera service update - [YYYY-MM-DD HH:MM UTC]

The Stellar RPC / Horizon path we rely on is degraded. We are switching to
fallback infrastructure and keeping the protocol in read-only mode until write
operations are confirmed healthy.

What this means for users:
- Existing on-chain state remains intact
- New write actions may be delayed or temporarily unavailable
- We will post the next update by [YYYY-MM-DD HH:MM UTC]
```

### Remediation

1. Switch to the fallback endpoint set and verify:
   - fresh ledgers
   - contract simulation success
   - one read-only invoice query
   - one low-risk signed transaction on testnet or staging
2. If only Horizon is degraded, use RPC-backed read paths where available and
   communicate history limitations.
3. If the public Stellar RPC itself is degraded, keep read-only mode active and
   publish a status banner until upstream recovery is confirmed.

### Resume checklist

- `/api/health` reports `ok`
- Explorer and CLI agree on recent ledgers
- Manual contract reads succeed
- One signed write flow succeeds in a controlled test
- Community update published before fully resuming writes

## Scenario 4: Accidental Bad State Transition

Example: an invoice is incorrectly marked `Defaulted`.

### Immediate actions

1. Confirm whether the problem is on-chain state, off-chain indexing, or UI
   display only.
2. If more incorrect writes could follow, pause the affected contracts.
3. Capture:
   - invoice record from the invoice contract
   - funded invoice record from the pool contract
   - payment history from the credit score contract
   - tx hash that caused the bad transition

### Assessment

Use this correction matrix:

| Problem | Manual correction available | Function(s) | Notes |
| --- | --- | --- | --- |
| Invoice wrongly disputed | Yes | `resolve_dispute` | Oracle can resolve immediately; admin can resolve after the dispute window. |
| Pre-funding invoice should be voided | Yes | `cancel_invoice` | Works for `Pending`, `AwaitingVerification`, `Verified`, and admin-cancelable `Disputed`. |
| Grace period too short before default | Yes, but only before default | `set_grace_period`, `set_invoice_grace_period` | Use to prevent an incorrect future default, not to undo one already written. |
| Wrong pool / credit contract reference | Yes | `set_pool`, `set_pool_contract`, `set_invoice_contract` | Use after redeploy or migration. |
| Invoice already marked `Defaulted` or `Paid` incorrectly | No direct undo | Upgrade or migration required | There is no built-in admin function to revert these terminal transitions. |
| Credit score payment/default already recorded incorrectly | No direct undo | Upgrade or migration required | `record_payment` and `record_default` are append-only in current design. |

### Communication template

```text
Astera protocol correction update - [YYYY-MM-DD HH:MM UTC]

We identified an incorrect protocol state transition affecting [invoice / pool /
credit record]. We have paused the affected write path while we determine whether
the state can be corrected with existing admin controls or requires a contract
patch.

User impact:
- [Describe affected invoices, SMEs, investors, or none]
- Next update by [YYYY-MM-DD HH:MM UTC]
```

### Remediation

1. Use a manual correction only when a first-class admin or oracle function
   exists for that specific state.
2. If the transition is terminal and there is no correction function:
   - leave contracts paused
   - prepare a minimal patch or migration
   - rehearse the fix on testnet
   - use the upgrade timelock flow or a controlled redeploy
3. If the bad state came from a front-end or indexer display bug rather than an
   on-chain write, fix the off-chain component and publish a clarification.
4. If investors or SMEs were economically harmed, prepare a compensation or
   reconciliation note before reopening the affected flow.

### When to choose upgrade vs manual correction

- Use manual correction when the existing admin or oracle interface can fully
  repair the affected state without rewriting history.
- Use a contract upgrade when:
  - the wrong state is already committed on-chain and no admin setter exists
  - credit score history must be corrected
  - a pool / invoice coupling bug caused the invalid transition
  - the recovery requires new invariants or migration logic

## Scenario 5: High Default Rate

### Threshold for halting new funding

Until a stricter risk policy is ratified, halt new funding approvals if any of
these happen in a rolling 30-day window:

- 3 or more funded invoices default
- defaulted principal exceeds 10% of current pool value
- one SME default represents more than 5% of active deployed principal

Because invoice funding is admin-triggered, "pause new funding requests" means
stop calling `fund_invoice` and `fund_multiple_invoices` immediately. Use a full
pool pause only if contagion risk, pricing uncertainty, or collateral handling
also looks unsafe.

### Immediate actions

1. Stop approving new funding transactions.
2. Review all open invoices, overdue invoices, and collateral positions.
3. If defaults appear systemic rather than isolated, pause the pool and invoice
   contracts while the exposure review is completed.

### Assessment

- Build a table of:
  - invoice id
  - SME
  - principal
  - due date
  - amount repaid
  - collateral posted
  - collateral already settled or not
- Review:
  - `get_funded_invoice`
  - `get_token_totals`
  - `get_storage_stats`
  - credit score trends for affected SMEs
- Separate:
  - temporary late payments likely to cure
  - true defaults past grace period
  - concentration risk by token, debtor, and SME cluster

### Contacting defaulting SMEs

Use a time-boxed escalation path:

1. T+0: email and in-app notice with amount due, cure deadline, and repayment
   instructions
2. T+1 business day: phone / direct account-manager outreach
3. T+3 business days: legal or collections notice if applicable
4. Record every attempt with timestamp, owner, and outcome

### Collateral seizure process

1. Confirm the invoice remains unpaid after due date plus grace period.
2. Confirm a collateral deposit exists and has not already been settled.
3. Execute `seize_collateral` from the pool admin account.
4. Record:
   - tx hash
   - seized token
   - seized amount
   - remaining uncovered loss
5. Notify investors whether the collateral fully covered, partially covered, or
   failed to cover the default.

### Investor communication template

```text
Astera risk update - [YYYY-MM-DD HH:MM UTC]

We have temporarily halted new funding approvals while we respond to an elevated
default rate in the active invoice book. Existing investor balances remain
visible, and we are reviewing each affected invoice, collateral position, and
expected recovery path.

What we are doing now:
- Stopping new funding approvals
- Contacting affected SMEs
- Enforcing collateral recovery where permitted
- Preparing a detailed exposure update

Next update by [YYYY-MM-DD HH:MM UTC]
```

### Remediation

1. Tighten risk controls before resuming funding:
   - lower `set_max_invoice_amount`
   - increase collateral requirements with `set_collateral_config`
   - review concentration and KYC settings
2. Publish an exposure summary to investors once validated.
3. Resume funding only after default causes are understood and documented.

## Appendix: Emergency Contacts and Escalation

### Core team roles

Fill these before mainnet launch:

| Role | Primary channel | Backup channel |
| --- | --- | --- |
| Incident Commander | `TBD` | `TBD` |
| Security Lead | `TBD` | `TBD` |
| Protocol Engineering Lead | `TBD` | `TBD` |
| Frontend / Infrastructure Lead | `TBD` | `TBD` |
| Communications Lead | `TBD` | `TBD` |
| Legal / Compliance Lead | `TBD` | `TBD` |

### External references

- Stellar network status: <https://status.stellar.org>
- Stellar Expert mainnet: <https://stellar.expert/explorer/public>
- Stellar Expert testnet: <https://stellar.expert/explorer/testnet>

### Key contract addresses

Fill these before every release window and confirm they match the currently
deployed frontend environment:

| Component | Testnet | Mainnet |
| --- | --- | --- |
| Invoice contract | `TBD` | `TBD` |
| Pool contract | `TBD` | `TBD` |
| Credit score contract | `TBD` | `TBD` |
| Share token contract(s) | `TBD` | `TBD` |
| Treasury address | `TBD` | `TBD` |
| Primary Soroban RPC | `https://soroban-testnet.stellar.org` | `https://soroban-mainnet.stellar.org` |
| Primary Horizon | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |

### Evidence checklist

For every incident, retain:

- tx hashes
- contract IDs
- ledger numbers
- exact timestamps in UTC
- screenshots of explorer state
- exported contract configs and version outputs
- public communications sent to users
