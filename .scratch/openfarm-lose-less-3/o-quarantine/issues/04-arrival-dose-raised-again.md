# 04 — An arrival dose put off is raised again

**What to build:** A bull's arrival dose — drench, FMD, lumpy skin, HS, BQ, anthrax — skipped, or closed Missed, is
raised again for him after the farm's days, until it is given or the Vet excuses it (05).

**Blocked by:** 03

**Status:** open.

- [ ] **Glossary:** **Treatment** widened (an arrival dose put off is owed, as a Prescription's dose is, and raised
      again after the farm's days); **Skipped** gains the note that an arrival dose skipped comes back.
- [ ] **Schema:** none — 03's `put_off_days` and cause.
- [ ] **Rule:** domain `isArrivalDose(cause, version)` — an Instance raised by an arrival (`arrival:<animal>:+n`, or a
      put-off of one) whose Version has a Step with a `treatment` effect. Any skip reason counts; matched by the work,
      never by the skip's words.
- [ ] **Entry:** when that dose Step is recorded skipped for him, or the Instance is closed Missed, raise one Instance
      of the same Version for him alone, due `put_off_days` on, as 03 does. A Correction of the skip to a dose given
      calls the again-work off. Work Called Off when the Owner retires the procedure is not raised again. A dose a phone
      sends for the original Instance after its again-work is raised is a dose given; the again-work is called off.
- [ ] **Screen:** the raised-again dose on the board with "আবার / again" and the day it was first put off; on his page,
      under his doses, "দেওয়া বাকি / Still owed" with each.
- [ ] **Tests:** `routers/arrival-dose-again.test.ts` — with the arrival FMD procedure adopted: skipped "Unwell — to be
      given later", raised again seven days on for him alone; given then — nothing more; skipped for "no stock" — raised
      again too; Missed — raised again; the procedure retired — nothing; a Pen Campaign dose skipped — not raised
      again. **Proved by switching off** the arrival-only match (a Campaign skip then raises — red), the skip path and
      the Missed path — each red.
- [ ] **Somebody opens it** (seed, with the arrival FMD procedure adopted in the dev database — the real farm adopts
      it only once the Vet's days are in): skip a seed bull's FMD, and find it on the board again seven days on.
