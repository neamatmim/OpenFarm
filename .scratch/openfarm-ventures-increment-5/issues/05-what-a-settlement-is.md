# 05 — What a Settlement is, and what blocks it

**What to build:** The close-out of a Venture, shown before it is done: what its Animals fetched, everything it was charged as its own line, the Owner's **Advance** repaid at cost, capital returned whole, and the profit split by the percentages that Venture's Agreements froze, divided by Units held.

```
proceeds  = Σ Sales of its Animals + Σ Internal Sales out
charged   = Σ its Animals' costs (purchase + Hasil + Trips + feed + doses + vet + Herd Costs)
profit    = proceeds − charged                         // may be negative
investors = round(profit × investorsPct / 100)
perUnit   = floor(investors / units)                   // whole taka
rounding  = investors − perUnit × units                // goes to the Farm
farm      = profit − investors + rounding
payout(i) = capital(i) + perUnit × units(i)
```

The Advance is repaid out of the Venture's cash before capital returns, and is not a charge — the costs it paid are already in `charged`. Unspent Running Budget is not added either: it is capital never spent, and returns as capital. A loss comes off capital by Units held and is shown plainly, because an Investor should learn it from the statement rather than from a rumour.

And it is refused while anything makes it a guess: an Animal still standing, an Animal carrying unpriced feed or an uncosted dose, a **Buying Float** unreconciled, a **Reimbursement** owed, or the bank disagreeing.

**Blocked by:** 02 (a Bank Check that knows it is stale), 04 (a way to clear the last animals)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 5, user stories 62–67, and the **Settlement** decisions with the formula above; `CONTEXT.md` — **Settlement**, **Unit**, **Advance**, **Buying Float**, **Reimbursement**, **Bank Check**.

- [x] A Venture shows its Settlement before anything is done: proceeds, every charge as its own line, the Advance, capital and the profit
- [x] The split is by the percentages that Venture's Agreements froze, divided by Units held, floored to whole taka, with the remainder shown as a line to the Farm
- [x] A loss comes off capital by Units held and reads plainly as a loss
- [x] The Advance is repaid at cost before capital returns, even where the Venture lost money, and is never counted among the charges
- [x] Refused for each of the five in turn, each with a word the reader has, and the Venture says which of them stand
- [x] The arithmetic is the costing the farm already does, narrowed to that Venture's Animals — no second sum
- [x] The Owner's alone
- [x] Tests cover a Venture in profit with a rounding remainder that is not zero, one in loss, an Advance repaid in both, and each of the five blocks in turn

**From ticket 02:** what blocks on the bank is two questions, not one. `bank.monthsOut` covers every month that was read and is still out — the statement disagreed, or the farm has since changed its mind about what the month ended on. It does **not** cover a month nobody ever read, which has no Bank Check row at all: for that, `bank.lastCheckedMonth` must reach the last month that is over.

**From ticket 03:** a Sale of an Animal belonging to a **settled** Venture currently does nothing — `reachesSellingOnASale` returns quietly for any state that is not buying or fattening. Once a Venture can be settled, that has to become a refusal rather than a silence. `stillHersByEach` (venture-store) counts the Animals a Venture still has, which is what "settlement refused while an Animal still stands" is asked of; nothing enforces it yet.

**Also from ticket 04:** `windUpDays` is read live rather than frozen onto the Venture at opening, so the Wind-up Period of a running Venture moves if the Farm Parameter changes. If a Settlement is to refuse on the wind-up day having passed, that day should be the one the Investor's paper implies, not today's parameter.

## What was decided while building

**The blocks are data, not a refusal.** The settlement view returns the figures *and* the reasons it cannot be acted on, because an Owner told only "no" has nothing to go and put right, and she is owed the shape of the answer while she is chasing the last weigh-in. Ticket 06 refuses the **approval** while any block stands.

**The months scanned run up to and including the month it is being settled in.** A review found the hole: what a Venture's animals ate this month cannot be reimbursed — `reimburse` refuses a month that is not over — and the first version simply did not look, so a Settlement passed clean while the account still had money to part with. It is a Reimbursement owed like any other, and the Owner waits for the month to end. Proved with a failing test before it was fixed.

**The account must balance.** Once nothing is owed, the Owner's Advance back plus every payout plus the Farm's share is exactly what the Venture Account holds. The identity only holds because every block above holds, which is the whole argument for the blocks.

**A sixth block, `agreements_disagree`**, beyond the ticket's five: two Agreements of one Venture signed on different splits. The farm cannot divide its way out of that, so it says so rather than picking one.

**The bank block tells three problems apart** — disagreed, gone stale, never read — because `CONTEXT.md` says a Venture must, and the first version flattened them into one list.

**On flooring a loss:** `floor` sends each Investor slightly more of a loss and shrinks the Farm's. Reviewed against story 65 ("rounded down to whole taka … so that nothing is paid out that the account does not hold") and found correct in both directions — flooring the payout downward is the rule either way.

**Left for ticket 06:** no screen yet. The settlement is API-only; six words are in both catalogues and `wordFor` exists to read them, but nothing renders the view.
