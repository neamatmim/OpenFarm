# 03 — Selling, and the states that follow

**What to build:** The Manager sells a Venture's Animal exactly as she sells the Farm's — the same act, the same Receipt, the same Transport Card — because a buyer standing at the haat should see no difference, and a Manager should not have to remember whose animal she is selling.

The Venture keeps up by itself: it reaches **Selling** on the first Sale of one of its Animals, without the Owner remembering to move it. And it shows when its **Wind-up Period** ends — the days after its **Target Window** in which it keeps selling — so that a slow bull is visible while there is still time to do something about it, rather than at the moment everybody's money is late.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 58, 59, 60; `CONTEXT.md` — **Venture**, **Sale**, **Target Window**, **Wind-up Period**.

- [x] Selling a Venture's Animal is the Manager's ordinary Sale, with nothing extra to remember, and the proceeds land in that Venture's Purse as they already do
- [x] The first Sale of a Venture's Animal moves that Venture to Selling, as a fact rather than a chore
- [x] A Venture shows when its Wind-up Period ends, and says when it has passed with animals still standing
- [x] Moving to Selling is audited like any other change of what a Venture is
- [x] What is already refused once a Venture is Selling stays refused: no new Investor, no capital, no Internal Sale out of the pool
- [x] Tests cover the first Sale moving it, a second Sale not moving it again, the wind-up day being what the Farm Parameter says, and the bars that come with Selling

**Decided while building (Owner, 2026-09-18):** an outside Sale's proceeds go **straight into the Venture Account on the Sale**, rather than being held by the Farm and deposited later. A `sale_in` Venture Movement is written from the Sale, so putting the Sale's price right moves the Venture's account with it and the movement is never corrected on its own.

**Which budget the proceeds land on:** the running side, not the cattle side. An Internal Sale returns roughly what the cattle side paid, so netting it against the Cattle Budget is honest; an outside Sale returns the cost *and the whole profit of the run*, and a Venture selling up must not read that as money to go and buy more cattle with. It lands where the animals still standing are eating through.

**Left for later tickets:** a Sale against a **settled** Venture silently does nothing rather than refusing — unreachable until the Settlement exists, and ticket 05's to refuse. An Animal carries her own Target Window, which nothing reconciles against her Venture's, so a bull brought in late can trip the wind-up warning while the farm's own Ready-for-Sale logic still has her inside her window.
