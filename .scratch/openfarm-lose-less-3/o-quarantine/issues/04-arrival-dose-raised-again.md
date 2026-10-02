# 04 — An arrival dose put off is raised again

**What to build:** A bull's arrival dose — drench, FMD, lumpy skin, HS, BQ, anthrax — skipped, or closed Missed, is
raised again for him after the farm's days, until it is given or the Vet excuses it (05).

**Blocked by:** 03

**Status:** done (2026-10-03).

**As built:** `put-off-store.ts` generalised — `putOffKindOf` (release, or a dose his arrival raised; never the skip's
words), `raiseThePutOff` for both, `callOffPutOffDose` when a dose is given (a Correction, or a late phone on the first
work). `arrivalDosesOwed` + `animals.dosesOwed` for his page ("দেওয়া বাকি"), ready for 05. **Wider than drafted:** a
calf's doses are raised by her arrival too, so they come back the same way — still owed. **Fixed from 03:** a Release
done on the raised-again work called that very work off; the call-off now leaves out the work being done (tested). The
arrival-only match is proved on `putOffKindOf` itself (a Prescription's cause), since a Pen Campaign has no animal and
never reaches it.

- [x] **Glossary:** **Treatment** widened (an arrival dose put off is owed, as a Prescription's dose is, and raised
      again after the farm's days); **Skipped** gains the note that an arrival dose skipped comes back.
- [x] **Schema:** none — 03's `put_off_days` and cause.
- [x] **Rule:** domain `isArrivalDose(cause, version)` — an Instance raised by an arrival (`arrival:<animal>:+n`, or a
      put-off of one) whose Version has a Step with a `treatment` effect. Any skip reason counts; matched by the work,
      never by the skip's words.
- [x] **Entry:** when that dose Step is recorded skipped for him, or the Instance is closed Missed, raise one Instance
      of the same Version for him alone, due `put_off_days` on, as 03 does. A Correction of the skip to a dose given
      calls the again-work off. Work Called Off when the Owner retires the procedure is not raised again. A dose a phone
      sends for the original Instance after its again-work is raised is a dose given; the again-work is called off.
- [x] **Screen:** the raised-again dose on the board with "আবার / again" and the day it was first put off; on his page,
      under his doses, "দেওয়া বাকি / Still owed" with each.
- [x] **Tests:** `routers/arrival-dose-again.test.ts` — with the arrival FMD procedure adopted: skipped "Unwell — to be
      given later", raised again seven days on for him alone; given then — nothing more; skipped for "no stock" — raised
      again too; Missed — raised again; the procedure retired — nothing; a Pen Campaign dose skipped — not raised
      again. **Proved by switching off** the arrival-only match (a Campaign skip then raises — red), the skip path and
      the Missed path — each red.
- [x] **Somebody opens it** (seed, with the arrival FMD procedure adopted in the dev database — the real farm adopts
      it only once the Vet's days are in): skip a seed bull's FMD, and find it on the board again seven days on.
