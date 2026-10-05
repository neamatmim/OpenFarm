# 05 — Seeded, and opened

**What to build:** Seed data that puts every state on screen, and both sides opened in a browser.

**Blocked by:** 03, 04

**Status:** done (2026-10-05)

- [x] **Seed** (through the real procedures, so a rule the seed breaks stops the run): the switch on; on the monthly
      Venture, one note waiting (bKash, with a photo), one received (its capital recorded from it), one not found with
      the Owner's line; on an open Venture, one withdrawn.
- [x] **Open the pages** on the seed server: the Owner's Investors tab, the take-capital sheet filled from a note,
      the notice; the Investor's How to pay, the sheet, the cards in each state, at phone width too. Stop the seed
      server before reseeding.
- [x] **Migrate** `OpenFarm` and `openfarm_seed`; the switch stays **off** on the Owner's own farm — theirs to turn on
      once the advisers answer.

**As built:** `seed/ventures.ts` `tellOfMoneySent` on the monthly Venture: switch on, both Investors let in; next month's sum
told early and recorded from the note (received), the same note sent twice and withdrawn, the missed month told by
bKash and answered not found, then told again with `seed/slip-photo.ts` (waiting). The monthly Venture now has its Venture Account written. Opened on the seed server: the Owner's
section, Record it (sheet filled from the note), the slip dialog, the alert and its link; the Investor's How to pay,
cards and sheet; the Owner's Portal Preview, every act dimmed with whose it is.

Found while there: paying a Monthly Sum ahead still read "next: 10 October" — `sumsStandingOf` named the next 10th,
not the next sum unpaid. Fixed in the domain with a test that went red first.
