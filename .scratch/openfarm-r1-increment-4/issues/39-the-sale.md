# 39 — The Sale

**What to build:** The Manager sells an animal: who bought her, for how much, what she weighed on the day, where she is going and who is taking her. It is hard-gated by meat withdrawal — the one gate that stops a farm selling meat it cannot say is safe — and she exits as Sold. At Eid several animals go to one buyer in one morning, so the app offers the last buyer and lorry again rather than asking for them five times.

A cull that ends in a sale is a Sale, not a Cull: the Manager decides at the time, one exit and one record, and the reason she was culled goes in the Sale's own note. Confirmed with the Owner 2026-09-12, resolving the knot ticket 31 recorded.

**Blocked by:** 38

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user stories 64 and 65; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Sale"); [Animal lifecycle and groups](../../openfarm-release-1/issues/04-animal-lifecycle-and-groups.md).

- [~] The Manager records a Sale: buyer name, address and phone, sale price, weight at sale, date, destination, vehicle and driver — **done**; the Owner checks it — **not done**, see below
- [x] Meat Withdrawal refuses the Sale outright, naming the day she is fit for sale
- [x] She exits as Sold, leaves the herd everywhere at once, and her history is untouched
- [x] A second sale to the same buyer on the same day offers that buyer and that transport again
- [x] Tests cover a sale, the withdrawal gate, the prefill, Staff being refused, and a culled animal having no separate sale path

## What was built

`sale.record` — buyer, price, weight on the day, destination, vehicle and driver — writing the
Sale, exiting her as Sold and closing the work raised about her, all in one transaction. Her page
carries how she went; `/sale` is the Eid-morning screen, listing only animals already confirmed
Ready and offering the last buyer and lorry of the day at one press.

**The gate is read live, inside the transaction.** `loadLiveAnimal` refuses an animal who has
already left, and the meat Withdrawal is checked against the row as it stands when the write
happens — so a dose recorded while the request was in flight still stops the sale. The refusal
names the day she is fit.

The weight at sale is its own figure and not her last Weigh-in: a beast loses weight on a lorry,
and the price was struck on what the scale said that morning.

## The other door, again

Ticket 38 found `animals.setState` walking an animal past the readiness gate. The same code had
an explicit carve-out for `sold` — *"Sold has no record of its own until the Sale arrives
(increment 4); refusing it here would leave the farm unable to say a cow was sold at all"* — and
the Sale has now arrived. `setState` refuses **every** exit State by name now, so a cow leaves the
herd by the record of how she went and by nothing else. Three existing tests were using that door
and now go through the Sale instead, which is what they were always describing.

## Decisions and departures

- **A cull that ends at a butcher is a Sale** (the Owner's decision, 2026-09-12, resolving the knot
  ticket 31 recorded): one exit, one record, and why she was culled in the Sale's own note. There
  is no second path, and the test asserts a sold animal cannot also be recorded as a Mortality.
- **The buyer is a Counterparty**, the same record the farm buys from — found by name, and
  learning an address or a phone it did not have. The lookup that Intake introduced is now shared
  by both sides of the deal rather than copied.
- **`lastToday` is scoped to the farm's own day**, not to a session or a rolling window: yesterday's
  buyer is a different market, and a prefill that survives the night is a prefill that puts the
  wrong man's name on a receipt.
- **The screen keeps the buyer and the lorry after a sale and clears the animal, the weight and
  the price.** At Eid the next beast is usually the same man's; the three things that change are
  the three the Manager retypes.

## Not done, and why

- **The Owner does not check it yet, and criterion 1 is only half ticked because of it.** The
  roles matrix says the Owner's part in a Sale is "R; approve above threshold", and the Approval
  Threshold (BDT 20,000) is a Farm Parameter that arrives with finance in increment 6. Building an
  approval flow without the threshold that turns it on would be inventing farm policy, so the
  criterion stays open rather than being ticked on the half that was easy.
- **No receipt and no transport card.** Ticket 40; the Sale now holds everything both need.
- **No combined receipt for a day's sales to one buyer.** Also ticket 40, and it reads this same
  day-scoped query.
- **Correcting a Sale is not built.** A price typed wrong stays typed wrong — the same gap Intake
  has, and the same mechanism would close both.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 387 passing (358 api + 19 web + 10
i18n), up from 381 — a sale that exits her and leaves her history alone, the prefill and its
expiry overnight, the withdrawal refusing outright with the day she is fit, the other door refused
at the same gate, the milker refused, a second sale refused, and a culled animal having no
separate path out. `pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
