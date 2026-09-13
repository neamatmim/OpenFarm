# 57 — The treatment register and the disease history

**What to build:** What an inspector and a slaughter vet ask about first: every treatment of the last thirty days, with the prescription behind it and when the milk and meat are clear, and every diagnosis of the last six months with the notifiable ones marked. The treatment register (R4) follows the DLS guideline's 11-field template in its column order; the disease history (R5) lists diagnoses by date and animal with their outcomes. Either can cover any window. Both join the Inspector View; R4 prints and exports as CSV, R5 prints.

**Blocked by:** 56

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R4, R5; [Health model](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md); `CONTEXT.md` — **Treatment**, **Prescription**, **Diagnosis**, **Withdrawal**, **Notifiable Disease**.

- [x] R4 lists, per animal and dose in a window (30 days by default): date, diagnosis, drug, dose, route, who gave it, the prescribing Vet, milk and meat withdrawal end — in the DLS template's order; campaign doses appear with no diagnosis or prescriber
- [x] R5 lists diagnoses in a window (6 months by default) by date and animal, notifiable ones marked with their DLS report reference, and each animal's outcome since
- [x] Both in the Inspector View; R4 as paper and CSV, R5 as paper; each an Export
- [x] Tests cover a prescribed course and a campaign dose on R4, the window's edges, a notifiable diagnosis and an outcome on R5, and the Exports

## What was built

**`inspector.treatments`** (R4) and **`inspector.diseases`** (R5) are the Owner's and the Manager's, from their own phones. Each takes an optional period and returns it with its rows:
- **no period asked:** thirty days of treatments or six months of diagnoses, ending today, both counting their last day;
- **only the last day asked:** the look-back ends there;
- **refusals:** a period that runs backwards or is longer than a year, as every report is.

**R4 rows** are every dose given in the period, oldest first:
- the date and tag;
- the diagnosis, drug, dose and route;
- which dose of the course it was (`1/4` for the first dose of a twice-a-day, two-day course);
- who gave it and the prescribing Vet;
- the day the milk and the meat were clear of that dose.

A campaign's dose, which nobody prescribed, has no diagnosis, dose, route, course or prescriber. Doses owed but never given are not listed.

**R5 rows** are every diagnosis in the period:
- the date, tag, disease and Vet;
- whether it is notifiable, with the reference the letter was delivered under;
- what became of the animal since: on the farm, or sold, died or culled and when.

A report withdrawn because a Correction took the disease off the list is not marked. A delivered one stays marked: the letter went.

**`inspector.print`** now takes the period and a format:
- **R4:** prints as a paper, or saves as a CSV (`date,tag,diagnosis,drug,dose,route,course,given_by,prescribed_by,milk_withdrawal_ends,meat_withdrawal_ends`);
- **R5:** prints, and a CSV is refused with `register_has_no_csv`;
- every print or CSV is an Export, stamped with its period through `recordExport`'s own argument, its format, and how many doses, diagnoses and notifiable ones it listed.

**Papers** (domain): `treatmentRegister` and `diseaseHistory`. The paper gives R4 a line per field, in the CSV's order. Days are written in the reader's language, and routes and outcomes in both languages. `REGISTERS_WITH_CSV` and `HealthRegister` sit beside `INSPECTOR_REGISTERS`.

**The screen:** the Inspector View gains a from/to period and both registers. R4 shows the route, the giver, the prescriber and both clear days; a Print and a CSV button save `treatment-register-<from>-<to>.csv`. R5 has a Print button. A refused period is worded on the screen.

**Five tests** in 2044, in `inspector-registers.test.ts`:
- **R4 rows:** a prescribed course's first dose and a campaign dose, exactly; the thirty-day default; a period asked only by its last day (a leap-year February).
- **Period edges:** the first and last day taken whole on both registers; a backwards period refused.
- **R4 paper and CSV:**
  - the paper's lines in order, with days, route and clear days;
  - the CSV header and both rows exactly;
  - both formats recorded as Exports.
- **R5:**
  - rows with a notifiable diagnosis delivered under its reference and the animal's death, a plain one, and one whose report a Correction withdrew;
  - the six-month default, and a short month ending the look-back;
  - the paper;
  - the refused CSV;
  - the Export and its period.
- **Refusals:** Barn Staff refused.

**Mutation-checked, each red:**
- **course arithmetic:** days without times;
- **withdrawal:** a withdrawn report still marked; milk days for meat; the prescriber dropped;
- **defaults and edges:** either look-back a day long; a month-end not clamped; the look-back measured from today when a last day was asked; an asked first day ignored; an exit's date on the wrong outcome;
- **CSV and Exports:** a CSV allowed for R5; no CSV made; the format or period left off the Export;
- **the paper:** the notifiable mark, the course line, route, clear days or diagnosis days left unwritten.

One mutation survived: dropping the store's `givenAt` null guard. It is equivalent, because the query's date range already excludes doses never given.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Default periods were a day long:** 2044-03-11 to 04-10 is thirty-one days. Both defaults now count their last day, as the buyer's withdrawal summary does.
- **A period asked only by its last day** kept today's look-back and was refused as backwards. The look-back now ends on the asked day.
- **Month ends:** six months back from 31 August spilled into March. A month too short for the day now ends it.
- **Paper and CSV order:** the paper put the drug before the diagnosis and shared lines for dose and route and for milk and meat. It now has a line per field, in the CSV's order.
- **The Export's period** went in the extra facts rather than `recordExport`'s period argument, as the reports do.
- **"Window" is the glossary's Target, AI and Correction Window.** A from–to range here is a period, as in the reports: `askedPeriodInput` builds on `periodInput`; `lookBackFrom` and `registerPeriod`; the screen's words.
- **Types:**
  - `HealthRegister` is one domain type instead of three literal unions;
  - both store lines derive from the domain's paper lines;
  - the outcome uses `ExitState` and no longer returns an unused State;
  - `PAPERS` is typed once, so the registers that take no period don't declare one, and `print` has no dead branch.
- **Screen:**
  - rows keyed by the dose's and the diagnosis's ids, not array indices;
  - the CSV label translated;
  - the route, the giver and the prescriber shown as the paper shows them.
- **Tests:** the disease history's Export, a period asked by its last day, and the month-end.
- **The full runs found a cross-file flake:** the disease history printed in English in two runs of three. Other files set the Owner's and the Manager's language, so each print test now sets its producer's to Bangla first.

## Left open

- **The DLS template's eleven fields are not written down in the repo.** The report set names nine, counting milk and meat separately. Tag and course make eleven here, and course may not be one of the DLS's own. It needs checking against the guideline itself, and the Owner is best placed to get it.
- **Each dose's clear days ignore a Vet's shortening.** They are what that dose alone held her for, as on the Animal Passport. The animal's current hold, shortened or not, is on the passport and the withdrawal summary, not on R4.
- **A period is refused past a year,** as every report is, so "any window" means any window of up to a year.
- **Duplicates the review named but left alone:**
  - `daySaid` repeats the reports router's day formatting;
  - the per-dose clear day repeats the passport's;
  - the farm lines, period and producer travel together through every paper, as they already did.
