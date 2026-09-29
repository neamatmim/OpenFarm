# 02 — Newborn calf care

**What to build:** A standard procedure, "Newborn calf care", raised for each live calf the moment her Calving is
recorded, and overdue two hours later. It asks, per calf: is she breathing, standing and suckling; her navel dipped;
her weight; her first colostrum; her ear tag; and her second colostrum before 12 hours are out.

**Blocked by:** 01

**Status:** done. Figures: `docs/research/newborn-calf-care.md`, "Recommended figures".

- [x] **Standard Playbook** (`packages/domain/src/standard-playbook.ts`): `newbornCalfCare`, triggers
      `[{ kind: "event", event: "arrival" }]`, `appliesTo: { side: "dairy", states: ["calf"] }` (so a bought
      fattening bull's arrival never raises it), assigned to Staff, checked by the Manager, `graceMinutes: 120`.
      Steps, each per calf:
  - **She is well:** a choice — well; weak, not standing; not suckling. Anything but "well" is an Observation (the
    `observation` effect), so it starts the health chain.
  - **Navel dipped in iodine:** a tick.
  - **Birth weight:** a number with the `weigh_in` effect; warn range below 12 kg or above 45 kg (01: crossbred calves 15–40 kg, Red Chittagong
        means 13.9–16.2 kg). Not the fattening weigh-in's 20 kg minimum.
  - **First colostrum:** litres, a number; the Step's words say "about a tenth of her weight — 3 L for a 30 kg calf; no later than 6
        hours" (NG-GLPP §11.2).
  - **Ear tag in:** a tick. A calf's Tag Number is given at birth, but the tag itself goes in by hand.
  - **Second colostrum:** litres, within 12 hours, about half the first (NG-GLPP §11.2(c)).
  - The Step list also checks what NG-GLPP §11.1 asks at birth: anus open, limbs and eyes, dung and urine passed —
    one choice with "all well" first, so a sound calf is one tap.
- [x] Cited in code comments from 01's research, as the bought bull's chain is.
- [x] **Observation words:** "not suckling" and "navel swollen" join `OBSERVATION_WORDS` and the standard round's
      words, in both languages, so a calf found weak on day three is recorded the same way as on day one.
- [x] **Her page:** the calf's own page says her first day: when she was fed colostrum and how much, her navel, her
      birth weight. Read from the Step Completions for her, since that is where the litres are kept.
- [x] **Catch-up:** a farm adopting it gets Version 1's catch-up. Only calves whose work is still due are raised, never
      a year of old calves as overdue.
- [x] **Tests:** raised for a live calf and not for a stillborn one, nor for a bought bull. Overdue at two hours.
      The weight becomes a Weigh-in. "Not suckling" becomes an Observation.
- [x] **Prove by switching off:** the `appliesTo` states (a bought bull would get calf work).
- [x] **Seed:** the Owner's seed farm adopts it; the seed's calvings in the last days show the work, one of it late.
- [x] **Somebody opens it:** the milker's Today with a calf's work, the Manager's queue when it is late, and the calf's
      page, in both languages.

**Built (2026-09-29):**

- **Two procedures, not one:** `newbornCalfCare` (well, navel, weight, first colostrum, ear tag; grace 120 minutes) and
  `newbornSecondFeed` (second colostrum, navel dipped again and looked at; grace 720). As one job with the second feed
  in it, the work would read as late at two hours even with the first feed given on time.
- "Well" is a skip ("breathing, standing and sucking"), as on the round. Anything else is an Observation: weak, not
  sucking, laboured breathing, anus or legs or eyes wrong. Every Step also offers "Not newborn — registered later",
  because a calf entered on the opening register is an arrival too.
- `ROUND_WORDS` gains `not_suckling` and `navel_swollen`, offered on the standard round and on the off-round sighting
  list (`OBSERVATION_WORDS`). This changes only what a farm adopting the round from now on gets.
- Her page: `herFirstDay` reads every Step Completion for a calf born here within 36 hours of her birth, in the
  procedure's own words. The overview tab says "Her first day" with each answer (litres, kilos, a choice, done, or
  skipped and why).
- Proved by switching off: the "calves only" `appliesTo`. The first version of the test stayed green, because the cows
  had arrived nine days earlier and catch-up never raises work that is already overdue. A heifer bought on the calving
  morning now makes the guard necessary, and the test goes red without it.
- Seed: the milker does both. The seed's last day's calves are left undone, so their first colostrum is the late work.
- Opened on the seed farm (calf D-0078), in Bangla. Two defects were found and fixed before merge. Her first day listed
  the calving round's "not calved yet" and the daily round against her, because she stood in those Pens; it now reads
  only work raised about her. A skip read "Not done — Well — …"; a skip's own words are now said alone, since on these
  Steps "well" is a skip.
- Seed: 46 newborn jobs, all done. No calf happened to be born on the seed's last day, so none is left late.
