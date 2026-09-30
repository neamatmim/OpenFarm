# 01 — An Observation raises work with a clock

**What to build:** Every Observation that is not a Heat raises "See to an unwell animal" for her. It goes to the Manager,
with the Owner's hours as its Grace.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Observation** widened: anything but a Heat is the Manager's work, a day's or an hour's; the Vet's
      Diagnosis or the Manager's answer closes it; a Correction takes it back. No Avoid list changed.
- [x] **Domain:** two events, `unwell` and `unwell_urgent` (`FARM_EVENTS`), and `eventOfObservation(saw)` beside
      `ROUND_WORDS`: a Heat → nothing, bloat and laboured breathing (`URGENT_ROUND_WORDS`) → `unwell_urgent`, anything
      else → `unwell`. The urgent words get their own event rather than a word filter on the Trigger.
- [x] **Happenings:** `recentHappenings` reads standing non-heat Observations in the look-back that no Diagnosis answers,
      keyed `unwell:<id>` (`unwellKeyOf`). Due when she was seen. Only sightings after the procedure was published raise
      work, so adopting it brings no backlog.
- [x] **Called off:** a withdrawn Observation calls off what it raised (`unraiseWhatItRaised`, `observation_withdrawn`);
      a Diagnosis answering it calls the Manager's work off (`diagnosed`). A Diagnosis's link cannot be corrected, so
      there is no "raise again".
- [x] **Standard Playbook:** `seeToUnwell` (grace a day) and `seeToUnwellUrgent` (grace an hour), the Manager's, no
      checker. One per-animal Step: "The Vet has been called" / "Looked again — watching her" / "Better now", and a note.
      **Decision 1 as built:** the hours are each procedure's Grace, which the Owner changes as any Version's, not a new
      Farm Parameter.
- [x] **The work page** says what the round saw — the word, when, who — (`instances.get.seen`, `unwellThatRaised`).
- [x] **Tests** (`routers/unwell-answered.test.ts`, 8): a day's work for a lame cow, due when seen, saying what was seen;
      an hour's for bloat and not a day's; nothing for a heat; finished by the Manager's answer; called off by the Vet's
      Diagnosis; never raised when the Vet answered first; called off when the round is put right to "Well"; an hour late
      to the Manager, then to the Owner. `standard.test.ts` for `eventOfObservation`. **Proved by switching off** the
      Diagnosis call-off, the "already answered" filter, and the heat exclusion (the query and the domain both guard it:
      only both off turns the heat test red).
- [x] **Seed:** the Manager answers both (`CREW`, `RESPONDERS`); the three months raised eight day's jobs, all answered.
- [x] **Somebody opens it** (seed, 2026-09-30): a bloated D-0003 on today's round → "জরুরি: অসুস্থ পশু দেখুন" on the
      Manager's Today; its page "What the round saw — পেট ফাঁপা · 01:01 · রফিকুল ইসলাম"; answered "ডাক্তারকে ডাকা
      হয়েছে", finished, `completed` with no checker.

**Fixed on the way:** the Finish toast said "Finished — waiting for sign-off" for every job, checker or not. It now says
"Finished" where nobody signs off (`work.finishedNoCheck`). Not clicked again after the change.

**Left for later:** the step's choices show in Bangla on the English screen, as every choice on the work screens does.
