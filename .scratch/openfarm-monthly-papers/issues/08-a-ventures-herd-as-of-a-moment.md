# 08 — A Venture's herd as of a moment

**What to build:** A read of a Venture's animals as they stood at a past instant — heads by what had happened to each (bought, standing,
sold, died, lost), and weights from every weighing on or before it — built on `theirStretch` + `growthOf`, owner-that-day
by `ownedThenByOf`. Today's `theirProgress` reads today's state and the latest 30 weighings, so it cannot answer a past
month.

**Blocked by:** —

**Status:** done

- [ ] A domain function: heads at an instant, and the moves between two instants (bought, Internal Sales in and out,
      sold, died, lost), for one owner.
- [ ] Weights at an instant: each animal's latest weighing on or before it; the herd's gain a day between two instants.
- [ ] Instants compared by `getTime()`; the Venture's animals and weighings read once.
- [ ] Tests across an Intake, a Sale, a death, an Internal Sale and a weighing after the instant.
