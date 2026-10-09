# 06 — The Farm's month on paper

**What to build:** The month's page prints: a `PaperDocument` on the Farm Identity letterhead, read in Bangla or English (ADR 0021),
through `PaperDialog`, recorded as an **Export** (`monthly_report`, the month, `paper`), refused without the Registration
number.

**Blocked by:** 05

**Status:** done

- [ ] A domain layout of the Farm's month as a `PaperDocument`: facts and tables, two columns, the closing lines.
- [ ] `monthlyReport.monthPaper({ month })` lays it out and records the Export; `assertRegistered` first.
- [ ] A new `monthly_report` report in `export-store.ts`.
- [ ] Print on the page through `PaperDialog`, the language switch included.
- [ ] Tests: `paperText` in both languages names every part; the Export written with the month; refused without the
      Registration number; Bangla numerals in Bangla ([[bangla-numerals-in-bangla-sentences]]).
- [ ] Printed in the browser (clone into an overlay to look: [[printing-freezes-the-browser-tools]]).
