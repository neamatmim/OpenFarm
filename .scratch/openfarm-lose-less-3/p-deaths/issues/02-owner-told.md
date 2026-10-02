# 02 — The Owner told at once

**What to build:** A death or a cull written by anyone but the Owner tells the Owner at once, by push: her tag, died or
culled, the cause, what she cost, whose she was where she was a Venture's; a tap opens her page and the photograph.

**Blocked by:** 01

**Status:** done (2026-10-03).

**As built:** notice `mortality_recorded` (immediate, not waking the farm), about the Mortality, the Owner's;
`NoticeKind.leavesOutTheWriter` with `About.writtenBy`, dropped in `tell` — the writer left out by the kind, not the
caller. `tellOfTheDeath` (`death-notice.ts`) raised in `recordMortality` and `recordDisposal`, pushed after the write
with `pushRaised`. A push about a Mortality opens `/animals/<tag>` (`push.ts` `urlOf`). The Calving and a Correction
raise nothing. Glossary **Alert**: "ignores quiet hours" was only ever true of the safety kinds — said so.

- [x] **Glossary:** **Mortality** widened — the Owner is told at once, unless she wrote it; **Alert** gains a death or
      a cull among those that go now.
- [x] **Notice:** new kind `mortality_recorded` — in `ALERT_KINDS` (`db/schema/alert-kinds.ts`, mirrored in
      `domain/alerts.ts`); `DELIVERY` immediate, not waking the farm (`domain/notify.ts`); `SAYS` app, push and digest
      words; `NOTICES` the Owner, about the `mortality` (`notice.ts`). Facts typed in `notice-facts.ts` —
      `{ tag, kind, cause, costBdt, venture: string | null }` — and filled once in FILLINGS (`notice-words.ts`), the
      cost worded in the reader's numerals.
- [x] **Leaving out who wrote it:** said by the kind, not by the caller — a `NoticeKind` flag and the writer on
      `About`, dropped in `peopleFor` (`notice.ts`), so 03 and any later kind say it once.
- [x] **Rule:** raised inside the write of `animals.recordMortality` and of a stillborn's `recordDisposal`, and pushed
      once it closes with `pushRaised`, as `diagnoses.record` does (`routers/diagnoses.ts:225-229`). What she cost:
      purchase plus everything charged to her (`economicsOfAnimal`, `chargedOf`), to the taka, at the moment of
      writing. The Calving raises nothing; a Correction raises nothing (one notice per death per person). A push about a
      Mortality opens `/animals/<tag>` (`push.ts:77`).
- [x] **Screen:** her list shows it, linked to her page by the tag it names; nothing else changes.
- [x] **Tests:** `routers/death-told.test.ts`. **First, red before the fix:** a Manager records a death — the Owner
      holds a `mortality_recorded` notice naming the tag, the cause and what she cost, and the fake transport carried
      one push to the Owner (today nothing). Then: a Venture's animal names the Venture, and only the Owner is told; the
      Owner writing it herself is told nothing; a Correction tells nobody; a stillborn calf tells nobody at her Calving
      and the Owner at her disposal; written in quiet hours, it is in the list and not pushed; the push opens her page.
      `notice-words.test.ts` covers the new FILLING. **Proved by switching off** the writer left out (the Owner-herself
      test red) and the push after the write (the push test red).
- [x] **Somebody opens it** (seed): signed in as the Manager, a death recorded with a photograph; as the Owner, the
      notice reads her tag, cause and ৳ cost in Bangla numerals, and a tap opens her page on the photograph.
