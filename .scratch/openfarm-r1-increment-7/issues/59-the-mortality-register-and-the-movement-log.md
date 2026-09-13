# 59 — The mortality register and the movement log

**What to build:** Every death on the farm — the animal, the date, the cause, how the carcass was disposed of, and the DLS report reference when the disease was notifiable — as the mortality register (R6). A stillborn calf is on it: her calving writes her death with the cause "stillbirth", and the Manager adds the disposal afterwards, the register showing it as awaiting until then (the Owner's decision, 2026-09-13). And every movement of an animal in a period — Moves between Pens, Side changes, intakes, sales and deaths — as the movement log (R11) CSV an inspector asks for.

**Blocked by:** 56

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R6, R11; ticket 46's question about stillbirths; `CONTEXT.md` — **Mortality**, **Move**, **Intake**, **Sale**, **Calving**.

- [x] A stillbirth records the calf's death with cause "stillbirth" and no disposal yet; the Manager records the disposal later; the register marks a death awaiting its disposal
- [x] R6 lists deaths in a window: animal, date, cause, disposal method, DLS report reference if notifiable — in the Inspector View, as paper and CSV, each an Export
- [x] R11 lists, for a period, every Move, Side change, intake, sale and death in time order, with the animal, from and to, and who recorded it — as CSV, an Export
- [x] Tests cover a death with its notifiable reference, a stillbirth awaiting and then given its disposal, the movement log's kinds in order, and the Exports

## What was built

**A stillbirth on the register.** A calf's Calving recording her born dead now writes her death as well as her exit:
- **the record:** kind died, cause `stillbirth` (the domain's `STILLBIRTH`, put into the reader's words on every paper and screen), and no disposal — the column is optional now;
- **when she arrived:** her first Move is dated by the hour she was born;
- **a corrected hour:** both her arrival and her death move with it;
- **found stillborn later:** a calf corrected to stillborn is recorded the same way, unless she has since left or been walked to another Pen;
- **already recorded:** the migration puts calves recorded stillborn before this change on the register, and dates every calf's arrival by her birth.

**The disposal afterwards.** `animals.recordDisposal` is the Owner's and the Manager's, audited, and writes an awaited disposal once. The check sits inside the transaction, so a second write is refused with `disposal_already_recorded`, and a disposal already written is put right by a Correction.
- **Her page:** it shows the disposal as awaiting, with a form to write it.
- **Corrections:** the correction form no longer sends a disposal nobody chose.

**R6, `inspector.mortalities`:**
- **what it lists:** every death and cull in a period (a year to today unless asked) — tag, day, kind, cause, disposal or awaiting, the note, and the DLS reference for a death attributed to a notifiable Diagnosis whose report was delivered and stands;
- **print:** prints (`mortalityRegister`, a line to each field, a stillbirth and an awaiting disposal worded for the reader) and saves as CSV (`tag,date,kind,cause,disposal,disposal_note,dls_reference`, `awaiting` for a disposal still to come);
- **Exports:** each is an Export keeping its period, the deaths, and how many await a disposal.

**R11, `inspector.movementLog`,** returns the CSV (`when,tag,kind,from,to,recorded_by`, in the farm's own date and time) and records its Export. It refuses a farm without its Registration number. It lists, in time order:
- **calving:** a calf coming into her mother's Pen;
- **intake:** from the seller;
- **move:** between Pens;
- **side_change:** naming the Side at both ends;
- **sale:** from her Pen to the destination;
- **died or culled:** from her Pen.

Registering an animal is not a movement: she was already there. Two lines at one instant for the same animal go in arrival-to-exit order, so a stillborn calf is born before she dies.

**The screen:** the Inspector View gains the mortality register (Print, CSV) and a Movement log (CSV) button that uses the same period.

**Four tests** in 2046 (`mortality-register.test.ts`), over a February with:
- a heifer registered and moved;
- a bull calf changing Side and later culled;
- a bull bought in and sold;
- the heifer's anthrax reported and her death;
- a stillborn calf whose calving hour is then corrected.

What they check:
- **R6:** exact rows (death with reference, cull, stillbirth awaiting); the year's default; the awaiting CSV line; the paper's lines for both deaths.
- **The disposal afterwards:** Barn Staff refused; the Manager writes it; a second write refused; the register shows it; the CSV row; the Exports.
- **R11:** every line of the file's animals, in order and exact, with the corrected hour on both of the calf's lines; its Export.
- **Roles:** Barn Staff refused both registers.

**Mutation-checked, each red:**
- **the stillbirth:** its death not written, or dated when written rather than when born;
- **a corrected hour:** the arrival or the death not moved;
- **the movement log's kinds:** registrations let in; intakes, Side changes or deaths lost; Sides left off a Side change; the same-instant order reversed;
- **R6:** the reference dropped; the stillbirth not worded; `awaiting` left out of the CSV; the year's default a day off;
- **the disposal:** a second write not refused, or open to Barn Staff;
- **Exports:** the movement log's Export not recorded.

Two mutations survived:
- **A calf's arrival dated at recording:** the test's hour correction re-dates her either way.
- **The same-instant order removed:** concatenation already puts Moves before deaths; reversing it is caught.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Births in the wrong period:** a calf's arrival was picked by when her calving was written and stamped with when she was born, so February's log could hold her death but not her birth. Her first Move is now dated by her birth and follows a corrected hour, as her death does — by animal, not by cause, so a corrected cause no longer strands it.
- **Registration as a movement:** importing the opening register would have put the whole herd in the log on go-live day. Only calvings and intakes arrive.
- **Vocabulary:** "birth" (avoided under Calving) and "arrival" (avoided under Intake) are `calving` and `intake`. A Side change names the Sides, and the Inspector View's glossary entry names the movement log.
- **A disposal nobody chose:** the correction form defaulted to "buried" and always sent it, so fixing an awaiting stillbirth's cause wrote a disposal. It now sends one only when chosen.
- **A walked calf found stillborn:** she can no longer be. She is treated like a calf who has left: nothing changes, and a person is asked.
- **Stillbirths already recorded:** the migration now puts them on the register.
- **Orphaned doc comments:**
  - two in the look-back constants, which inserting `PeriodReport` had left stacked;
  - `STILLBIRTH`, which had split `MORTALITY_KINDS` from its type.
- **Shared code:**
  - the mortality lookup is shared by `recordDisposal` and `correctMortality`;
  - the web's stillbirth and disposal words are one helper;
  - a sale's and a death's log lines share one shape;
  - the movement kinds reuse `MORTALITY_KINDS`.
- **Ordering:** R6 and R11 are in R-number order in the router, the papers, the domain's exports and the paper ids.

## Left open

- **A stillbirth's death records no Role used.** A Calving Step's effect knows who recorded it but not under which Role; the Completion's Audit Event has it.
- **The movement log keeps calvings,** which R11 does not list ("Moves incl. side changes, intakes, sales, deaths"), so a stillborn calf's death has a line to begin from. Leaving them out is a one-line change if the Owner prefers.
- **An older lint error:** `herd-store.ts` has a `no-use-before-define` error in `recordMove`, from before this ticket, shown now that the file was linted. Left alone.
