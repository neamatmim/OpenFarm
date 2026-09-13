# 54 — The accountant's export

**What to build:** The farm does not keep books; its accountant does, from what the farm sends. Once a month — or for any period — the Owner or Manager generates every Money Event as CSV, and a PDF summary of income against expense by Category, by Counterparty and by Side. Money the Owner has not approved is in it, and marked so.

**Blocked by:** 51, 52

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user story 80; [Report set](../../openfarm-release-1/assets/report-set.md) — R15 accountant export; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md) (reports); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**.

- [x] The CSV holds every Money Event in the period: date, direction, amount, Category, Counterparty, payment method, the linked record, and whether it is approved
- [x] The PDF summary gives income and expense by Category, by Counterparty and by Side, Bangla by default with English labels, and carries the farm's name, Registration number, when it was generated and by whom
- [x] Generating either is an Audit Event naming the report and the period; it is the Owner's and the Manager's, and online-only
- [x] Tests cover a month with records' and hand-entered Money Events, an unapproved one marked, the totals by Category and Side, and the export on the trail

## What was built

**R15, the accountant's export** (`reports.accountantExport`) is the Owner's and the Manager's, from their own phones, for any period up to a year. Each call is one Export on the trail, naming the report, the format, the period and the Registration number. A farm without its Registration number is refused, as the other papers refuse it.

**The CSV** lists every Money Event of the period, oldest first, one per row. Its columns:
- the farm day, the direction and the amount;
- the Category in Bangla and in English;
- the Counterparty and the payment method;
- the Side (`dairy`, `fattening`, `whole_farm`, or `dairy+fattening` for a Vet visit to both);
- the record kind and its id;
- what the record is known by (a tag, a challan, a Feed Item, a product, the tags the Vet saw, a wage's month);
- whether the Owner has approved it (`not_needed`, `awaiting_approval`, `approved`);
- the note.

It is written through the same CSV writer as the dispatch record: a byte-order mark, CRLF line ends and formula-guarded fields.

**The summary** is a printable paper, headed by the farm and its Registration number, Bangla with English labels, numerals in the producer's language, and stamped with who produced it and when. Printed to A4 through the browser, as every other paper is: none of the farm's papers is a generated PDF. It gives:
- income, expense and net;
- money awaiting the Owner's approval, counted in the totals and said apart, in and out separately;
- in and out by Category, by Counterparty, and by Side (the Dairy side, the Fattening side, and the whole farm).

**Sides, on the day the money moved:**
- Milk sales are the Dairy side's.
- A bought animal is the Fattening side's, as an Intake always is.
- A sold animal is the Side she stood on when she was sold, from her Pen history.
- A Vet Fee is split across the Sides of the animals the Vet named, as ticket 53 charges it.
- Feed and medicine bought for the store are the whole farm's.
- Money entered by hand is the Side it names, or the whole farm.

**Web:** the Money page's "For the accountant" section prints the summary and saves the CSV for the dates the page shows. The CSV saver is now shared with the milk page.

**Three tests** in 2040, covering a month with:
- milk sold;
- a bull bought and later sold, both over the threshold and not approved;
- electricity entered by hand for the Dairy side;
- a wage;
- a Vet visit to the bull and a Dairy cow;
- feed bought for the store.

They check:
- each CSV row, with the unapproved ones marked, the Vet visit on both Sides, and the feed on the whole farm;
- the totals by Category, Counterparty and Side, with what awaits approval in and out apart;
- the paper's heading;
- both formats' Exports on the trail;
- the refusals: no Registration number, Barn Staff, the Vet, and a Shed Phone.

**Mutation-checked, each red:**
- the unapproved not marked;
- a Side dropped, milk not Dairy, an Intake not Fattening, a Vet Fee not split;
- awaiting in and out mixed, or not counted;
- no totals by Side or by Counterparty;
- no Registration check, no Export event, a Shed Phone allowed;
- no English Category;
- a blank for the whole farm.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **An animal's Side is the one she had when the money moved.** Before, it was the Side she has today, so a re-run of an old month could move money between Sides. An Intake is always the Fattening side's, and a Sale takes the Side from the animal's Pen history on the day.
- **A Vet Fee for animals on both Sides is split between them,** so this export's Sides agree with ticket 53's cost report. Before, it all went to the whole farm.
- **Money awaiting approval is said in and out apart,** instead of one sum of both.
- **The CSV** gains the English Category name, and says `whole_farm` instead of leaving the Side blank.
- **The code and wording:**
  - the summary module is `money-summary`, not "accounts", an _Avoid_ word;
  - the paper uses the app's own Bangla for Dairy (দুগ্ধ);
  - the papers' header names the new paper, and its input has a doc comment;
  - the shared `Side`, `MoneyApproval` and `PaymentMethod` types are used;
  - the export has its own web component, not the entry form's file;
  - the procedure builds its result as a constant, with the paper in its own helper.
- **The tests** look for their own Exports rather than the farm's newest, check both formats, and retire the Feed Item they added.
- **The dispatch test (ticket 50) had the same flaw** and failed one full run in three once this file existed. It took the farm's two newest Exports, and this file's 2040 clock makes its own always newer. It now looks for its own.

## Left open

- **Feed and medicine bought for the store count as the whole farm's.** They are the farm's largest costs, so the export's Dairy and Fattening columns show mostly what the records carry directly. Ticket 53's cost report does split feed and medicine by Side, by what was fed and dosed. **Owner question:** should the accountant's export split purchases the same way, or keep cash as it moved?
- **The CSV carries no farm name, Registration number, time or producer inside the file.** The Export event records all four, and a header row would break a spreadsheet. Carrying them in the file name is a small follow-up.
- **The by-Side cost report is still on screen only,** with no CSV of its own.
- **No test sells an animal after she changed Side.** The Side-on-the-day rule is shared with ticket 53's, which was checked there.
