# OpenFarm Release 2 — what it is for, and when it is done

Written 2026-10-09, before Release 1 has been declared done (see [go-live](../openfarm-go-live/README.md)). This
is not a plan yet: it names what Release 2 is likely to hold and what finishes it, so that the 30 days on the real
farm are read against something. The plan is written **after** the 30 days, from this and from the paper list the
Manager keeps (go-live, step 6).

## Where Release 1 left off

Release 1 is a 360k-line system with no production day yet. Every survey since mid-September has found less than the
one before. The remaining improvements worth making before the farm is on it were made or recorded on 2026-10-09:

- The server tells the Owner when it is failing (`server_failing` Notice), and the journal is kept three months.
- The sign-in limit per address is the office's, not one person's; a guessed account is still slowed on its own.
- The database leftovers listed by the health survey (RESTRICT, CHECKs, version-pointer FKs, VALIDATE CONSTRAINT)
  turned out to be done in the database architecture review of 2026-10-05. **Left on purpose:** `feeding.lines` stays
  jsonb (`feeding_line` table), typed on the way in; it is a day's refactor for no gain a farm would see.
- The Coach Overlay is in `CONTEXT.md` and the Release 1 map (issue 26) and has no code. Decide at the end of the 30
  days whether first-run hints were missed; build it then, or strike the term.

Watch, do not pre-empt (each is measured or bounded, and the right answer depends on real data):

- Costs rebuilt from the whole history on any write (Y5–Y7 of the year-on survey).
- Version skew: `CACHE_SHAPE` is hand-bumped, queued offline entries carry no version, no reload prompt on a new build.
  Runbook rule until then: deploy after the evening sync and before the morning one.
- Audit trail shows the latest 100 narrowed by filter; no paging back.
- Photographs as base64 text in every nightly dump; a Venture statement loads every full-size photo.
- Two indexes: `animal_move (farm_id, to_pen_id)`, `treatment (farm_id, given_at)`.
- Owner's choices waiting on a real case: D9 one transfer paying two debts; D7 a course written from the animal page;
  C5 an unplaced herd cost.
- No browser test. One Playwright smoke (sign in → PIN switch → record a milking offline → reconnect → sync) covers
  the Outbox, the service worker and the Shed Phone, which have no test.

## Candidates

**Likely whatever the 30 days show** — deferred from Release 1 with their foundations built:

1. **Eid batch sale.** One sale, several animals, one buyer, one receipt and one transport card. The Selling Trip
   already groups animals and splits costs; a Sale is still one animal (map line 81). Deadline: Eid-ul-Adha 2027.
2. **Trend charts.** A cow's lactation curve, an animal's gain, a month against the months before. All the figures are
   recorded; three hand-drawn charts exist (`milk-week`, `by-month`, portal `weight-line`). Spec: out of scope for R1,
   named for R2.
3. **Weighing hardware.** Girth tape first, recorded as an estimate (`WEIGH_METHODS` plans it), then a scale feed.
   Hardware feeds are the spec's own R2 item.
4. **Breeding calendar and straw stock.** The heat-watch list and the pregnancy check exist; a calendar is the Manager's
   view of them. Semen is a text field on a Service today.

**Decided by the 30 days:**

5. **Staff notifications and a training mode.** Only "your work was sent back" reaches a worker now. If staff went back
   to paper, this is the first place to look — and where the Coach Overlay belongs.
6. **External access.** Time-limited auditor login, accountant portal, buyer link (issue 15). Build if the printed
   registers and CSVs fall short at the DLS renewal or the accountant's close.
7. **Forecasting.** Days of feed exists; a cash forecast does not. Build if the monthly report's cash flow leaves the
   Owner asking "and next month?".

**Not Release 2:** portal payments and a rate a year (the advisers said no; ADR 0012, 0018); a second farm or the
product (one person maintains this; a year of one farm first); WhatsApp.

## Definition of done (draft)

Release 2 is done when, on the real farm:

- the first Eid after it ships is sold as batches, each with one receipt and one transport card;
- every milking cow's lactation and every fattening animal's gain can be seen as a line, not a list;
- no weight is typed from a scale's display by hand;
- the Manager plans a month's breeding from a calendar in the app;
- whatever the paper list of the 30 days named is either built or struck with a reason written here.

Each line is a check somebody can make on the farm, as Release 1's were (26 SOPs running, DLS declared, restore drill
passed, 30 paper-free days).
