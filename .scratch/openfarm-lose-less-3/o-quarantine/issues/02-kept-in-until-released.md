# 02 — Kept in until released

**What to build:** A bull in Quarantine is walked only into a quarantine pen, whichever way the Move comes. Bulls
already in Quarantine outside one are left where they stand and named on the Pens page.

**Blocked by:** 01

**Status:** done (2026-10-03).

**As built:** `assertQuarantineStaysIn` in `herd-store.ts`, called in `walkTo` and in `walkByStep`'s own path (a
Correction re-routing a Step's walk — a Step's first walk goes through `walkTo`). `herd.quarantineAstray` lists them on
the Pens page. **Found by the seed:** a bull taken ill in Quarantine is walked to the isolation pen — so the isolation
pen must be marked a quarantine pen too (the plan's "may double as the sick pen"); the seed marks it, and the real farm
will need to. The astray seed bull is written straight into a bull pen.

- [x] **Glossary:** **Move** widened (an animal in Quarantine is walked only into a quarantine pen); **Release**
      widened (the walk out of quarantine is the Release's, once he is Fattening).
- [x] **Schema:** none.
- [x] **Rule:** one guard, `assertQuarantineStaysIn(tx, beast, toPenId)`, refusing `stays_in_quarantine` when
      `beast.state` is Quarantine and the Pen is not marked — called in `walkTo` (`herd-store.ts:444`, so a Move entry
      and a phone's Batch both) and `walkByStep` (782, a Step that walks her). The Release walks him after
      `entersState` has made him Fattening, so it passes. A word for it in `apps/web/src/lib/correction-refusal.ts`
      and among the entry refusals a phone's late Batch shows.
- [x] **Screen:** the Move sheet offers a bull in Quarantine only quarantine pens. Admin → Herd lists "in Quarantine,
      not in a quarantine pen" with their tags, for the Manager to walk in; empty, nothing is shown.
- [x] **Tests:** `routers/quarantine-pens.test.ts` gains: a bull in Quarantine walked to a fattening pen — refused; to
      another quarantine pen — taken; one standing in an unmarked pen walked into a quarantine pen — taken; a Release
      walking him to his band pen — taken; a Fattening bull walked into a quarantine pen — taken. **Proved by switching
      off** the guard in `walkTo` and in `walkByStep` in turn — red.
- [x] **Somebody opens it** (seed): a seed bull in Quarantine; the Move sheet offers only the quarantine pen; a bull
      registered in Quarantine before 01 is named on Admin → Herd.
