# 08 — Instances, claiming and per-animal Step completion

**What to build:** When a milking Session's time arrives, the scheduler raises one Instance of the current milking Version per Pen whose animals are in the Milking State, assigned to the Staff Role. A Staff member on the Shed Phone sees today's Instances for their Pens, claims one, and works it on the pen board — non-animal Steps as chips above, the Pen's animals as photo tiles in any order, each opening a full-screen keypad sheet for litres with skip-with-reason — exactly the shape the prototype settled. Evidence outside its sane range warns before confirm. When every tile and chip is done the Bulk-total Step appears; completing it moves the Instance to *completed*. The Manager can pin or reassign an Instance.

**Blocked by:** 05, 06, 07

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] The scheduler (clock-driven, tested with the controllable clock) creates the right Instances for the right Pens at each Session and never duplicates
- [ ] Claiming is exclusive; the Manager can pin to a person or reassign
- [ ] Per-animal Step Completions are one per animal with the shape from the prototype — done with evidence and destination, or skipped with a reason — and a Step cannot be finished while any animal is neither
- [ ] Number Evidence outside the sane range shows a warning the user must acknowledge; the value is still allowed
- [ ] Photo Evidence uses the browser camera capture and is stored against the Completion
- [ ] The tiles UI: chips for prep/clean Steps, tiles dim with a tick when done, the Bulk-total Step appears only when all else is done; entirely in Bangla with icons
- [ ] Tests through the primary seam cover scheduling, claiming, completion ordering rules, skip, and that completing all Steps yields a completed Instance with all Completions attributed to the active user
