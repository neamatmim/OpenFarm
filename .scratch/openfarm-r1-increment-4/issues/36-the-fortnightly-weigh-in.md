# 36 — The fortnightly weigh-in

**What to build:** Every second week somebody walks the fattening pen with a scale and types in what each animal weighs. It is one piece of work per Pen with a per-animal Step, like every other round, and the farm keeps every reading — because the whole of fattening is the difference between them. A reading that jumps implausibly is queried on the spot rather than swallowed.

**Blocked by:** 35

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 63; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Weigh-in").

- [x] A weigh-in is one Instance per Pen with a per-animal Step, raised by the Playbook like anything else
- [x] The reading is typed in kilograms and kept per animal, with the method recorded as a scale reading
- [x] A reading outside a sane range, or an implausible jump from her last one, is queried before it is accepted — and can still be confirmed
- [x] An animal skipped carries her reason, and the round can still finish
- [x] Tests cover a round of weights, an implausible jump, a skip, and the readings on her page

## What was built

A seventh Step Effect, `weigh_in`, so the round is one Instance per Pen with a per-animal Step
raised by the Playbook like any other — nothing about it is special except what it records.

**Every reading is kept.** The whole of fattening is the difference between two of them, and a
farm that kept only the latest would have thrown away the thing it was measuring. Keyed on the
Step Completion like the Milk Record, so a phone replaying its outbox or a Manager correcting an
entry replaces *that weighing* rather than adding a second one.

**The implausible jump is the farm's question, not the phone's.** `implausibleChange` in the
domain compares the reading against her last one before it — not simply her latest, because an
entry that synced late belongs where it happened. More than 2.5 kg a day gained or 3 kg a day
lost is refused with what the farm knows: her last weight, the days between, the daily rate.

**And it can still be confirmed.** The refusal travels back as a *question* rather than a rule —
the batch verdict carries `mayConfirm` — and the Outbox offers "it is right, send it". The entry
goes back under a new id carrying what the person was shown, which is kept with the reading for
ever. A figure that looks wrong a year from now says whether anybody was asked about it.

A skipped animal has no reading to her name and the round still finishes. Her page opens with
every time she has been on the scale, newest first, and says which readings were queried.

## Decisions and departures

- **The query reaches the person through the Outbox, not at the animal.** Recording is offline
  first (ADR 0002): the entry goes to the phone's queue and the farm answers when there is signal.
  Only the farm can catch an implausible jump — the phone does not know what she weighed a
  fortnight ago — so the question cannot be asked at the crush without a round trip a shed has no
  signal for. The Evidence's own `min`/`max` still warns on the spot, offline, as it always did.
- **The plausible daily change is not a Farm Parameter.** 2.5 kg gained and 3 kg lost are facts
  about cattle, not about this farm, and the spec's parameter list does not name them. Loss is
  given more room than gain: an animal can go off its feed and drop fast, and the farm would
  rather be told that than argued with.
- **`method` has one value.** The decision says the method is recorded as *scale* and that a girth
  tape, if one is ever used, is flagged *estimated*. The column exists with one value so the farm
  knows a reading was measured; the second value arrives with the thing that produces it.
- **Two readings less than a day apart are not judged.** A daily rate over a few hours is noise —
  two weighings on one morning differ by what the animal drank.

## Not done, and why

- **Nothing is derived yet.** Average daily gain, days on feed and the projection to the Target
  Window are ticket 37's; this ticket builds the readings they are worked out from.
- **The weigh-in SOP is not seeded.** Like every other procedure on this farm, the Owner writes
  and publishes it; the test publishes its own. The fortnightly cadence is a schedule the Playbook
  holds, not a rule in the code.
- **A confirmed reading raises nothing for the Manager.** It is kept and flagged on her page, but
  nobody is told. Whether a queried weight belongs on the Manager's queue is a notification-table
  question, and that table has not been asked about it.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 374 passing (343 api + 21 web + 10
i18n), up from 370 — two at the router seam for the round, the jump and the skip, and two at the
outbox seam for confirming a doubted figure and refusing to confirm a rule. `pnpm build` clean;
`oxfmt` and `oxlint` clean on every changed file.
