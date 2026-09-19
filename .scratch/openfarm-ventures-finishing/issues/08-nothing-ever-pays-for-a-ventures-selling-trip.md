# 08 — Nothing ever pays for a Venture's Selling Trip

**What is wrong:** A Venture is charged for the Selling Trip that took its animals to the haat — the
Settlement counts it, and it comes off the Investors' profit — but no money ever moves for it. The Farm
pays the lorry and the men, and is never paid back. The Venture's account keeps the money it was charged.

So a settled Venture's account does not read nothing, which is what `CONTEXT.md` says it must:

> the last of the money going out is what makes the Venture Settled. The Farm's own share of the profit
> leaves too … so a settled account reads nothing.

**Status:** done — the Owner chose the first of the three ways out (2026-09-19).

**Spec:** `CONTEXT.md` — **Settlement**, **Reimbursement**, **Venture Movement**;
[Ventures spec](../../openfarm-investor-projects/spec.md), "What a Venture is charged" and "Two purses".

## How it was found, and the exact figures

Found by seeding a Venture and settling it ([ticket 07](./07-a-venture-in-the-demo-seed.md)), then
reading the Settlement screen — the first time anybody has opened it.

**কোরবানি ২০২৬ ভেঞ্চার**, settled 2026-09-05 in the demo seed. Its account, by movement kind:

| in                |               | out                       |                  |
| ----------------- | ------------- | ------------------------- | ---------------- |
| capital in (3)    | ১২,০০,০০০     | Buying Float out          | ৯,০০,০০০         |
| Float home        | ১,৯২,৩৬০      | Reimbursements (3 months) | ১,৫৫,৬১৯.২১      |
| sale proceeds (6) | ১০,৮৭,০০০     | payouts (3)               | ১৩,২৮,৮৩২        |
|                   |               | the Farm's share          | ৮৫,৯০৭.৭৮        |
| **in**            | **২৪,৭৯,৩৬০** | **out**                   | **২৪,৭০,৩৫৮.৯৯** |

Left in the account: **৳৯,০০১.০১**.

Its one Selling Trip: transport ৳৭,৪২৮ + keep ৳১,৫৭৩ = **৳৯,০০১**. The same number, to the taka.

## Why it happens

A Venture's seven charges reach it by three different roads, and one of them has no road:

- **Purchase price, Hasil and the Buying Trip** come out of the **Buying Float**, which is drawn from
  the Venture's account before the lorry goes and reconciled against it the same evening. Money moves.
- **Feed, medicine, vet fees and Herd Costs** come back by the monthly **Reimbursement**. Money moves.
- **The Selling Trip** is charged by neither. `consumedBy` (`packages/api/src/cost-store.ts:700`) — what
  `ventures.reimburse` is worked out from — returns exactly four heads: `feedBdt`, `medicineBdt`,
  `vetBdt`, `herdBdt`. No trips. And a Selling Trip happens long after the Float is closed.

`chargedTo`, which the Settlement uses, counts all seven. So the Investors are charged for the trip and
the Farm pays for it: the Venture is charged twice over in the Farm's favour on paper and the Farm's
pocket is short in fact. On the seeded run the Farm is ৳৯,০০১ down and the Investors ৳৫,৪০০ lighter
(their 60% of it), with ৳৯,০০১ sitting in an account that is supposed to read nothing.

## What has to be decided (the Owner's)

Three ways out, and they are not equivalent:

1. **The Reimbursement widens to include trips.** Then a Selling Trip is paid back the month after it
   happens, like feed. Closest to how the money already works, but the word "consumed" stops fitting —
   a lorry is not something an animal eats — and `ventures.consumption` is a screen the Owner reads.
2. **The Settlement sends it.** A last movement out, beside the Farm's share, for everything charged
   that was never reimbursed. Keeps the monthly paperwork as it is, but adds a movement kind and means
   the Farm carries the cost until the run ends.
3. **The Farm absorbs it.** Then it must come out of `chargedTo` as well, or the Investors are paying
   for something the Farm gave them — and that would move every settled figure.

Whichever it is, the Settlement should refuse to close, or say plainly what it is leaving behind, rather
than quietly stranding money in an account the glossary says reads nothing.

## Checked before writing

- The Buying Trip is genuinely covered: `reconcileFloat` balances animals **plus** `tripCostOf(trip)`
  against what was drawn (`venture-store.ts:391`, `routers/ventures.ts:1039`), so that road is sound.
- Hasil rides on the Intake and is paid from the Float — sound.
- This is not the seed's doing: the seed records the Selling Trip through `sellingTrips.record`, the
  same procedure the app uses, and pays for it in cash as the Farm's own trips are paid for.
- Nothing in the 1150-test suite catches it, because no test both charges a Selling Trip to a Venture
  and then reads the account balance after settling.

## What was decided, and what was built

**The Owner chose the first way out (2026-09-19): the Reimbursement widens.** A Selling Trip is paid
back the month after it happens, beside the feed, the medicine, the vet and the Herd Costs. The
Settlement was left alone and the Farm absorbs nothing.

