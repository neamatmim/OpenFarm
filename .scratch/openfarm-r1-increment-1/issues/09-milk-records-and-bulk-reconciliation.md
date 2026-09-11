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

**Review outcomes folded in (follow-up commit).** Both review axes independently found the same hole, and it was the one that mattered:

- **The Withdrawal gate ran on the phone's clock.** `recordedAt` arrives from the device — offline capture needs it — and the gate compared it against the Withdrawal's end. A phone running fast, or one sending a made-up time, walked a treated cow's milk into the tank while the record said `forced: false`. The server's clock alone is no better: milk drawn under a Withdrawal that ended before the phone found signal would also pass. The gate now asks whichever of the two clocks still holds it shut.
- **An opening-register cow read as day 0 of her Lactation.** Registering her dated the Lactation to today, so a cow two hundred days in showed as freshly calved — the ticket's own note says she should read as unknown. Without a seeded calving date the start is now null, and days-in-milk with it.
- **The flag never reached the Instance.** The reconciliation lived only on the Milking Session, and the only reader was a procedure no screen called — so a Manager opening the flagged work saw nothing. `instances.get` now hands back the Session's reconciliation.
- **A forced Destination was silent.** The record knew the answer had been taken out of the person's hands; the phone showed a plain tick. It now says so.
- A `bulk_total` Step accepted a Destination, so a tank reading could be filed as "calves"; a future calving date was refused on `setState` but not at registration; `farm.setParameters` also edited the Shed Phone auto-lock, which nothing here asked for.
- Tidying: one rounding for litres shared by the arithmetic and the column, one derived `lactationView` behind both screens that show it, a named type for the Session key, a redundant read dropped from `milk.forAnimal`, its total and its records now covering the same Lactation, and a dead translation key removed.

Separately, `resolveStepAnimal` accepted an animal that had left the farm as long as it still carried the Instance's Pen — ticket 08's review closed that for the pen board and for finishing, but not for the write itself. With Steps now writing farm records it would have booked litres to a sold cow.
