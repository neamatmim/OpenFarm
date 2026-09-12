# 38 — Ready for Sale: the farm suggests, the Manager confirms

**What to build:** When an animal reaches her target weight, or her Target Window opens, the farm says so — and the Manager decides. Confirming is the State change, because whether an animal is ready to sell is a judgement about the animal in front of you and not an arithmetic result. An animal under meat withdrawal cannot be made ready at all: her days are not up.

**Blocked by:** 36

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 63; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Ready for Sale").

- [x] The farm suggests an animal when her target weight is reached or her Target Window opens, and says which of the two it was
- [x] The Manager confirms, and that is the State change; Barn Staff cannot
- [x] An animal under meat Withdrawal cannot be made ready, and the refusal says the day she is fit
- [x] A suggestion is not a queue that grows for ever: one the Manager has considered and not acted on does not keep shouting
- [x] Tests cover a suggestion on weight, one on the window opening, the Manager confirming, and the withdrawal refusal

## What was built

`ready.suggestions` — the animals the farm thinks may be sold, each saying which of the two
grounds it is on. `ready.confirm` is the State change, and `ready.setAside` is the Manager saying
she is staying, with their reason in their own words.

The window wins when both grounds are true: a target weight is a figure somebody chose, and a
market day is not.

An animal inside her meat Withdrawal cannot be made ready at all — not warned about, not confirmed
anyway — and the refusal carries the day she is fit, because "not yet" without a date is not an
answer anybody can plan around.

## What the review changed

Both axes found the same hole, independently, and it was the serious one.

- **The gate was decorative.** `ready.confirm` refused an animal inside her meat Withdrawal — and
  `animals.setState` would move her straight to `ready_for_sale` with no check at all, because the
  lifecycle lists that transition as legal. A gate on one door and not the other is no gate. This
  is the exact failure the whole system exists to prevent, and my own test had been *using* the
  unguarded door to set up its fixtures. `setState` now refuses the move by name and sends the
  caller to the door that checks; there is a test for the bypass.
- **I invented farm policy.** "A weight set aside is overruled by the window; a window set aside is
  the last word" was mine, not yours and not the spec's — and because an open window never closes,
  it would have silenced an animal permanently even after she passed her target weight. Gone. The
  rule is now only what criterion 4 actually asks: the farm stops saying it until **a ground
  appears that was not there when the Manager looked**. No ranking, no precedence.
- **Both grounds are reported when both hold.** The decision says "target weight reached **or**
  Target Window open"; preferring one was me deciding for the Manager which fact should move them.
- **The list offered work the Manager could not do**: animals still in Quarantine, which `confirm`
  then refuses, and animals inside their withdrawal, which it also refuses. Only animals who could
  actually be confirmed are suggested now.
- **`before` was read outside the transaction**, which is the one thing the audit module says a
  snapshot reader exists to prevent; the withdrawal and State checks were too, so a dose recorded
  between parsing and writing would have slipped past. Both are read inside it now.
- **A second set-aside erased the first** — the row was overwritten with no `before`, so the
  earlier decision left no trace, against the rule that the original stays visible.
- **The query had a limit and no order**, so past a hundred head suggestions would have vanished
  without saying so, and which ones vanished was undefined.
- **`suggestions` and `board` were two copies of one query** that had already begun to disagree
  about states, limits and readings. One `fatteningRows` now.
- **`ready.title` duplicated `state.ready_for_sale`** and the two Banglas disagreed for one State.
- **Readiness has left the fattening file**: the Eid table, the gain arithmetic and the readiness
  rules were three unrelated reasons to edit one file.
- **The glossary gained Suggestion and Set Aside**, both saying what they are *not*: a Suggestion
  is not a Gate and not an Alert, and a Set Aside is not a Needs Review.

## Decisions and departures

- **A set-aside is a record, not a dismissal.** Why she is staying is worth as much as why she
  went, so the reason is required and kept. One row per animal holds the latest; the trail holds
  every one of them.
- **A State change overtakes a set-aside.** An animal confirmed Ready and later put back to
  Fattening is one the Manager has changed their mind about twice, and the older word should not
  go on silencing the farm. Nothing is deleted to say so — the set-aside stays on the record and
  simply stops being the last word.
- **Confirming requires her to be in Fattening**, which is what the lifecycle already says; an
  animal still in Quarantine is refused by name rather than silently skipped.
- **`READY_REASONS` exists twice**, in the schema and in the domain, as `SIDES` and
  `ANIMAL_STATES` already do: the db package depends on nothing, and the domain keeps the rule
  that reads it.

## What the audit guard caught

My first version had `confirm` **delete** the set-aside row, and `audit-guard.test.ts` refused it:
no router deletes anything. It was right, and the rule pointed at a better design — comparing the
set-aside against her last State change says the same thing without throwing away the record of
what somebody decided and why. The guard is doing exactly what it was built to do.

## Not done, and why

- **Nobody is told.** A new suggestion appears on a screen the Manager has to open; it does not
  reach the Manager's queue or their phone. Whether readiness belongs in the notification table is
  a question that table has not been asked, and inventing an answer here would be inventing farm
  policy.
- **No Ready-for-Sale tile on the Owner's home.** The spec puts one there with an Eid projection;
  the home screen's tiles are a screenful of their own and this ticket did not ask for it.
- **Nothing sells her yet.** The Sale is ticket 39; this ticket only gets her to the gate.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 381 passing (352 api + 19 web + 10
i18n), up from 376 — a suggestion on weight with the Manager confirming, a suggestion when the
window opens, the other door refused at the gate, the milker refused and the wormed bull refused
with the day he is fit, and one set aside going quiet, staying on the board, and being raised
again when he makes his weight a fortnight later. `pnpm build` clean; `oxfmt` and `oxlint` clean on
every changed file.
