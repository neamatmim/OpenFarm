# 04 — The buy-back at wind-up

**What to build:** When the Wind-up Period ends and animals are still standing, the Farm buys whatever is left at weight, so the Venture can settle on time and nobody's money waits on one slow bull.

This is its own act at a fixed moment, and not the Owner's discretionary **Internal Sale** — which is refused once a Venture is Selling, precisely so a finished bull cannot be lifted out of the pool. The difference is the moment: the buy-back happens because the clock says so and takes everything left, where an Internal Sale is the Owner choosing one animal on a day of her choosing.

Priced the same way, because a price an Investor can check is the same price either way: her latest Weigh-in times a live-weight rate the Owner enters with a note of where it came from. The money moves through the Venture Account, and the Farm's own side reaches the Farm's books as a cattle purchase.

**Blocked by:** 03 (a Venture reaches Selling and knows its wind-up day)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user story 61; `CONTEXT.md` — **Wind-up Period**, **Internal Sale**, **Venture Account**, **Weigh-in**.

- [x] Once the Wind-up Period has passed, the Owner buys every Animal the Venture still holds, in one act, each priced at her latest Weigh-in times the rate the Owner enters
- [x] Refused before the Wind-up Period has ended: it is the clock's act, not a way round the bar on lifting an animal out of the pool
- [x] Each Animal's price and the rate it was struck at are recorded, so an Investor can check every one
- [x] The money moves through the Venture Account, the Farm's side reaches the Farm's books, and every Animal changes owner
- [x] An Animal with no Weigh-in is refused, naming her, because a price nobody can defend is worse than a delay
- [x] The Owner's alone, audited
- [x] Tests cover a wind-up buying two animals at once, the refusal before the day, an Animal never weighed, and a Venture with nothing left to buy

**Which states it may happen in:** buying, fattening or selling. A Venture that never sold a single bull is exactly the case the clock exists for, so requiring Selling would leave it stuck with no way to settle. One called off has sent its money back and one settled has closed its books, and neither takes animals off anybody.

**Three checks the Internal Sale makes and this does not:** not-a-fattening-animal and not-a-Venture's-animal are unreachable — a Venture only comes to own an Animal through an Intake on a Float (always fattening, always bought) or an Internal Sale, and crossing a Venture-owned Animal to dairy is already refused. Ready-for-Sale is dropped on purpose: a finished bull is precisely what the wind-up must take.

**The day it is booked on** is refused if it falls inside the Wind-up Period, not only the day it is done on. The booked day is what the movements, the Money Event and every month's books read off, so leaving it free would let the Owner wait a day and write the buy-back back inside the period it is only allowed to happen after.

**Left for a later ticket:** `windUpDays` is a live Farm Parameter, so shortening it retroactively ends every open Venture's Wind-up Period — against a paper the Investor signed. `investorsPercent` is frozen at signing; this is not.
