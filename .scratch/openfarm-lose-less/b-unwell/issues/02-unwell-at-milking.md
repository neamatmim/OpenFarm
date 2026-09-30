# 02 — "Unwell" at milking is an Observation

**What to build:** Skipping a cow as "Unwell" records an Observation of her, so 01 raises the work.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Effect input:** already there since A-01 — `EffectInput.skippedAs`, worked out from the Step's own reasons.
- [x] **A skip reason that means it:** `SKIP_MEANINGS` gains `unwell`; the standard milking Step's "অসুস্থ" / "Unwell"
      carries `means: "unwell"`, so rewording it does not stop it.
- [x] **Milk effect:** skipped as unwell → `seeHerUnwell` writes an Observation `unwell` ("দোহনের সময় অসুস্থ") on the same
      Completion, once however often it is sent; litres, or any other skip, → `takeBackWhatWasSeen` withdraws it and calls
      off the Manager's work. Both helpers live beside the round's effect (`effects/observation.ts`).
- [x] **Decision 6 as built:** its own word, `unwell` (`ROUND_WORDS.unwell`, not offered on the round) — the milker does
      not know why, and "Off feed" would mislead the Vet. It raises a day's work, not an hour's.
- [x] **Glossary:** **Observation** says a cow a milker skips as unwell is one too.
- [x] **Tests** (`routers/unwell-at-milking.test.ts`, 4): an Observation and the Manager's work; once however often sent;
      taken back with its work when her litres are written in its place; "Kicking" is no Observation. **Proved by
      switching off** the recording (3 red) and the taking back (1 red).
- [x] **Seed:** unchanged. Checked, not assumed: its milkers skip only when a cow's litres round to nothing, which never
      happens in its three months, so the seed has no milking "অসুস্থ" (18 skips, all "Kicking").
- [x] **The job's cover** now shows what was seen and names her before anybody takes it — a Manager choosing what to
      pick up needs to know which cow and what; the heading is "What was seen" / "যা দেখা গেছে", since it may be milking
      and not the round. `seen.tag` added.
- [x] **Somebody opens it** (seed, 2026-09-30): D-0003 skipped as "অসুস্থ" at today's morning milking → "অসুস্থ পশু
      দেখুন" raised for her; its cover reads "যা দেখা গেছে — D-0003 — দোহনের সময় অসুস্থ · ৩০ সেপ্টেম্বর ০৯:৫১ · রফিকুল
      ইসলাম". The persisted cache drew the old answer first; the fresh one followed.

**For the Owner:** a milking procedure adopted before this keeps its old words with no meaning until its next Version.
