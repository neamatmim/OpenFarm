# 02 — A settled Venture refuses the Corrections that name one Animal

**What to build:** A Settlement's figures are frozen and every Investor was paid on them. Putting one of that Venture's records right afterwards moves what the costing says while the settlement stands still — so the farm refuses, in words that say to raise a **Settlement Adjustment** instead.

Three of these already refuse: a **Venture Movement**, an **Intake** and a **Buying Trip**. Four more name a single Animal and can say whose Venture she is, and do not: an Abortion, a Diagnosis, a Mortality, and a **Selling Trip** whose costs are split across the Animals it took.

A **Sale** stays the deliberate exception — it is the late news itself, and refusing it would leave what a buyer really paid nowhere to land.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A Correction to an Abortion, a Diagnosis or a Mortality of a settled Venture's Animal is refused, in the word the reader already has
- [x] A Correction to a Selling Trip that took a settled Venture's Animals is refused the same way
- [x] A Sale is still allowed, and the code says why in one place rather than by omission
- [x] Nothing changes for a Venture that is not settled
- [~] Tests cover each of the four refused, and a Sale still going through

## What was decided while building

**`venturesOf` asks about several Ventures, not one.** A lorry carries whichever Ventures had an animal ready, so a Selling Trip belongs to all of them and is refused if any has settled. That is also the shape ticket 03 needs, and it was paid for by this ticket's own Selling Trip rather than built on speculation.

**The question is "whose was she *then*", not "whose is she now".** The first version asked today's owner, which a review showed has a real hole: Venture A internally sells her to B and then settles; a Diagnosis dated in A's time reads as B's, and the Correction goes through — silently moving what A's Investors were paid on. It now asks whose she was on the record's own day *and* whose she is now, and a test walks that exact story: a settled Venture's bull taken on by a new Venture, and the old Diagnosis still refused.

**The lorry asks once.** `theOwnersOf` already existed for exactly this; the first version ran a query per animal, inside a locked transaction.

**Four near-identical bodies became one helper.** Rewriting the Intake's existing one-liner into the same three-line shape was the tipping point — the diff created the duplication it should have collapsed.

## Left as it is, on purpose

**The Abortion refusal ships untested, and the comment now says why.** A Venture owns bought-in fattening stock, which carries no expected calving, and an Abortion is refused without one — so no Venture-owned Animal can hold one today. Both reviews agreed it is unreachable. The guard stays as cheap insurance against that invariant loosening, but the criterion is marked `[~]` rather than claimed: three of the four are tested, plus the Sale, plus the case above.

**`settlement.test.ts` also asserts this word for an Intake and a Venture Movement.** A reviewer asked for a deliberate answer on the overlap: they stay where they are. There they are part of the Settlement's own story — the doors that shut when it closes — and here they are the systematic sweep across the correction kinds. Moving either would make one file tell half a story.
