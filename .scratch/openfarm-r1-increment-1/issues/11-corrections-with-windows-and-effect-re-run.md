# 11 — Corrections with windows and effect re-run

**What to build:** A person can correct an entry within their Role's Correction Window with a reason; the original stays visible and a Correction row supersedes it. Correcting a litres entry recomputes that Session's reconciliation; correcting a Completion re-runs its effects idempotently. Windows: Staff 2 hours on their own entries, Manager 30 days on any, Owner always, Vet always on their own health entries — all farm parameters. Sale corrections (Owner-only) and irreversible-effect flagging are specified for later increments but the flagging mechanism (Needs Review on the Correction) exists now.

**Blocked by:** 09, 10

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Correcting within the window succeeds and produces a Correction row plus Audit Event; outside the window it is refused with the window named
- [ ] A corrected litres value updates the Milk Record via supersession and recomputes the Bulk reconciliation flag
- [ ] The original entry remains readable in history alongside the Correction and its reason
- [ ] A Correction that would need an effect the system cannot undo marks itself Needs Review for the Manager (mechanism tested with a seeded case)
- [ ] Tests cover each Role's window with the controllable clock
