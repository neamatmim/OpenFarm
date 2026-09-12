# 36 — The fortnightly weigh-in

**What to build:** Every second week somebody walks the fattening pen with a scale and types in what each animal weighs. It is one piece of work per Pen with a per-animal Step, like every other round, and the farm keeps every reading — because the whole of fattening is the difference between them. A reading that jumps implausibly is queried on the spot rather than swallowed.

**Blocked by:** 35

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 61; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Weigh-in").

- [x] A weigh-in is one Instance per Pen with a per-animal Step, raised by the Playbook like anything else
- [x] The reading is typed in kilograms and kept per animal, with the method recorded as a scale reading
- [x] A reading outside a sane range, or an implausible jump from her last one, is queried before it is accepted — and can still be confirmed
- [x] An animal skipped carries her reason, and the round can still finish
- [x] Tests cover a round of weights, an implausible jump, a skip, and the readings on her page

## What was built

A seventh Step Effect, `weigh_in`, so the round is one Instance per Pen with a per-animal Step raised by the Playbook like any other — nothing about it is special except what it records.

**Every reading is kept.** The whole of fattening is the difference between two of them, and a farm that kept only the latest would have thrown away the thing it was measuring. Keyed on the Step Completion like the Milk Record, so a phone replaying its outbox or a Manager correcting an entry replaces _that weighing_ rather than adding a second one.

**The implausible jump is the farm's question, not the phone's.** `implausibleChange` in the domain compares the reading against her last one before it — not simply her latest, because an entry that synced late belongs where it happened. More than 2.5 kg a day gained or 3 kg a day lost is refused with what the farm knows: her last weight, the days between, the daily rate.

**And it is never dropped.** The reading goes in, the farm's own finding is kept beside it, and the Manager is asked — a `Needs Review` raised in the same transaction as the reading, because a doubt whose flag went missing is worse than no doubt at all.

A skipped animal has no reading to her name and the round still finishes. Her page opens with every time she has been on the scale, newest first, and says which readings were queried.

## Decisions and departures

- **The doubt is raised with the Manager, not refused at the phone.** Only the farm can catch an implausible jump — the phone does not know what she weighed a fortnight ago — and recording is offline first, so the question cannot be asked at the crush. The Evidence's own `min`/`max` still warns on the spot, offline, as it always did.
- **The plausible daily change is not a Farm Parameter.** 2.5 kg gained and 3 kg lost are facts about cattle, not about this farm, and the spec's parameter list does not name them. Loss is given more room than gain: an animal can go off its feed and drop fast, and the farm would rather be told that than argued with.
- **`method` has one value.** The decision says the method is recorded as _scale_ and that a girth tape, if one is ever used, is flagged _estimated_. The column exists with one value so the farm knows a reading was measured; the second value arrives with the thing that produces it.
- **Two readings less than a day apart are not judged.** A daily rate over a few hours is noise — two weighings on one morning differ by what the animal drank.

## What the review changed

Both axes converged on the same defect from opposite directions, and I had it backwards.

- **I refused the reading; the spec says take it.** Story 85: _"entries that arrive after the world changed (animal sold, dose already recorded, **weight out of range**) accepted and flagged Needs Review for the Manager, never dropped, so that barn evidence survives"_ — and ADR 0002 says the same. My first cut threw a `BAD_REQUEST`, so the batch scored it `rejected`, the reading stayed on the phone, and the Manager never heard about it. It is accepted and flagged now, which is both what the spec asked for and the simpler design: it **deleted** the machinery I had built to work around my own refusal.
- **That machinery was an unguarded bypass.** To let a person overrule the refusal I had reused `outOfRange` — the client-supplied field that already means "the person went past the Version's own min/max". Two questions with one answer: a reading that tripped the local range warning would silently confirm a jump nobody had been asked about, and a client could send the field on the first submission and never be asked at all. The `mayConfirm` verdict field, the `QUESTIONS` set, `Outbox.confirm` and the "send it anyway" button are all gone with it; `outOfRange` means only what it always meant.
- **My test flooded the shared Farm.** `appliesTo` can name a Side but not a Pen, so this file's SOP raised a round in _every_ pen holding a fattening animal — including other files' — and retiring the definition in `afterAll` does not close rounds already raised. They would have gone Overdue for every file whose clock runs later. `afterAll` closes them as missed now. This is the third time the shared-farm rule has caught me; it is written down in the session memory.
- **A dead message and a dead payload**: `weighIn.none` was never rendered, and `queriedNote` went to the client unused. Both dealt with — the note is shown now, beside the flag.
- **The glossary said nothing about a doubted reading.** CONTEXT.md's Weigh-in entry now says that every reading is kept, and one that changed more than an animal could is kept, flagged and put in front of the Manager. No new word was needed: it is a **Needs Review**, which the farm already has.
- **`weigh_in` sat in three different places in three orderings.** Appended last everywhere now.

Not changed, with reasons: `method` keeps its single value because the spec names it as a field of a Weigh-in (_"`WeighIn`: kg, method (scale), date"_); the plausibility thresholds stay in the domain because the spec's Farm Parameters list does not name them.

## Not done, and why

- **Nothing is derived yet.** Average daily gain, days on feed and the projection to the Target Window are ticket 37's; this ticket builds the readings they are worked out from.
- **The weigh-in SOP is not seeded.** Like every other procedure on this farm, the Owner writes and publishes it; the test publishes its own. The fortnightly cadence is a schedule the Playbook holds, not a rule in the code.
- **The Playbook cannot say "every fourteen days".** A `schedule` trigger is `{ times: string[] }` and nothing else, so it raises work _daily_. The farm can write a weigh-in SOP and run it, but the fortnight in this ticket's title is a thing somebody remembers rather than a thing the Playbook holds — and the spec's Farm Parameters list names **"weigh-in every 14 d"**. Giving the schedule trigger a cadence is a Playbook-wide change touching every SOP, not a weigh-in one, so it is written down here rather than smuggled in. **This wants a ticket and an Owner decision.**
- **The roles matrix gives Weigh-ins to Staff `C (own pen)` and to the Vet and Owner only `R`,** but `instances.completeStep` admits all four Roles for every Step Effect. That is pre-existing and systemic — the Milk Records row has the same shape — so it is not this ticket's to change, but it is now written down.
- **The Step's own `min`/`max` is still only warned about on the phone.** The server neither enforces nor records it; a client that omits the warning is taken at its word. The farm's own check — the jump against her last reading — is server-side and cannot be skipped, which is the half that matters, but the two halves should eventually be one.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 372 passing (343 api + 19 web + 10 i18n), up from 370 — two at the router seam, for a round with a skip in it and for a jump taken, flagged and put in front of the Manager. The two outbox tests went with the mechanism they covered. `pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
