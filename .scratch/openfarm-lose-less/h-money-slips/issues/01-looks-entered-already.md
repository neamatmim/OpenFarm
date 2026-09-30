# 01 — Looks entered already

**What to build:** Entering money by hand that matches an earlier entry — same person, amount and farm day — is
refused `looks_entered_already` with the match (amount, person, day, who entered it) unless sent again with
`sameAgain`; one saved again is told to the Owner.

**Blocked by:** —

- [ ] **Rule:** a domain predicate for "the same"; the check in `enter` before `bookMoney` (`money_event_day_idx`).
- [ ] **Confirm:** the entry sheet catches the refusal, shows the earlier entry in a `ConfirmDialog`, resends with
      `sameAgain: true`; the trail keeps that it was entered knowing.
- [ ] **Told:** a digest notice to the Owner (new kind, wired in all the notice places) for each one saved again.
- [ ] **Tests:** the second refused with the match; `sameAgain` saves and tells; another day or amount passes; case of
      the name does not hide it.
