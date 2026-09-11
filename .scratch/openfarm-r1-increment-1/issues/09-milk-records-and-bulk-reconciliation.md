# 09 — Milk Records and Bulk reconciliation

**What to build:** Completing the litres Step writes a Milk Record for that cow and Session with a Destination — Bulk by default, Calves selectable, Discard selectable (the forced-Discard gate arrives with health in increment 3, but the field and the tile's lock rendering exist now). The final Step's Bulk total is reconciled against the sum of Bulk Milk Records; a difference beyond the tolerance parameter is flagged on the Instance for the Manager. Lactation numbering and days-in-milk derive from a seeded calving date until breeding arrives in increment 5. Effects run in the same transaction as the Completion and are idempotent on the Completion id.

**Blocked by:** 08

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Each done per-animal Completion produces exactly one Milk Record (animal, Session, litres, Destination); replaying the same Completion produces none
- [x] Destination defaults to Bulk; Calves and Discard are selectable; an animal flagged under milk Withdrawal (seeded for the test) renders locked and its Completion is forced to Discard
- [x] The Bulk total is stored on the Session; the difference against the per-cow Bulk sum is computed and flagged beyond the tolerance parameter (default 5%)
- [x] A cow's lactation number and days-in-milk are derived, never entered
- [x] Tests cover the effect, idempotency, Destination rules, reconciliation flagging at and beyond tolerance

**How it was built.** A Step now declares an **Effect** — what completing it writes into the farm's records beyond the Evidence itself. Two exist so far: `milk_record` on the per-cow Step and `bulk_total` on the closing one. The effect runs inside the Completion's own transaction, so the Audit Event, the Completion and the record it wrote all stand or fall together, and every effect is keyed on the Completion, so a phone replaying its outbox — or a Manager correcting an entry — replaces what it wrote instead of adding to it (ADR 0002).

Decisions worth remembering:

- **The Destination is part of the act, not of the Evidence.** It sits in its own column on the Step Completion rather than in the positional evidence array, which is what lets a Correction re-run the effect from the Completion alone (ticket 11).
- **The server decides the Destination, not the phone.** A cow under Withdrawal goes to Discard whatever arrives, and the record says the answer was `forced` — so milk poured away under a gate reads apart from milk poured away by judgement. The phone still renders the tile locked, but that is courtesy; the gate is server-side.
- **Reconciliation re-runs whenever a cow's entry changes**, not only when the tank is read. Correcting a mis-keyed cow after the closing Step would otherwise leave a stale difference — and a stale flag — standing.
- **Exactly at the Tolerance is not flagged**; beyond it is. The Tolerance in force is stored on the Session, so a flag stays explicable after the Manager changes the parameter.
- **Nothing about a Lactation is typed.** Reaching Milking starts the next one and the number goes up by one; the only input anyone gives is when she calved, and days-in-milk is derived from that. A cow with no seeded calving date reads as unknown rather than as day zero.
- A Version whose Step writes a record but asks for no figure — or records milk once for the whole Pen — cannot be published.
