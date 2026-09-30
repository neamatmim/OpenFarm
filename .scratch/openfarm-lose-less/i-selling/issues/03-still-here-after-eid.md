# 03 — Still here after Eid

**What to build:** The day after Qurbani the Owner and Manager are told how many animals aimed at that Eid are still on
the farm; the countdown shows where selling is done; an unsold ready animal past its window is badged.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Target Window** widened.
- [x] **Told:** `still_here_after_eid`, digest to the Owner and the Manager, keyed on the Eid's expected day, raised by
      the sweep (`tellAboutEidLeftovers`) once Qurbani is over and within a fortnight of it — so a fresh install is not
      told of an Eid months gone. `eid-store.ts` `stillHereAfterEid`: the latest Eid over, by its day in force and any
      it was on before, counting live animals aimed at it (the Farm's own and a Venture's, said apart). Links to the Eid
      list. A set-aside does not silence it (it is its own notice).
- [x] **Screen:** `NextEid` on the Sale and Ready pages; the past-window badge on the Sale page's ready-to-go list for
      animals already `ready_for_sale` (`sale.sellable` `windowClosed`).
- [x] **Tests:** `routers/still-here-after-eid.test.ts` (3): not told during Qurbani; the day after, to both, the sold
      one not counted (2 of 3); once. **Proved by switching off** the sweep step, the "over" test and the exit-state
      filter — each red. Not tested: the fortnight's end, and the ready-to-go badge.
- [x] **Somebody opens it** (seed, 2026-10-01): both pages show "আগামী ঈদুল আজহা · ১৭ মে – ১৯ মে, ২০২৭ · আর ২২৮ দিন".
      **Not seen:** the badge (the seed has nothing ready and unsold) and the notice (the seed's last Eid was in May).
