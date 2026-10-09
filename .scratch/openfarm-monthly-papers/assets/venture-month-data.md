# How a Venture's month can be counted: findings

Ticket: [02](../issues/02-how-a-ventures-month-can-be-counted.md). Read from the code at `7e257a56`. Paths are relative to the repo root.

## 1. Records with a day or instant to cut a month by

| Record                                                                                                                                                                            | Table and day field                                                                                                                                                                                                                                    | Tied to the Venture by                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Venture Movement: capital_in, refund, float_out/back, intake_out, internal_buy/sell, sale_in, reimbursement, advance, payout, advance_repaid, farm_share, farm_loss_in, made_good | `venture_movement.moved_on` (farm-day text), `packages/db/src/schema/venture-account.ts:73-131`, kinds at `:38-60`                                                                                                                                     | `venture_id`. A reimbursement also has `for_month` (`:91`), the month it pays for. That is not the month the bank moved it.                                              |
| Intake (purchase price, Market Toll)                                                                                                                                              | `intake.arrived_at`, `packages/db/src/schema/fattening.ts:93`                                                                                                                                                                                          | `ownedThenBy(animalId, arrivedAt) === ventureId`, as the Settlement reads it (`packages/api/src/settlement-store.ts:388-392`)                                            |
| Internal Sale in/out                                                                                                                                                              | `internal_sale.sold_on` (farm day), `fattening.ts:336`. The handover instant is `handedOverAt` (`packages/domain/src/holding.ts:77`).                                                                                                                  | `from_venture_id` / `to_venture_id`. Its movement takes `movedOn: soldOn` (`packages/api/src/internal-sale-store.ts:146`).                                               |
| Sale                                                                                                                                                                              | `sale.sold_at`, `fattening.ts:281`                                                                                                                                                                                                                     | Owner at `soldAt`. The `sale_in` movement is dated the sale day if paid by bank, or **the deposit day** if paid in cash (`packages/api/src/venture-store.ts:1155-1250`). |
| Death or cull                                                                                                                                                                     | `mortality.happened_at`, `packages/db/src/schema/herd.ts:384`. Also `animal.state_changed_at` through `exitOf` (`packages/domain/src/pen-history.ts:152`).                                                                                             | Owner at that instant                                                                                                                                                    |
| Lost                                                                                                                                                                              | `missing.since` / `written_off_at`, `packages/db/src/schema/missing.ts:43,50`. The `made_good` movement is dated the day of the write-off (`packages/api/src/made-good-store.ts:101`).                                                                 | `made_good.animal_id`, `venture_id`                                                                                                                                      |
| Weigh-in                                                                                                                                                                          | `weigh_in.weighed_at`, `fattening.ts:191`                                                                                                                                                                                                              | Owner at that instant (`theirStretch`, `packages/api/src/venture-herd-store.ts:173`)                                                                                     |
| Feed, dose, vet, Market Toll, trips, broker, Herd Cost charges                                                                                                                    | `Charge.at` in `farmCosts` (`packages/api/src/cost-store.ts:199-583`): from `fedAt`, `givenAt`, `visitedOn`, `arrivedAt`, `wentOn` and `soldAt`. A Herd Cost share is clamped inside the days its owner held her (`packages/domain/src/costs.ts:259`). | `ownedThenBy(animalId, at)`                                                                                                                                              |
| Monthly Sums due                                                                                                                                                                  | Worked out, not stored: `monthlySumsOf` gives each sum's `dueOn` (`packages/domain/src/monthly-sums.ts:96`). Paid means `capital_in.moved_on`.                                                                                                         | The Venture's frozen terms and its Agreements                                                                                                                            |
| Pay-in Note                                                                                                                                                                       | `pay_in_note.sent_on` (farm day) and `created_at`, `venture-account.ts:406-440`                                                                                                                                                                        | `venture_id`, `agreement_id`. It is an Investor's word, not money. The money is the `capital_in` it leads to (`movement_id`).                                            |

A Venture's own hand-entered Money Events are never charged to animals (`cost-store.ts:331-345`). There is no other kind of charge to look for.

## 2. One way of working a Holding's costs

- The domain primitives are in `packages/domain/src/holding.ts`:
  - `chargesOfOwner(charges, owner, ownedThenBy, kinds)` at `:111`
  - `chargesInHolding` at `:137`
  - `costsOf` at `:154`
  - the kind sets `EVERY_CHARGE` and `WHAT_THE_FARM_IS_OWED` at `:52-60`
