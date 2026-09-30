# 03 — Early losses by seller

**What to build:** Per seller and per haat: animals bought, died within 30 days of arrival, diagnosed within 30 days —
on the Owner's page, most lost first.

**Blocked by:** 01 (deaths by cause read the same records).

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Intake** widened.
- [x] **Rule:** domain `earlyLosses` (`EARLY_DAYS` 30, the quarantine): per seller and per haat (the Buying Trip's
      `wentTo`; a gate buy has none), bought in the year, died / culled apart / diagnosed (each animal once) within 30
      days of arrival; only those with a loss, the most died first.
- [x] **Read:** `intake.earlyLosses`, the Owner's alone (`early-losses-store.ts`, a year).
- [x] **Screen:** "কেনার পরপরই হারানো" on the Owner's farm page after the deaths card: by seller, by haat, "কেনা · মারা
      গেছে · বাদ · অসুস্থ"; a line saying none where nothing was lost early.
- [x] **Tests:** `routers/early-losses.test.ts` (2), domain `early-losses.test.ts` (2). **Proved by switching off** the
      thirty days, the Diagnoses and the Owner's gate — each red.
- [x] **Somebody opens it** (seed, 2026-10-01): "মোঃ হানিফ ব্যাপারী · কেনা ৩৯ · মারা গেছে ০ · বাদ ০ · অসুস্থ ১", and the
      same under "গাবতলী গরুর হাট, ঢাকা".

**Not built:** haats are grouped by the Buying Trip's words as typed ("গাবতলী" and "গাবতলী হাট" are two); a haat list
would join them.
