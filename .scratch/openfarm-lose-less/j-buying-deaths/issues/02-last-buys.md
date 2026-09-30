# 02 — What the last buys cost

**What to build:** The intake sheet shows, beside this animal's ৳/kg, what the farm's own buys of the same weight band
cost over the last 60 days, and by how much this one differs.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Intake** widened.
- [x] **Rule:** domain `lastBuysPerKg` — the farm's Intakes of the last 60 days within a sixth (15%) of her weight,
      weighed by weight — and `againstLastBuys` (a whole percent over or under). **Changed from drafting:** the price
      alone, not price + Hasil, so it stands beside the sheet's own ৳/kg figure, which is the price alone; and "near her
      weight" rather than fixed bands, so a 249 kg and a 251 kg bull are never set in different bands.
- [x] **Read:** `intake.lastBuys({ weightKg })`, Owner and Manager; asked at the nearest 5 kg as the weight is typed.
- [x] **Screen:** under the ৳/kg: "গত ৬০ দিনে কাছাকাছি ওজনের …টি কেনা গড়ে কেজিপ্রতি ৳… · এটা …% কম/বেশি দামে".
- [x] **Tests:** `routers/last-buys.test.ts` (3), domain `last-buys.test.ts` (3). **Proved by switching off** the weight
      filter, the window (in the domain; the router's query filters the window too) and the Role gate — each red.
- [x] **Somebody opens it** (seed, 2026-10-01): ৳90,000 at 240 kg read "কেজিপ্রতি ৳৩৭৫ · গত ৬০ দিনে কাছাকাছি ওজনের ১৩টি
      কেনা গড়ে কেজিপ্রতি ৳৪৬১.২১ · এটা ১৯% কম দামে" (not saved).

**Not built:** a Venture's buys are counted with the Farm's own (one market); no alert when a buy is far over.
