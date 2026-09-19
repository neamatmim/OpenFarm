# OpenFarm investor-funded fattening projects — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-investor-projects/`)

Charted: 2026-09-17 · Last read against the code: 2026-09-19

## Destination

A written spec for **investor-funded fattening projects** in OpenFarm. Many investors, the Owner possibly among them, pool money that buys the cattle, feed and medicine. The Farm provides the sheds, the staff and the utilities, and profit or loss is shared at the percentages the contract sets. The map is done when every decision that spec needs is made and it can be handed to `/to-spec` → `/to-tickets`.

## Notes

- **Facts settled while charting** (not re-litigated):
  - Fattening only.
  - Many investors pool into one project. How many is now bounded by law: more than 20 means a company. The Legal form ticket settles it.
  - The Owner may hold a share in the pool.
  - Project cattle stand in mixed Pens alongside the Farm's own cattle and other projects' cattle, so costs follow the Animal, not the Pen.
  - OpenFarm records the full money trail: capital in, top-ups, payouts.
  - Investors get documents, not logins. An investor portal is a later effort.
  - Nothing is running yet and no contract exists, so the terms are designed here.
- **Domain vocabulary** lives in [`CONTEXT.md`](../../CONTEXT.md). Grep it before naming anything, and update it via `/domain-modeling` as terms resolve. Words already taken:
  - **Batch** means an offline send.
  - **Load** means one lorry.
  - **Margin** is one Animal's result, and it says _avoid_ "profit".
  - **Counterparty** is anyone the Farm buys from, sells to or pays. Decide whether an investor is one.
  - **Receipt** is a buyer's paper.
- **Release 1 decisions this effort leans on or may reopen** (in [the Release 1 map](../openfarm-release-1/map.md)):
  - Finance in Release 1: an income/expense record, not a ledger. Investor money is not the Farm's.
  - External-party access: no outside logins.
  - Fattening weights and sale readiness.
  - Feed and inventory: cost by weighted-average price, split by animal-days.
  - Audit trail and correction rules: sale corrections are Owner-only.
- **Skills**: `/grilling` + `/domain-modeling` for grilling tickets; `/research` (background agent) for research tickets; `/prototype` for the prototype ticket.
- **Research** findings land on `research/<name>` branches at `docs/research/<name>.md`; the ticket links them.
- Assets produced by tickets go in `.scratch/openfarm-investor-projects/assets/` and are linked from the ticket, never pasted in.

## Spec

[`spec.md`](./spec.md) — written 2026-09-18 from the ten resolved tickets, `ready-for-agent`, six increments, one test seam. The two open tickets stay open: what an adviser answers changes Farm Parameters and the agreement's wording, not the shape specified.

## What has shipped

**All six increments are built, reviewed and merged** (2026-09-17 to 2026-09-19), a ticket set per increment under `.scratch/openfarm-ventures-increment-{1..6}/`, plus a seventh set of six in `.scratch/openfarm-ventures-finishing/`. Thirty-seven tickets in all; every one is `done`.

1. **The widened costing** (6 tickets, 2026-09-18) — a Fodder Price on home-grown feed, the Hasil on each Intake, Buying and Selling Trips split across the animals they carried, and Herd Costs by animal-days under a Category the Owner marks. Every Animal's Margin, Cost of Gain and Cost per Litre read the wider sum. It shipped ahead of any Venture, on its own, as the sequencing intended — and the demo farm exercises all of it.
2. **The Venture, its Investors and its capital** (4 tickets) — the tables and states, Investment Agreements, Units, capital in and refunds, the twenty-Investor cap, and the **Purse** on every Money Event with each reader filtered.
3. **Buying** (4 tickets) — the Buying Float and its reconciliation, ownership set on the Animal at Intake, the Internal Sale and its bars.
4. **Living** (3 tickets) — the monthly Reimbursement, the Running Budget warning, the Owner's Advance, and the monthly Bank Check.
5. **Ending** (7 tickets) — Selling, the Wind-up Period, the buy-back, the Settlement with its five blocks, approval, payouts, Acknowledgements and Adjustments.
6. **The statements** (7 tickets, 2026-09-19) — the three papers, each narrowed to one Investor, each an **Export** with its Audit Event; the telling on the four occasions; and the screen they are made from.

