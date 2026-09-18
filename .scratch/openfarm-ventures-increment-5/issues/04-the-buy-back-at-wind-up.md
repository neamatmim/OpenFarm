# 04 — The buy-back at wind-up

**What to build:** When the Wind-up Period ends and animals are still standing, the Farm buys whatever is left at weight, so the Venture can settle on time and nobody's money waits on one slow bull.

This is its own act at a fixed moment, and not the Owner's discretionary **Internal Sale** — which is refused once a Venture is Selling, precisely so a finished bull cannot be lifted out of the pool. The difference is the moment: the buy-back happens because the clock says so and takes everything left, where an Internal Sale is the Owner choosing one animal on a day of her choosing.

Priced the same way, because a price an Investor can check is the same price either way: her latest Weigh-in times a live-weight rate the Owner enters with a note of where it came from. The money moves through the Venture Account, and the Farm's own side reaches the Farm's books as a cattle purchase.

**Blocked by:** 03 (a Venture reaches Selling and knows its wind-up day)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user story 61; `CONTEXT.md` — **Wind-up Period**, **Internal Sale**, **Venture Account**, **Weigh-in**.

- [ ] Once the Wind-up Period has passed, the Owner buys every Animal the Venture still holds, in one act, each priced at her latest Weigh-in times the rate the Owner enters
- [ ] Refused before the Wind-up Period has ended: it is the clock's act, not a way round the bar on lifting an animal out of the pool
- [ ] Each Animal's price and the rate it was struck at are recorded, so an Investor can check every one
- [ ] The money moves through the Venture Account, the Farm's side reaches the Farm's books, and every Animal changes owner
- [ ] An Animal with no Weigh-in is refused, naming her, because a price nobody can defend is worse than a delay
- [ ] The Owner's alone, audited
- [ ] Tests cover a wind-up buying two animals at once, the refusal before the day, an Animal never weighed, and a Venture with nothing left to buy
