# 03 — Selling, and the states that follow

**What to build:** The Manager sells a Venture's Animal exactly as she sells the Farm's — the same act, the same Receipt, the same Transport Card — because a buyer standing at the haat should see no difference, and a Manager should not have to remember whose animal she is selling.

The Venture keeps up by itself: it reaches **Selling** on the first Sale of one of its Animals, without the Owner remembering to move it. And it shows when its **Wind-up Period** ends — the days after its **Target Window** in which it keeps selling — so that a slow bull is visible while there is still time to do something about it, rather than at the moment everybody's money is late.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 58, 59, 60; `CONTEXT.md` — **Venture**, **Sale**, **Target Window**, **Wind-up Period**.

- [ ] Selling a Venture's Animal is the Manager's ordinary Sale, with nothing extra to remember, and the proceeds land in that Venture's Purse as they already do
- [ ] The first Sale of a Venture's Animal moves that Venture to Selling, as a fact rather than a chore
- [ ] A Venture shows when its Wind-up Period ends, and says when it has passed with animals still standing
- [ ] Moving to Selling is audited like any other change of what a Venture is
- [ ] What is already refused once a Venture is Selling stays refused: no new Investor, no capital, no Internal Sale out of the pool
- [ ] Tests cover the first Sale moving it, a second Sale not moving it again, the wind-up day being what the Farm Parameter says, and the bars that come with Selling
