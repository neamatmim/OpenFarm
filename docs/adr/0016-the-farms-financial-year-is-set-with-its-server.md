---
status: accepted
date: 2026-10-04
---

# The farm's financial year is set with its server

On 2026-10-04 the Owner asked how the Monthly report's «বছরে নিট» works, and how to read a year before the last twelve months. The report read only the twelve months ending with this one, and nothing in OpenFarm knew what a year was. In Bangladesh an individual's income year runs from July to June, and that is the year the accountant closes the books on.

- **`OPENFARM_YEAR_STARTS`**: the month, 1 to 12, the farm's financial year begins in. `7` (July) when unset. It sits with the farm's currency, clock and country (ADR 0013), and is fixed the same way, when the server is set up. A month that is not 1 to 12 stops the server. The server writes it on the page's root (`data-year-starts`), and the browser reads it back, as it does the others.
- **A year is named by the calendar year it begins in.** Code and addresses say `2025` for July 2025 to June 2026 (`financialYearOf`, `monthsOfFinancialYear`, `daysOfFinancialYear` in `packages/domain/src/financial-year.ts`). Screens say it as the accountant writes it, 2025–26 (২০২৫–২৬), or 2025 alone on a farm whose year begins in January.
- **The Monthly report reads the last twelve months by default, or a financial year the Owner picks** (`/monthly-report?year=2025`). This year is read up to this month and says "so far". A year still to come is refused (`financial_year_not_begun`). The years offered run from this one back to the year of the first taka the Farm's purse moved.
- **The money page's period has "This financial year" and "Last financial year" a press away.** They set the same two dates the Owner could type, so the register, the costs and the accountant's export follow.

**Not a Farm Parameter.** Nobody on a farm changes when its books close. A setting the Owner could change would move every year the farm has already reported, so earlier figures would no longer match the papers the accountant holds. The year therefore describes where the farm is, the way its currency and clock do, and is not a decision about running it.

**Consequences:**

- Every screen that asks "which year?" gets the same answer from one place. Nothing else counts by financial year yet. Figures that read "the last year" elsewhere (a Register's year, the year's early losses at Intake, the year's Dry Periods) still mean the twelve months before today. Each would be its own decision.
- **Revisit** if the accountant closes the farm's books on a date other than 30 June. Then only the default changes.
