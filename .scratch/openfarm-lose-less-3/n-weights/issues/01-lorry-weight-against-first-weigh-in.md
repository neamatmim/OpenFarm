# 01 — The lorry weight against her first Weigh-in

**What to build:** A bought bull's first Weigh-in within thirty days of his Intake is set against the weight he was
bought at; more than the Owner's line under it is told to the Owner in the evening's post, once.

**Blocked by:** —

**Status:** done (2026-10-03).

**As built:** `weighedShort` in `domain/arrival-weight.ts` (types `BoughtAt`, `ScaleReading` — `Arrival` was taken).
The effect reads `farm.arrival_short_percent` itself rather than through `EffectInput`. One more test than drafted: a
bull fine at his first round and short at his second is not told — the told-once case alone could not prove the
first-only rule, since a notice is kept once per Intake anyway. The seed's day-52 lorry has one bull typed 24 kg heavy.

- [x] **Glossary:** **Intake** widened (her arrival weight is checked against her first Weigh-in, and a shortfall over
      the Owner's line is told to the Owner); **Weigh-in** widened (the first one after an Intake is also read against
      it). No new term: "weighed short" is said, not named.
- [x] **Schema:** Farm Parameter `farm.arrival_short_percent` (default 5, 1–50), **the Owner's alone** — added as
      `feed_price_jump_percent` was (`schema/farm.ts`, `context.ts`, `routers/farm.ts` input, read columns and the
      Owner's-alone list, `farm-parameters.tsx`, both message files). Migration `…_arrival_short_percent`, both dev
      databases.
- [x] **Rule:** domain `weighedShort({ arrivalKg, arrivedAt }, first, percent)` — nothing when the reading is more than
      `EARLY_DAYS` (30) after arrival or within the line; else the kilos and the part short. Pure, with its own test.
- [x] **Entry:** in `effects/weigh-in.ts`, in the reading's transaction: when this is her first Weigh-in (none earlier,
      flagged or not) and she has an Intake, judge it; a shortfall tells notice `arrival_weight_short` (digest, Owner,
      about the Intake — told once however often the reading is put right), facts tag, seller, arrival kg, weighed kg,
      days, percent. Wired as `cash_short` was: `alert-kinds.ts` and domain `alerts.ts`, `notice-facts.ts`,
      `notice-words.ts` FILLINGS (numbers worded in Bangla), `notify.ts`, `notice.ts` audience.
- [x] **Screen:** the notice opens her page; nothing new on the Manager's screens.
- [x] **Tests:** `routers/arrival-weight-short.test.ts` — 280 kg on arrival, 255 kg at the first round twelve days on
      is told once with the seller's name; 270 kg is not; a second Weigh-in short of the arrival is not told again; a
      first reading on day 40 is not judged; the line is the Owner's (a Manager setting it is refused `owner_only`).
      **Proved by switching off** the first-only rule, the thirty days, the line and the Owner's gate — each red.
- [x] **Somebody opens it** (seed): weigh a bought bull of the seed short of his arrival weight on the weigh-in round,
      and read the Owner's notices for the line with his tag, the seller and the kilos in Bangla.
