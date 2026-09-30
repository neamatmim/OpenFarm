# 04 — A Wage Draw, taken off at payday

**What to build:** Money a staff member takes ahead of payday is a **Wage Draw** with a balance; the month's wage entry
takes the balance off, so nobody is paid twice.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** new **Wage Draw** ("Advance" is the Venture's word).
- [x] **Record:** `money.drawWage` (Owner or Manager) — a person (Counterparty), amount, day, how paid, a note; a
      `wage_draw` row and its own Money Event out under **Wages** (source `wage_draw`), so the month's wages count the
      money the day it went and a cash draw leaves the recorder's hand.
- [x] **Payday:** a wage entry (a `wageMonth`) takes the person's open draws, oldest first, up to the wage
      (`drawsToTake`), books only what is paid now, and writes each part taken (`wage_draw_taken`). A draw bigger than
      the wage carries over: the wage books ৳0 and the rest waits for the next. A wage that took draws is refused a
      correction to its amount, person or month (`wage_took_draws`) — its takings would not follow.
- [x] **Screen:** a "বেতনের অগ্রিম" tab on the money page — each person's open draws, most owed first, with
      "অগ্রিম লিখুন"; the wage entry sheet shows "অগ্রিম বাকি …: এই বেতন থেকে কাটা …, এখন দেওয়া …" and what carries over.
- [x] **Tests:** `routers/wage-draw.test.ts` (4) — two draws out under Wages and owed; a wage takes them and books the
      rest; a draw bigger than the wage carries to the next; the wage's amount stands. **Proved by switching off** the
      taking, the up-to-the-wage limit, the Wages category and the correction guard — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): a ৳3,000 draw for "আলমগীর (সিড দেখা)" listed on the tab; the wage sheet
      at ৳8,000 read "অগ্রিম বাকি ৳৩,০০০: এই বেতন থেকে কাটা ৳৩,০০০, এখন দেওয়া ৳৫,০০০।", at ৳2,000 it added "৳১,০০০ পরের
      বেতনে যাবে।"; saved for September, the wage booked ৳5,000 and the tab emptied.

**Draw correction** (added 2026-09-30, at the Owner's asking): `money.correctDraw` (Owner or Manager, the Correction
Window as any record) puts right the amount, the person, the day, how it was paid and the note — its Money Event rebooked
with it, never a second one. Put to ৳0, a draw that never happened is taken back. What a payday has taken stays taken:
refused below it, and refused a new person once any is taken (`draw_already_taken`, with `takenBdt`). Behind the Farm
lock, which a payday's `drawsToTake` now takes too. On each draw in the tab, and on a draw's line in the register (there
without the note, which the Money Event does not hold). Tests: 3 more in `wage-draw.test.ts`; **proved by switching
off** the below-taken refusal, the person refusal and the money rebooking — each red. The lock is not tested (two
requests at once).

**Not built:** a wage entered without its month takes no draws.
