# 09 — Milk Records and Bulk reconciliation

**What to build:** Completing the litres Step writes a Milk Record for that cow and Session with a Destination — Bulk by default, Calves selectable, Discard selectable (the forced-Discard gate arrives with health in increment 3, but the field and the tile's lock rendering exist now). The final Step's Bulk total is reconciled against the sum of Bulk Milk Records; a difference beyond the tolerance parameter is flagged on the Instance for the Manager. Lactation numbering and days-in-milk derive from a seeded calving date until breeding arrives in increment 5. Effects run in the same transaction as the Completion and are idempotent on the Completion id.

**Blocked by:** 08

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Each done per-animal Completion produces exactly one Milk Record (animal, Session, litres, Destination); replaying the same Completion produces none
- [ ] Destination defaults to Bulk; Calves and Discard are selectable; an animal flagged under milk Withdrawal (seeded for the test) renders locked and its Completion is forced to Discard
- [ ] The Bulk total is stored on the Session; the difference against the per-cow Bulk sum is computed and flagged beyond the tolerance parameter (default 5%)
- [ ] A cow's lactation number and days-in-milk are derived, never entered
- [ ] Tests cover the effect, idempotency, Destination rules, reconciliation flagging at and beyond tolerance
