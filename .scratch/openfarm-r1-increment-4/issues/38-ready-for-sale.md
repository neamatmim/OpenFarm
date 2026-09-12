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

## Decisions and departures

- **A set-aside is a record, not a dismissal.** Why she is staying is worth as much as why she
  went, so the reason is required and kept. One row per animal: a second look replaces the first,
  because what matters is the last thing the Manager decided.
- **A weight set aside is still overruled by the window opening; a window set aside is the last
  word.** There is no stronger ground left to raise after the window, and a suggestion that
  returns every morning after it has been answered is a suggestion nobody reads.
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

`pnpm check-types` clean across the workspace; `pnpm test` 380 passing (351 api + 19 web + 10
i18n), up from 376 — a suggestion on weight with the Manager confirming, a suggestion when the
window opens, the milker refused and the wormed bull refused with the day he is fit, and one set
aside going quiet while staying on the board. `pnpm build` clean; `oxfmt` and `oxlint` clean on
every changed file.
