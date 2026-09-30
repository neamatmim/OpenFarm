# 01 — Cash in Hand, and a Handover

**What to build:** Each person who handles the farm's cash has a **Cash in Hand**: what cash Money Events put into
their hand, less what came out of it, moved on by Handovers. The Owner sees each person's figure.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** new **Cash in Hand** and **Handover**; **Money Event** widened.
- [x] **Schema:** `money_event.held_by`; `handover` (from and to each a person or nothing for the bank, amount, when,
      slip, note, recorded by). Migration `20260930124800_cash_in_hand`, both dev databases. **No start day is needed**:
      money booked before this names nobody, and the first Cash Count (02) sets each hand to what is really in it.
- [x] **Entry:** decided in `bookMoney`, so every record's money follows one rule — a new cash Money Event names the
      person writing it where they are the Owner or a Manager; bKash or the bank names nobody; a Correction to bKash
      takes it out; one already cash keeps its hand. A Sale's and a Baki Payment's cash name whoever wrote them.
      **Choosing another hand on the form is left**: the person at the gate writes it, and a Handover puts it right.
- [x] **Handover:** `cash.handOver` — a Manager from their own hand, the Owner any; the bank needs its slip
      (`bank_needs_a_slip`); only an Owner or Manager holds cash (`holds_no_cash`); not a hand to itself.
- [x] **Screen:** a "হাতে নগদ / Cash in hand" tab on the money page — each hand and what it holds, the Hand-over dialog,
      and each hand's own list on a tap; the register names "…-এর হাতে". Only the Farm's purse: a Venture's money
      moves through its account.
- [x] **Tests:** `routers/cash-in-hand.test.ts` (6) — the hand of whoever took the notes, never bKash; cash paid out of
      the hand; a Handover moves it; the bank's slip; the Owner's to read and move for anybody else; a Correction to
      bKash. **Proved by switching off** own-hand-only, the slip, and the cash-only rule (the write alone, with a check
      that bKash names nobody, and together with the read's) — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): ৳5,000 of manure sold for cash by the Owner put ৳৫,০০০ in the Owner's
      hand; a Handover of ৳2,000 to the Manager "সপ্তাহের বাজারের টাকা" left ৳৩,০০০ and ৳২,০০০, and the Owner's list read
      "রফিকুল ইসলাম-কে দেওয়া … − ৳২,০০০". The seed now holds both.
