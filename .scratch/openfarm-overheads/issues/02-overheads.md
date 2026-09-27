# 02 — Overheads, per head per day

**What to build:** Costs by Side and Month by month show what the place cost in the period — the **Overhead**, by Category — and what that comes to per head per day over every day an Animal stood on the farm.

**Blocked by:** —

**Status:** done

- [ ] **Domain `headDaysIn(history, range)`**: every Pen History line's days inside the range, added up. **`overheadsOver`**: the total, the lines by Category (largest first, ties by name), head-days, and per head per day (none when no animal stood). Tests: an animal who arrived mid-period, one who left, a period nobody stood in.
- [ ] **What counts:** a Money Event in the Farm's purse, entered by hand, money going out, that is not a Herd Cost. A Venture's purse never counts, and neither does a record's money (feed, medicine, cattle) or money coming in (dung).
- [ ] **`costs.bySide`** gains `overheads`; the Costs tab shows it as its own panel under the Sides. It says the figure is not charged to any animal, Season or Venture.
- [ ] **Month by month:** each month and the year gain the overhead and its per head per day. The year is worked over the whole year, not averaged from its months.
- [ ] **Test** that a Herd Cost, a Venture's money, and money a record booked are left out, and that a Venture's animals count in the head-days.
- [ ] **Somebody opens it:** the Costs tab and Month by month, in both languages.
