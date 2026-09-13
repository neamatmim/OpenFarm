# 50 — The milk Dispatch

**What to build:** The Bulk milk leaves the farm to a buyer, and that hand-over is recorded: when, how many litres, which buyer, the challan number, and the fat and SNF if the processor gave them. It is the farm's milk-buyer record under the Safe Food Act, and the Dispatch record and the production report are generated from it. It was in the spec since increment 1 and never built; the milk sale's money comes from it, so it lands here.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — the Milk data model (`Dispatch`); [Report set](../../openfarm-release-1/assets/report-set.md) — R12 milk dispatch record, R13 milk production; roles matrix — Dispatch; `CONTEXT.md` — **Dispatch**, **Counterparty**.

- [x] A Dispatch records the date, litres, buyer (a Counterparty found by name), challan number, price per litre, and optional fat %, SNF % and note; it is the Manager's to record and the Owner's to read
- [x] Milk sent to Bulk and milk dispatched can be read side by side for a day, so milk that left and milk that was recorded going into the tank are not two stories
- [x] R12, the milk dispatch record, is generated for a period as PDF and CSV with the buyer's name and address; R13, milk production, as CSV by day, session, Pen and Destination with discard under withdrawal shown; each export is an Audit Event
- [x] Tests cover recording a Dispatch, reading it back beside the day's Bulk, both reports' contents, and the roles

## What was built

**A Dispatch** (`milk.dispatch`, the Manager's) records when the milk left, how many litres, the buyer (a
Counterparty found by name, with an address), the challan when the collector writes one, the price per
litre, and the fat and SNF when the processor measured them. A time later than now is refused
(`dispatched_in_the_future`). It can be put right as a Correction with a reason inside the Role's window
(`milk.correctDispatch`). The price is here because ticket 51's milk-sale money needs it, and the
spec's finance table names it as the Dispatch's one extra entry.

**One day, side by side** (`milk.day`, the Owner's and Manager's): the litres the day's Milk Records sent to
Bulk, the litres the Dispatches handed over, and each Dispatch.

**The two reports** (`reports.*`, the Owner's and Manager's, a year at most per report):

- **R12, the milk dispatch record.** A paper headed by the farm, in the language of whoever produces it:
  every Dispatch in the period with the buyer's name and address, the challan, fat and SNF, and the
  total. Also the same as a CSV in plain digits.
- **R13, milk production.** A CSV by farm day, session time, shed, Pen and Destination, with milk poured
  away under a Withdrawal on its own line (`under_withdrawal`), apart from milk poured away by judgement.

Producing either is an Audit Event (`entity: report`, `action: export`) naming the report, the period and
the Registration number. The CSV writer quotes what needs quoting.

**A milk page** (`/milk`) for the Owner and Manager shows:

- **The day:** the tank beside what was handed over, with each Dispatch.
- **The Dispatch form**, for the Manager.
- **The reports:** the dispatch record to print, and both CSVs to save.

The Dispatch entry in the glossary is widened.

**Five tests**, in 2036:

- **A Dispatch recorded:** read beside the day's Bulk from a real milking, in which one cow's milk was
  poured away under a Withdrawal.
- **A correction.**
- **The dispatch record:** its paper with the buyer's name, address and challan, its CSV row with a quoted
  address, and its Export on the trail.
- **The production CSV:** the tank's line and the withheld milk's own line.
- **Roles:** the Owner refused recording, Barn Staff and the Vet refused both the day and the report, and a
  future dispatch refused.

Mutation-checked, each red: withheld milk not shown; no quoting; the address left off the paper; no export
event; a future dispatch accepted; a correction ignoring the litres.

## Left open

- **The page has no correction form.** The route exists; the screen records and reads.
- **The dispatch record's paper is not stamped with the Registration number** where the farm has not
  entered one; the Export event records it either way. The paper uses the farm-of-origin lines every other
  paper uses.
- **R12 and R13 cover a year at most** per export.
