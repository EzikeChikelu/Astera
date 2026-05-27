## Summary

<!-- Brief description of what changed and why. -->

## Related Issue

<!-- Every PR should close or reference at least one issue. -->
Closes #

## Type of Change

<!-- Check all that apply. -->
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / internal improvement
- [ ] Documentation update
- [ ] Test-only change
- [ ] DevOps / CI change

## Changes

<!-- List the key changes: new files, modified functions, removed code. -->
-
-

## Testing Performed

<!-- Describe how you verified the changes work. -->
-

## Smart Contract Security Checklist

<!-- Required for any change to `contracts/`. Delete section if not applicable. -->

- [ ] CEI pattern followed (checks before effects before interactions)
- [ ] All arithmetic uses checked operations (`checked_add`, `checked_sub`, `saturating_*`) — no bare `+` or `*` without overflow guard
- [ ] New state-changing functions have reentrancy guard (`non_reentrant_start` / `non_reentrant_end`)
- [ ] New admin functions emit events
- [ ] No `panic!()` with string messages — typed errors (`PoolError`, `InvoiceError`) used instead
- [ ] Storage TTL extended in all functions that touch persistent state
- [ ] Fuzz test added or updated for new invariants

## Checklist

- [ ] Tests added or updated (`cargo test` / `npm test` passes)
- [ ] Documentation updated (README, inline docs, API reference)
- [ ] For security or incident-response changes, at least one core team approval is noted in this PR
- [ ] `cargo fmt` and `cargo clippy -- -D warnings` pass (if contracts changed)
- [ ] `npm run lint` and `npm run build` pass (if frontend changed)
- [ ] No secrets, private keys, or production contract IDs in code
- [ ] API reference updated if contract interface changed
- [ ] PR title is descriptive and follows `type(scope): description` convention
- [ ] Smart contract security checklist above completed (if `contracts/` changed)

## Screenshots (UI changes only)

<!-- Add before/after screenshots for any frontend changes. -->