- **Settlement:** `whatItWasCharged(costs, ownedThenBy, ventureId, paidIn)` (`settlement-store.ts:377`) calls `chargedTo` (`cost-store.ts:1024`), which is `chargesOfOwner(..., EVERY_CHARGE)` → `costsOf` → `roundedCosts`. "Bought" is the price of each Intake the Venture owned at arrival, plus its `internal_buy` movements. Proceeds come from the account's movements (`heldByEach`), not from the Sales.
- **অগ্রগতি:** `theirSpend` (`packages/api/src/investor-statement-store.ts:318`) calls the same `whatItWasCharged`. Its running spend is the keep lines (`:304`).
- **Reimbursement:** `consumedBy(costs, ownedThenBy, ventureId, {from, until})` (`cost-store.ts:1052`) is `chargesOfOwner(..., WHAT_THE_FARM_IS_OWED)` filtered to `from <= at < until`. `aMonthsReimbursement` (`packages/api/src/reimbursement-store.ts:31`) calls it with `monthOf(startOfFarmDay("M-01"))`. `owedByMonth` (`cost-store.ts:1124`) runs it month by month.
- **Returns:** `spentOn` (`packages/domain/src/cattle-returns.ts:209`) calls `chargesInHolding`. That is the same owner-that-day test, with the Fattening side and the Holding's window added.

**A month can use the same function.** Every charge has exactly one `at`, so the partition is exact:

```
chargesOfOwner(costs.charges, ventureId, ownedThenBy, EVERY_CHARGE).filter(at in [from, until))
```

The months summed unrounded equal `chargedTo`. Each month's lines are rounded to the paisa, so a month-by-month sum can differ from the Settlement by paisa. This is the same gap CONTEXT.md already names between the Reimbursement and the Settlement. For that reason the "run to the end of M" figure should be worked over `[start, until(M))` and rounded once, never added up from the months.

The month's Reimbursement figure is already `owedByMonth` for that month: what it comes to now, what was paid, and what is still owed.

## 3. Head counts, weights, balance

- **Owner at an instant:** `ownedThenByOf` (`venture-store.ts:1310`) is built on `ownersOverTime` (`:742`) and returns a closure.
- **Head count at an instant t:** the Venture's animals are `ownerVentureId` or any animal an Internal Sale moved to or from it (`everyOneTheyHeld`, `venture-herd-store.ts:221`). Count those where all of these hold:
  - `ownedThenBy(id, t) === ventureId`
  - she had come by t (`intake.arrivedAt`, or the handover)
  - she had not left by t (`exitOf(...).at`)

  The count at the month's end, less the count at its start, equals intakes and buys-in less sales, sells-out, deaths and losses dated in the month.

- `theirProgress` (`venture-herd-store.ts:292`) **cannot be reused for a past month** as written, for three reasons:
  - It decides who is standing from today's `state` (`:350`).
  - It reads only the latest 30 weigh-ins per animal (`:275`, `READINGS_FOR_A_RATE`), so a past month-end may have none left in range.
  - Its herd line calls `farmDayOf` per reading (`:157`).

  `theirStretch` and `growthOf` (`packages/domain/src/fattening-growth.ts:48`) do take an end instant and can be given `until(M)`.

- **Weight at an instant:** the latest unflagged weigh-in on or before it inside her stretch. If there is none, use her Intake or Internal Sale weight. **Gain over the month:** pooled, as `growthOf` does it: kilos between each animal's last reading at or before the month's start (or her arrival) and her last reading in the month, over the days between those two readings. An animal not weighed in the month is counted and named, not given a figure.
- **Balance at month end:** `balanceAtMonthEnd(tx, farmId, ventureId, "YYYY-MM")` (`venture-store.ts:1014`) is `heldByEach(..., lastDay)` folded by `folded` (`:482`). `balancesAtMonthEnds` (`:1030`) does several months in one ordered read. The Bank Check (`venture_bank_check`, `venture-account.ts:165`) **stores** `read_money` and `expected_money` for a month. `expectedAtMonthEnd` (`packages/api/src/routers/ventures/books.ts:172`) recomputes the expected figure and flags it `stale` when it has moved since. Opening balance = month-end of M−1. The movements in between are the `moved_on` rows.

