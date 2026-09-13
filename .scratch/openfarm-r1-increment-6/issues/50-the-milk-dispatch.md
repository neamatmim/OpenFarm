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

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **The form has a time field** (empty means now), plus the buyer's phone and a note. It used to stamp
  every Dispatch with the moment Save was pressed.
- **Correcting a Dispatch is the Manager's only.** The roles table gives the Owner read access, and
  `correctDispatch` had let the Owner in.
- **A Correction can clear a field.** A challan, note, fat or SNF sent as nothing is cleared; a field left
  out stays as it was. Before, it was silently kept.
- **A Correction to a later time is refused**, as recording one is.
- **The buyer's name and address are kept on the Dispatch** as they stood that day. A reprinted record
  says what the farm could have shown then, not the Counterparty's address today.
- **The dispatch record is refused** to a farm without its Registration number
  (`farm_identity_incomplete`, as the transport card is). A period that ends before it begins is refused
  as `period_backwards`, where before it failed validation with no word for the screen.
- **Both reports come only from a person's own phone**, not a Shed Phone.
- **Each call is one Export.** The dispatch record takes a `format` (`paper` or `csv`), and each Export
  is its own entity on the trail. One call used to build both formats and log one event, and the same
  period exported twice shared an entity id.
- **The CSVs are safer to open:**
  - a byte-order mark, so Excel opens Bangla as Bangla;
  - CRLF line ends;
  - figures at two places;
  - a field a spreadsheet would run as a formula (`=`, `+`, `-`, `@`) written as words;
  - the dispatch record gains a `time` column.
- **হস্তান্তর replaces সরবরাহ** on the paper and the buttons.
- **Duplicated helpers are now shared:**
  - the farm-day range, as `farmDaysBetween` in the farm clock;
  - the reader's language, shared with the papers router;
  - the dispatched total.
  - The paper's period dates now come from the farm clock rather than a hard-coded `+06:00`.
- **The paper shows a fat or SNF of 0**, which a truthiness check had hidden.
- **The web page:** the report buttons wait while a report is being made, the CSV's download link is let go
  a moment later rather than at once, and the new refusals are worded in both languages.
- **The test file cleans up:** the held cow's Withdrawal is lifted afterwards, and the farm's Registration
  number is set rather than assumed. It is set as the Manager and only when missing. The first version wrote
  it as the Owner, and in two full runs of three the identity file, which looks in the farm's trail for the
  Manager's write of that number, found the Owner's instead.

**Eight tests now.** New:

- a correction clearing the challan, SNF and note, with the buyer's address kept on the Dispatch;
- the Owner refused a correction;
- the paper and the CSV as two Exports, each with the Registration number;
- the Registration refusal and a backwards period;
- a formula-like buyer and challan written as words;
- a Shed Phone refused;
- a correction to a later time refused.

Mutation-checked, each red:

- a cleared challan kept;
- the Owner allowed to correct;
- the Shed Phone guard removed;
- the Registration refusal removed;
- a backwards period accepted;
- no formula guard;
- no byte-order mark;
- one entity per period;
- a correction to a later time accepted.

## Left open

- **The page has no correction form.** The route exists; the screen records and reads.
- **The buyer's address on a Dispatch is the Counterparty's**, which keeps the first address the farm
  was given. One said differently at the gate later is not what the record shows.
- **No test changes the Counterparty after a Dispatch.** Nothing yet edits a Counterparty's address, so
  the snapshot is not yet proven against one that moved.
- **R12 and R13 cover a year at most** per export.
