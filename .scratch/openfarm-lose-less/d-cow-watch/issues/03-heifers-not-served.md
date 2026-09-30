# 03 — Heat watch: heifers not served

**What to build:** A third reason on the same list: a female Dairy `heifer`, never served, at least M months old by
`ageOf`. An estimated age is marked "about"; unknown age listed apart as "age not known". Her latest Weigh-in shown if
any.

**Blocked by:** 02

**Status:** done, 2026-09-30.

- [x] **By breed** (the Owner, 2026-09-30, after the research found DLS gives crossbred 18–20 months and indigenous 30):
      `first_service_months` (18) for a heifer of any breed not marked deshi, `deshi_first_service_months` (30) for one
      whose breed is (`breed.deshi`, which the standard local breeds come set with). Both the Manager's, in the "Heat
      watch" parameters group. A heifer with no breed takes the crossbred age.
- [x] **Domain `heiferWatchOf`** (pure, `breeding.ts`): a `heifer` never served, at or past her age → `not_served`;
      no age known → `age_unknown`, named apart. An estimated age (the seller's word plus months since) is used as it is.
- [x] **The same list:** `heatWatchOn` returns cows then heifers in one row shape (`HeatWatchRow`), heifers oldest
      first; the Manager's queue and the Vet's tab show "Heifer, 22 months old, not yet served — due by 18 months" /
      "about …" for an estimated age / "age not known".
- [x] **Tests:** `breeding.test.ts` (4) — a crossbred at 18 not 17; a deshi only at 30; off once served, as a calf, in
      calf; age unknown named apart. `routers/heat-watch.test.ts` — a crossbred and a deshi heifer born together, 19
      months: the crossbred named with her age and due age, the deshi not. **Proved by switching off** the deshi age
      (1 domain, 1 API red).
- [ ] **Her latest Weigh-in on the row** — left: dairy heifers are rarely weighed (research §3), and the row stays one
      line.
- [x] **Somebody opens it** (seed, 2026-09-30): the seed's heifers old enough are all served, so two unserved ones were
      backdated to November 2024 in the seed's database — the crossbred D-0062 showed "বকনা, ২২ মাস, এখনো পাল দেওয়া
      হয়নি — ১৮ মাসে দেওয়ার কথা · বাছুর পেন" (and in English), the deshi D-0059 did not.
