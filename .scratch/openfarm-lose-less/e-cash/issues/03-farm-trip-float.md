# 03 — A Float for the Farm's own Buying Trip

**What to build:** Cash handed to the Manager for one of the Farm's own Buying Trips, reconciled when they come back
against the animals bought, the trip's costs and the cash brought back — as a Venture's Buying Float is.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Buying Float** widened with the Farm's own.
- [x] **Draw:** a Handover naming one of the Farm's own outings is its float going out (`handover.buying_trip_id`,
      `float` "out"/"back") — from any hand to a person, refused on an outing a Venture's Float went on
      (`trip_is_another_ventures`) or already counted home (`float_already_reconciled`); a Venture's `drawFloat` is
      refused on an outing the Farm floated (`float_already_drawn`). One purse to an outing.
- [x] **Reconcile:** `cash.countFloatHome` (the Owner's alone): handed out = the Farm's animals + their Hasil + the
      outing's costs (`whatTheFloatBought`, widened to the Farm) + the cash back, to the taka; refused `float_short` /
      `float_over` with the gap; the cash back goes from the carrier's hand to the Owner's, and
      `buying_trip.float_reconciled_at/by` closes it.
- [x] **Screen:** the Hand-over dialog asks "হাটে কেনার যাত্রার টাকা" (the Farm's own outings); the cash tab lists floats
      still out — who carries it, out, bought, to come back — with the Owner's "মিলিয়ে নিন".
- [x] **Tests:** `routers/farm-trip-float.test.ts` (5) — open and bought against animals, Hasil and costs; short and over
      refused with the gap; the Owner's alone; balanced, the cash back in the Owner's hand and the carrier's empty; no
      more float once home. **Proved by switching off** the balance, the cash back, the reconciled refusal and the
      Owner's gate — each red.
- [x] **Somebody opens it** (seed, 2026-09-30): ৳1,00,000 drawn from the bank into the Owner's hand, handed to the Manager
      for "গাবতলী হাট (সিড দেখা)", a bull of ৳60,000 + ৳600 Hasil and a ৳3,000 lorry on it — the list read "রফিকুল
      ইসলাম-এর কাছে: দেওয়া ৳১,০০,০০০, কেনা ৳৬৩,৬০০, ফেরত আসার কথা ৳৩৬,৪০০"; counted home with ৳36,400, the float left
      the list and the cash moved to the Owner. (The bull was written as the Owner, so its cash left the Owner's hand —
      at the haat the Manager writes it.) The seed holds all of it.

**Not tested:** the refusals across purses (a Farm float on a Venture-floated outing, and the reverse) — a Venture Float
needs a funded Venture Account to draw; the checks sit where the Venture's own do.
