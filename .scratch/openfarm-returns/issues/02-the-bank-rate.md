# 02 — The Bank Rate

**What to build:** The Owner types a **Bank Rate** with a note, dated from the day it is typed, and every finished rate a year shows the one in force on its first taka as a plain line, and as a mark on the chart.

**Blocked by:** 01

**Status:** done

**Note from 01 (2026-09-27):** 01 built the page without tabs (a chart, then the finished Seasons and Ventures), leaving out empty Dairy and Prices tabs rather than showing dead ends. Whichever of 02 and 03 lands first builds the tab bar: Fattening (01's content), and Prices here.

**Spec:** user stories 24–26, 34 (the mark), 35 (Prices tab: the Bank Rate). See "The Bank Rate and the floor".

- [ ] **`bank_rate`** table as the spec lays it out; never edited. Migration applied to both dev databases.
- [ ] **`returns.setBankRate({ perYear, note, fromDay })`**, Owner-only, audited; refuses outside 0–100.
- [ ] **In force on a day**: latest `from_day` on or before it, ties by `recorded_at` then `id`. A test records two on one day in one transaction.
- [ ] **Each finished Season and Venture** carries the rate in force on its earliest spent day, null under the floor. Test a Season whose first taka fell before the second rate reads the first.
- [ ] **The page:** the line «ব্যাংকের হার, বছরে: … — note» under each finished rate a year; the chart's dashed mark; the Prices tab with the history and a form. No line while none is typed.
- [ ] **The seed** gains one Bank Rate.
- [ ] **Somebody opens it:** the Prices tab, a finished row, the chart, in both languages.
