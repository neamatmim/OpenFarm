# Survey of the reports, 2026-10-06

Three reviewers each took one part: the money reports, Returns and Ventures' papers, and the herd and health records. The question for all three: do the same figures agree wherever they are shown? Each finding is marked:

- **Proven:** a temporary test went red against main at 5d57bd5c, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. Today's void and Sale-day correction (defects in work merged today)

1. **Proven, high.** A Sale can be voided after its Venture's Settlement is approved, because only `settled` is refused, and a Venture stays in Selling until its last payout.
   - The approved Settlement keeps the proceeds while the account loses them, and the bull stands again.
   - A death's void and the general Correction guard have the same gap.
   - `corrections/sale.ts`, `corrections/mortality.ts`, `corrections/correction.ts:411-430`; the acts that already refuse once approved go through `venture-act.ts:65` (`assertNotSettledUp`).
2. **Traced, medium.** Voiding a Venture's cash Sale after the cash was deposited deletes the deposit's `sale_in` movement: the money is in the bank, but the account's books lose it. `corrections/sale.ts`, `venture-store.ts:1124-1137`, `cash-store.ts:932`.
3. **Proven, medium.** Correcting a Venture Sale's day leaves its `sale_in` movement on the old day, so the month the bank is checked against misses it. `venture-store.ts:1147-1158`.
4. **Proven, medium.** A Sale's day can be corrected to before the Internal Sale that made her the Venture's: an Internal Sale writes no Move, so `assertWasHereAt` misses it. The Venture's Holding then never ends, its Return never finishes, and the bull drops out silently. `herd-store.ts:814-831`, `holding.ts:250-254`, `cattle-returns.ts:276-277`.

## B. Papers and registers

1. **Proven, high.** The passport and the Withdrawal Summary print each dose's meat clear day from the product's **current** days, not the days kept on the dose. The same paper can say "NOT CLEAR — 31 March" above a dose line saying "clear 13 March". `paper-words.ts:94-102`.
2. **Proven, medium.** A dose not prescribed is labelled "campaign" on the passport and the Withdrawal Summary. `domain/src/papers.ts:242-244`.
3. **Proven, medium.** The movement log never shows an animal written off as Lost, or a Found one coming back. `registers/movement-log.ts:149-165`.
4. **Proven, medium.** The passport prints her sex in English ("female"). `routers/papers.ts`, `domain/src/papers.ts:287`.
5. **Traced, low-medium.** The passport says how she left only for a Sale; a death, a cull or a Lost write-off is not said. `routers/papers.ts`, `animal-record.ts:166`.
6. **Traced, low.** The treatment register's course column does not say a course was stopped. `registers/treatment.ts:80-82`.

## C. Cost and Return figures

1. **Proven, medium-high.** A Vet Fee naming no animal is in no cost figure anywhere: it is not on Costs by Side, not in the monthly report's costs, and not an Overhead. `routers/money.ts:298-301`, `cost-store.ts:419-435,838-850`, `overhead-store.ts:28`.
2. **Proven, medium.** The monthly report's margin for a bull sold to a Venture and bought back counts the Farm's first stretch twice: ৳5,000 where Costs by Side says ৳8,000 and Returns ৳7,000. `cost-store.ts:1022-1036`.
3. **Proven, medium.** The Investor's progress statement and portal lose any animal that has since changed owner, because they read whose she is today. A bull's gain is also counted from his Intake even while he was the Farm's. `venture-herd-store.ts:173-234`.
4. **Traced, low.** The "lost in the year" cost tile counts every owner's charges, and rounds to whole taka. `missing-store.ts:359-367`.
5. **Traced, low.** Return on Capital leaves out a paid Settlement Adjustment that the same statement lists as paid. `returns-store.ts:855-861`, `cattle-returns.ts:653-658`.
6. **Traced, low.** The settlement statement's herd story does not count a bull sold on to another Venture, so its counts don't add up. `investor-statement-store.ts:596-607`.

## D. The accountant's export

1. **Traced, low-medium.** Lorry money is "whole farm" in the export's By Side, but charged to Fattening or Dairy on Costs by Side. The CSV's side column cannot rebuild the paper's split. `money-export-store.ts:294`, `reports.ts:80`.
2. **Traced, very low.** Each record's details are found by id alone; a broker's fee is right today only because it shares the Sale's id. `money-export-store.ts:320`.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/void-guards | Done (a Sale or death void refused once her Venture's Settlement is approved — `already_approved`; a cash Sale's void refused once deposited — `money_moved_since`; a bank-paid Venture Sale's movement moves with a corrected day; no exit before the Internal Sale that made her the new owner's — `before_she_was_here`. The death's void check has no test of its own: an approved Venture has no live animal to kill) |
| B     | fix/papers-registers | Done (`doseWords` reads the dose's own days through `meatDaysOf`; a dose not prescribed is said with its advice, never as a campaign; the movement log has `lost` and `found`; the passport says her sex in Bangla (`sexWords`) and how she left by a death, a cull or a write-off (`leftWords`); the treatment register's course says it was stopped) |
| C     |        |        |
| D     |        |        |
