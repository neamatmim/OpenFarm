# 04 — Sores in one Pen tell the Owner

**What to build:** When K animals in one Pen are seen with `mouth_foot_sores` within H hours, the Owner and the Manager
are told at once. The words say what was seen, never a disease.

**Blocked by:** 01

- [ ] **alerts.ts:** kind `pen_sores_seen`; delivery `immediate` in `notify.ts` beside `baki_overdue` (:88, :202);
      audience owner + manager in `notice.ts`; the entity is the Pen.
- [ ] **Sweep:** `tellAboutSoresInAPen` in `the-day-turns.ts` beside `tellAboutOverdueBaki` (:327, :415), each Pen once
      per window.
- [ ] **Farm Parameters:** the count and the hours.
- [ ] **Tests:** two animals raise nothing, three do; a withdrawn Observation does not count; each Pen told once.
- [ ] **Somebody opens it:** the push and the notice list. Both languages.
