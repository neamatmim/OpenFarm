# 08 — Nothing ever pays for a Venture's Selling Trip

**What is wrong:** A Venture is charged for the Selling Trip that took its animals to the haat — the
Settlement counts it, and it comes off the Investors' profit — but no money ever moves for it. The Farm
pays the lorry and the men, and is never paid back. The Venture's account keeps the money it was charged.

So a settled Venture's account does not read nothing, which is what `CONTEXT.md` says it must:

> the last of the money going out is what makes the Venture Settled. The Farm's own share of the profit
> leaves too … so a settled account reads nothing.

**Status:** ready-for-owner — the fix is a decision about money, not a bug to be patched quietly.

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