**The finishing set** (6 tickets, 2026-09-18/19) closed what the increments left: Adjustments lifted out of the settlement store, a settled Venture refusing the Corrections that would move its figures, a Correction that reaches every Venture it touches, and the Settlement, its payouts and its Adjustments on screen.

**Caveat worth carrying.** Most of these screens were shipped without anybody looking at them. The first one that was opened — the statements sheet, 2026-09-19 — turned up three defects in a sitting, none of them in the code under review: a column header over no rows, a notice printing its own `{placeholders}`, and a month rendered `2026-09` inside a Bangla sentence. The Settlement, payout and Adjustment screens have still never been opened. **The demo seed makes no Venture**, which is why: there is nothing to look at without building one by hand through the UI first.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Prototype: investor statements](./issues/08-prototype-investor-statements.md) — three A4 sheets in Bangla with English labels: joining (capital received + the terms), progress (head, weights, ADG, spend by Category against both budgets, per-Animal table with photos, sent monthly and at each milestone), settlement (proceeds, every charge, profit, the split, per-Unit capital → taka back, what happened, the payout). Spend is shown but never unit prices, suppliers or other Investors; no projection anywhere. Prototype on `prototype/investor-statements`; it caught a double-count in the settlement sum, since corrected.

- [Who may do what with Venture money](./issues/09-who-may-do-what-with-project-money.md) — no new Role; Staff and Vets see nothing of Ventures; the Manager sees the work (which Venture owns an Animal, budgets, spend, warnings) but never Investors, Units, the split or the result; the Owner banks (capital, Float, Reimbursement, bank check, Advance, Internal Sale, Settlement, payouts, statements) and the Manager spends (Intakes, Hasil, trip costs, Sales); no new approvals; Release 1's correction windows carry over and a Settlement freezes its Venture. Matrix in `assets/venture-roles-matrix.md`.