## 4. `planAgainstActual`

`planAgainstActual` is at `packages/api/src/venture-plan-store.ts:173`. Each part, and whether it can be cut to the end of M:

| Part                | What it reads                                                                                      | Cut to the end of M?                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `buying`            | `boughtFor` (`packages/api/src/venture-bought.ts:12`), every intake and buy-in with no date filter | Yes: filter by `arrivedAt` / `soldOn` up to the end of M                                                             |
| `growth`            | `plannedHeadKg(lines, days)`, with days counted from `decideBy` to `now` (`:193-207`)              | The plan side, yes. `actualKgToday` comes from `theirProgress(now)`, which cannot be read as of a past day (see §3). |
| `runningSpentMoney` | `theirSpend`, whole run                                                                            | Yes: filter charges with `at < until(M)`                                                                             |
| `projected`         | `projectionOf(now)`, today's prices                                                                | No: a projection made today, and ADR 0010 keeps it off papers                                                        |

## 5. What cannot honestly be cut by month

- **Profit and the per-Unit share:** these exist only at Settlement. Proceeds less charges for one month is cash flow, not profit.
- **Margin:** whole life, whoever owned her (CONTEXT.md **Margin**). `economicsOfAnimal`, which `costsBySide` uses, is not the Venture's figure. For an animal sold in the month, the Venture's own figure is her price less `costToItsOwner(costs, ownedThenBy, animal, ventureId, boughtIn)` (`cost-store.ts:941`).
- **Overheads:** a Venture is never charged them (CONTEXT.md **Overhead**). `overheadsOf` spreads them over every head and carries no Venture share.
- **Return on Cost running range and Projection:** both value standing animals at today's prices, which no month end kept.
- **A closed month still moves:** late costs, Corrections, a later Feed-in that reprices feed, and medicine priced later all move a month already closed. `owedByMonth` already shows this as the Reimbursement's carried lines. A month's paper therefore states the books as they stand when it is printed.
- **Two months for one movement:** a Reimbursement has a `for_month` and a `moved_on`. A cash Sale has a `sold_at` and a deposit day. The paper should show each by the date that matches what the line says.
- Unallocated feed, trips and Herd Costs belong to no owner, so they never reach a Venture.

## 6. Performance

- `farmCosts` is cached until a write (`cost-store.ts:591`). `ownedThenBy` is called once per charge, so filter the Venture's charges once, as `owedByMonth` does (`:1131-1141`), and only then cut them by month.
- Work out the month's bounds once, as instants: `monthOf(startOfFarmDay("M-01"))` (`packages/domain/src/costs.ts:129`), then compare with `getTime()`, as `narrowedToEach` does (`cost-store.ts:762`). Never call `farmDayOf` per charge, per reading or per animal.
- `moved_on` is a farm-day string, so compare it with `lastDayOf(M)` (`venture-store.ts:783`). That needs one `farmDayOf` call, not one per row.

## Recommended basis for the Venture's month

Build on:

- `chargesOfOwner` + `costsOf` / `roundedCosts`, cut to `[from, until)`, for the month's charges by Settlement line. The "bought" line is Intakes by `arrivedAt` plus `internal_buy` by `moved_on`.
- The same charges over `[start, until(M))` for "the run to the end of M".
- `owedByMonth` for the month's Reimbursement.
- `balanceAtMonthEnd` for M−1 and M, the `moved_on` movements in between grouped by `WHAT_IT_DOES` line, and the `venture_bank_check` row with its stale flag.
- A new as-of version of `theirStretch` + `growthOf` for head counts and weights, with every weigh-in read.
- `monthlySumsOf` + `sumsStandingOf` (`packages/domain/src/monthly-sums.ts:199`), with paid money taken from `capital_in` up to the end of M, for the Monthly Sums.

**Include:**

- opening and closing heads, and what moved them
- charges in the month, plus the run to date
- money in and out of the account, and the balance against the Bank Check
- the Reimbursement for the month
- the kilos gained, weighed and named
- Monthly Sums due and paid
- the Venture's own figure for each animal sold in the month
- the plan's buying and running-spend, cut to the end of M

**Exclude:**

- profit and shares
- Margin
- Overheads
- Return on Cost range and Projection
- any figure added up from other months
