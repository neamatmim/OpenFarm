# 08 — Instances, claiming and per-animal Step completion

**What to build:** When a milking Session's time arrives, the scheduler raises one Instance of the current milking Version per Pen whose animals are in the Milking State, assigned to the Staff Role. A Staff member on the Shed Phone sees today's Instances for their Pens, claims one, and works it on the pen board — non-animal Steps as chips above, the Pen's animals as photo tiles in any order, each opening a full-screen keypad sheet for litres with skip-with-reason — exactly the shape the prototype settled. Evidence outside its sane range warns before confirm. When every tile and chip is done the Bulk-total Step appears; completing it moves the Instance to *completed*. The Manager can pin or reassign an Instance.

**Blocked by:** 05, 06, 07

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] The scheduler (clock-driven, tested with the controllable clock) creates the right Instances for the right Pens at each Session and never duplicates
- [x] Claiming is exclusive; the Manager can pin to a person or reassign
- [x] Per-animal Step Completions are one per animal with the shape from the prototype — done with evidence and destination, or skipped with a reason — and a Step cannot be finished while any animal is neither
- [x] Number Evidence outside the sane range shows a warning the user must acknowledge; the value is still allowed
- [x] Photo Evidence uses the browser camera capture and is stored against the Completion
- [x] The tiles UI: chips for prep/clean Steps, tiles dim with a tick when done, the Bulk-total Step appears only when all else is done; entirely in Bangla with icons
- [x] Tests through the primary seam cover scheduling, claiming, completion ordering rules, skip, and that completing all Steps yields a completed Instance with all Completions attributed to the active user

**Done note:** The milking SOP runs end to end. `sop_instance` pins the Version it was raised from — publishing a change mid-day does not move work already in someone's hands (ADR 0001, demonstrated by a test) — and a unique index on (definition, pen, due time) makes `ensureDue` idempotent, so the phone and the office can both call it on open. Claiming is conditional on `claimed_by IS NULL`, so two phones cannot both take it; the Manager can pin or reassign, which takes it out of the previous person's hands. `step_completion` is one row per (instance, step, animal): done with evidence or skipped with a reason, recording again *corrects* rather than duplicating, out-of-range numbers are kept along with the fact that they were out of range, and each row carries the person **and** the phone. `complete` refuses while anything is outstanding, naming the tags that are left. The pen board is the prototype's shape: chips for once-only Steps, photo tiles in any order dimming with a tick, a full-screen sheet with a large Bangla keypad, skip-with-reason, camera photo, and the closing bulk-total Step appearing only when everything else is done.

**Two design gaps the work exposed.** (1) An SOP had no way to say *which* animals it concerns, so the scheduler could not tell a milking pen from a fattening one; `appliesTo` was added to the content model — and the first test run caught that it was in the domain type but not the wire schema, so zod silently stripped it and every pen qualified. (2) `instances.today` returned every open Instance ever rather than today's; it is now scoped to the farm's day, because yesterday's unfinished work belongs on the Overdue list (ticket 10).

Three tests also had to stop asserting "nothing else exists": vitest runs files in parallel against one shared database, so those assertions were racy. They are scoped to their own data now, as the harness README asks.

**Review outcomes folded in (follow-up commit).** Twelve findings; four would have bitten in the barn:

- **A pen-level Step could be recorded twice.** The unique index spanned a nullable `animal_id`, and Postgres treats NULLs as distinct — so correcting a mistyped bulk total inserted a second row instead of replacing the first, and reports would read whichever came back first. A non-null `animal_key` sentinel now gives the index something to bite on, backfilled in the migration.
- **A dead cow blocked the pen board.** An exited animal keeps its Pen, so `sold`/`died`/`culled` animals appeared as tiles and `complete` refused to finish until someone recorded milk for them. Exits are excluded from every selection now.
- **Required Evidence was counted, not checked per slot** — so a Step with an optional note and a required number passed on the note alone, and a Step with a required *photo* could never be recorded at all, because the photo travels in its own field and the count was always short.
- **The closing Step was "the last one"**, ignoring whether it repeats per animal. An SOP whose last Step is per-cow offered a closing button that the server rejected, stranding the Instance; a one-Step SOP never showed Finish. The domain already had `isClosingStep` — the UI just wasn't using it.

Also: `complete` had no state guard, so approved work could be knocked back; `assign` could pin an Instance to someone outside the farm and strand it, or reopen finished work; the Instance's `assignedRole` was stored but never enforced, so Staff could work a Vet's SOP — and from a shed phone, which ADR 0003 forbids; an explicit pen filter was silently widened for Staff; the phone sent `[true]` for every non-number Step whatever its Evidence declared, and had no photo size guard or Back button on the per-animal sheet; today's list said "Start" for work someone else already held.
