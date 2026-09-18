# 04 — The Internal Sale

**What to build:** The Owner sells an Animal between the Farm's herd and a Venture as an **Internal Sale**: priced at the Animal's latest Weigh-in times a live-weight rate she enters that day, with a note of where the rate came from, so that value moves at a price she can defend to an Investor years later. The money actually moves through the Venture Account — it is a sale, not a book entry — and the Animal's owner changes with it.

It is refused once the Venture is Selling or the Animal is Ready for Sale, so a finished bull cannot be lifted out of the pool at the moment it becomes worth having. Hers alone, and audited: nobody else moves animals between the purses.

**Blocked by:** 01 (an Animal has an owner)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 33, 34, 35, 36; `CONTEXT.md` — **Internal Sale**, **Venture Movement**, **Weigh-in**, **Ready for Sale**.

- [ ] The Owner records an Internal Sale in either direction, priced from the Animal's latest Weigh-in and a live-weight rate she enters, with a note of where the rate came from
- [ ] The price is what the weight and the rate make it, shown before she commits, and an Animal with no Weigh-in is refused
- [ ] The money moves through the Venture Account as Venture Movements — out of the buyer's side, and where both sides are Ventures, into the seller's
- [ ] The Animal's owner changes on the same act, and nothing else changes it
- [ ] Refused once the Venture is Selling, refused for an Animal that is Ready for Sale, and refused for a Dairy animal, each with a word the reader has
- [ ] The Owner's alone and audited, with the weight, the rate and the note on the trail
- [ ] Tests cover a sale each way, the price from the latest Weigh-in rather than an older one, the three refusals, and a Role that may not