**Where the rule now lives.** `hersThen` (`cost-store.ts`) is the one place that decides what a
Reimbursement is owed as against what a Settlement charges. Its `withItsOwn` branch now reads: the Hasil
and the **Buying Trip** came out of the Venture's own Float and are a Settlement's business only; a
**Selling Trip** is kept either way, because it happens long after that Float is shut and the Farm pays
the lorry. `chargedTo` is untouched, so every trip is still charged exactly once and no settled figure
moved on account of this.

**Told apart by `FarmCosts.sellingTrips`**, a map of outing id to where it went. The two kinds of outing
share one `CostShare` list and one line on the Settlement, so something had to distinguish them; the map
also gives the Reimbursement sheet a name to print instead of an id.

**Whose animal she was is asked at the moment of the cost.** A lorry's cost splits over everyone it
carried, and only the animals that were the Venture's *on the day it went* fall to the Venture. The test
proves it: a ৳৯,০০০ outing carrying two bulls, one of them bought back by the Farm beforehand, leaves
the Venture owing ৳৪,৫০০ and not a taka more.

**Proved end to end on the seeded farm.** কোরবানি ২০২৬ settles as before, and its account now reads
**৳০.০১** where it read **৳৯,০০১.০১**. Its Selling Trip cost ৳৯,০০১ and is now reimbursed in the August
paperwork, before the books close in September.

**One paisa is still there, and it is not this.** Read at exact numeric precision the settled account
holds `0.01` — one paisa, not float drift. It was inside the ৳৯,০০১.০১ all along, and rounding it away
quietly would be exactly the sort of change this ticket said not to make. Its own ticket now:
[12](./12-a-settled-account-keeps-a-paisa.md).

_(Corrected 2026-09-19: this paragraph first blamed `roundTaka` for rounding to whole taka while
consumption carried paisa. It rounds to the **paisa** — `Math.round(amount * 100) / 100`. The real cause
is the order of the rounding, worked out in full on ticket 12: a month sums parts that are already
rounded, on purpose, and the Settlement rounds once over the whole run.)_

**Two test files had to pay the trip.** `settled-corrections.test.ts` could no longer approve its
Settlement, which is the change working: a Settlement now refuses to close over an outing the Farm paid
for and was never repaid. Its setup reimburses the month now. The figures in `settlement.test.ts` were
deliberately left alone — adding a Selling Trip to that arc shifts nine hand-worked numbers chosen so
the rounding remainder is not zero and one Venture ends in loss, and breaking that to test this would
have cost more than it told anybody.

## What the review caught

**Nothing proved the defect was fixed.** The first cut tested only a readout: that `consumption` now
returns a trips line. The ticket's actual complaint was that a Settlement closes over an unpaid lorry
and leaves money behind, and neither was asserted anywhere — the edit to `settled-corrections.test.ts`
was a fixture keeping an old test green, not an assertion. `venture-pays-for-its-lorry.test.ts` now runs
one clean arc end to end: a ৳৭,৫০০ lorry is the whole of what February owes; `approveSettlement`
refuses with `a_reimbursement_is_owed` naming that month; and once it is paid, the payouts sent and the
Farm's share taken, the account reads **nothing**. That last assertion is the defect itself.

**The glossary said something no longer true.** `CONTEXT.md`'s **Reimbursement** entry enumerated feed,
medicine, vet fees and Herd Costs. Option 1 changes what the term means, so the entry now says Selling
Trips too — and says why a Buying Trip and the Hasil are not on it.

**"Consumed" stopped fitting, exactly as this ticket predicted.** The words the Owner reads said "what
{venture}'s animals consumed of what the farm bought" — and in Bangla "যা খেয়েছে", what they ate. A
lorry is not eaten. Both now read "what her animals cost of what the farm paid for". The identifiers
(`consumedBy`, `ventures.consumption`) are **kept**, deliberately: renaming a procedure the web app
calls plus three internals, to chase one line item, would make the change harder to read than the thing
it fixes. Written here rather than left silent.

**The label avoided the defined term.** "Trips to the haat" is now "Selling trips", which is what
`CONTEXT.md` calls it.

**A comment in the new test was wrong about its own fixture.** It said the second bull had been "bought
back by the Farm"; it was a **Correction** saying she was never the Venture's — a different act
entirely. Checked against the test above it and corrected, and the test renamed from "is what the month
owes" to what it actually proves: that a lorry is charged to the animals it carried, by who owned them
then.

**Considered and kept: the kind is re-derived from a map.** `tripShares` merges Buying and Selling
outings and drops which was which, so `FarmCosts.sellingTrips` exists to tell them apart again. Carrying
a `kind` on `CostShare` would mean putting it on the Hasil and the Herd Costs too, where it means
nothing; splitting `all.trips` in two would fork a list that `chargedTo` and `ofAnimal` both want whole.
The predicate is named `theFarmPaidForIt` now, which is the thing that was actually hard to read.
