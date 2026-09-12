# 39 — The Sale

**What to build:** The Manager sells an animal: who bought her, for how much, what she weighed on the day, where she is going and who is taking her. It is hard-gated by meat withdrawal — the one gate that stops a farm selling meat it cannot say is safe — and she exits as Sold. At Eid several animals go to one buyer in one morning, so the app offers the last buyer and lorry again rather than asking for them five times.

A cull that ends in a sale is a Sale, not a Cull: the Manager decides at the time, one exit and one record, and the reason she was culled goes in the Sale's own note. Confirmed with the Owner 2026-09-12, resolving the knot ticket 31 recorded.

**Blocked by:** 38

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user stories 64 and 65; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Sale"); [Animal lifecycle and groups](../../openfarm-release-1/issues/04-animal-lifecycle-and-groups.md).

- [ ] The Manager records a Sale: buyer name, address and phone, sale price, weight at sale, date, destination, vehicle and driver; the Owner checks it
- [ ] Meat Withdrawal refuses the Sale outright, naming the day she is fit for sale
- [ ] She exits as Sold, leaves the herd everywhere at once, and her history is untouched
- [ ] A second sale to the same buyer on the same day offers that buyer and that transport again
- [ ] Tests cover a sale, the withdrawal gate, the prefill, Staff being refused, and a culled animal having no separate sale path