- [Settlement: from the last Sale to each Investor's payout](./issues/07-settlement.md) — proceeds plus unspent Running Budget, less the Venture's charges and the Owner's Advance at cost, less capital, gives profit split 60 : 40 and divided by Units; loss comes off capital. One payout at the end, blocked until every Animal is gone, every price known, every Float and Reimbursement clear and the bank agrees. Investors round down and the Farm takes the remainder. The Owner's approval freezes the figures; anything later is a Settlement Adjustment, paid or waived above a set amount. Kept 12 years.

- [Investors, their shares and the money trail](./issues/06-investors-their-shares-and-the-money-trail.md) — a Money Event gains a **Purse**, the Farm's or a Venture's, so the two never mix and capital is never income; the Farm buys feed and medicine and each Venture reimburses monthly; cattle are bought from a reconciled Buying Float; a share is a fixed-price **Unit**; an Investor's record needs NID, bank account, nominee and a photo of the stamped agreement before any capital is recorded; the 20-Investor cap warns at 15 and refuses a 21st; per-Venture balance, budgets, a Running-Budget warning and a monthly bank check.

- [The contract: the commercial terms](./issues/04-the-contract-profit-loss-death-and-unsold-cattle.md) — one split per Venture from a farm-wide default of 60 : 40 to Investors, frozen at signing, no ceiling; a dead Animal is the Venture's loss, uninsured and never replaced by the Farm; negligence is a named standard decided by an Arbitrator, and costs the Farm that loss alone; a 30-day Wind-up Period, then the Farm buys the unsold by Internal Sale; no early exit save a share taken over at capital value; amendments need every Investor's signature. Farm-wide settings: default split, Wind-up Period, Floor %, Running Budget share.

- [The Project: its capital, its animals and its life](./issues/03-the-project-its-capital-and-its-animals.md) — the word is **Venture**: Open → Buying → Fattening → Selling → Settled, or Cancelled if the Floor is missed by the decision date and capital is refunded. Capital is planned as a Cattle Budget and a Running Budget, closes when buying starts, and a short Venture takes an interest-free Advance from the Owner, repaid at cost before profit. Every Intake names its owner, one at a time; an Internal Sale may move an Animal at a weight-based price, Owner-only and barred once Selling. Owner and Manager see it; Barn Staff do not.

- [The legal form and Shariah structure of a project](./issues/10-the-legal-form-and-shariah-structure.md) — Mudarabah, with the Owner as mudarib signing a separate stamped Investment Agreement with each Investor, one per project; at most 20 Investors across all running projects, the Owner included; a known circle resident in Bangladesh, no advertising or referrals; bank channels only through a dedicated Venture Account; the Owner's own capital treated as an Investor's, with the farm's share a separate line; the software an internal ledger and statement printer, never a place to transact. Proposed, pending the lawyer.

- [Bangladesh law on pooling investors' money into a cattle project](./issues/01-bangladesh-law-on-pooled-cattle-investment.md) — no licence fits; the lines are no repaid capital or promised return (else banking or finance business), no platform taking public money, more than 20 people means a company, and no referrals. A closed group sharing real profit and loss is allowed, under a stamped written contract. The design must never promise capital or a return, must allow negative results, and needs a lawyer before any money is taken. Findings on `research/bangladesh-pooled-investment`.

- [How cattle-investment and agri-crowdfunding schemes are structured](./issues/02-how-cattle-investment-schemes-are-structured.md) — fixed-price shares in a batch, investors put in all the capital, investors get 30–50% of profit, loss borne by capital, one payout at the end, photo and weight updates. Every fixed-return scheme collapsed. Nobody publishes rules for underfunding or a settlement statement. Findings on `research/cattle-investment-schemes`.

- [What a project is charged for](./issues/05-what-a-project-is-charged-for.md) — the project pays for the animal and what goes into her; the Farm pays for the place and the people. One way of costing for every Animal, adding Fodder Price on Harvests, per-Animal Hasil, Buying/Selling Trips split per head (selling per head taken), and Herd Costs by animal-days via an Owner-set mark on the Category. Wages, utilities, hygiene, equipment and store loss stay the Farm's. Spend is live; unpriced doses and feed block settlement.

## Not yet specified

- **Tax and the accountant.** How project money appears in the monthly accountant export, and what the software must withhold or show. The research found 10% withholding if a contract reads as a deposit, and none found for a genuine profit share; VAT is likely on any fee. The advisers in the lawyer task confirm; then waits on how investor money is recorded.
- **Reaching Investors without a login.** How the statements physically get to them (print, WhatsApp, email) now that their content and cadence are settled.
- **The Owner's view of Ventures.** Venture tiles and exceptions on the Owner's farm page: a Venture running over cost, a Running Budget nearly gone, animals unsold as the Wind-up Period ends. **No longer blocked** — settlement shipped 2026-09-18. `ventures.herd` (`routers/ventures.ts`) already returns the whole progress reading to Owner and Manager and nothing calls it.
- **A Venture in the demo seed.** Nothing under `packages/api/src/seed/` makes a Venture, Investor, Agreement or Settlement, so no Venture screen can be looked at without twenty minutes of hand-building. It is the cheapest thing on this list and it unblocks looking at the six screens nobody has seen.

## Out of scope

- **Investor login / portal.** Investors get documents in this effort; a read-only portal is a later effort (decided while charting).
- **Investors living abroad.** Money from outside Bangladesh raises foreign-exchange questions nobody has answered; the circle is resident Investors for now (ruled while deciding the legal form).
- **Dairy projects.** Investor money funds Fattening only; milk-income projects settled per period are not part of this destination (decided while charting).
