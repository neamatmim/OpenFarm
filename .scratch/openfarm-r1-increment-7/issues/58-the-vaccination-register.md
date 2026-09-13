# 58 — The vaccination register

**What to build:** Which animals were vaccinated against what, when, from which batch, and by whom — the register an inspector reads for FMD and anthrax. A product on the Drug List can be marked as a vaccine. A vaccination campaign asks the vaccinator for the batch once for the Pen's run, and it applies to every dose in that run; a dose from a different batch can say so on that animal (the Owner's decision, 2026-09-13). The vaccination register (R3) lists every vaccine dose in a window in the DLS guideline's order, joins the Inspector View, and prints and exports as CSV.

**Blocked by:** 56

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user story 96; [Report set](../../openfarm-release-1/assets/report-set.md) — R3; [Health model](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) (campaigns); `CONTEXT.md` — **Drug List**, **Campaign**, **Treatment**.

- [x] The Vet marks a Drug List product as a vaccine
- [x] A campaign with a vaccine records the batch once for its run, applied to every dose; one animal's dose can carry its own batch; a Correction can put a batch right
- [x] R3 lists per animal: vaccine, date, batch, who gave it — in the DLS guideline's order, for any window
- [x] In the Inspector View, as paper and CSV, each an Export
- [x] Tests cover a campaign run's batch, one animal's own batch, a corrected batch, a non-vaccine dose left off, and the Export

## What was built

**The Vet marks a Vaccine.** `drugs.markVaccine` is the Vet's alone, from their own phone and audited, as the withdrawal days are. The Drug List shows the mark, and the Vet has a button to set or clear it.

**A Campaign's Lot Number.** The glossary's Batch is an Outbox send, so the vial's number is a **Lot Number** (`CONTEXT.md` gains **Vaccine** and **Lot Number**).
- **Asked once:** a Step with the new `lot_number` effect asks for it once for the Pen, as a required note, and writes a `campaign_lot_number` row for the Instance. A Correction to that Step rewrites the row.
- **A dose's own:** at a vaccine's campaign dose, the Step's note is that animal's own Lot Number, kept on the Treatment. A Correction to the dose puts it right.
- **Reading it:** the register takes a dose's own Lot Number, or else its Campaign's, so correcting the Campaign's corrects every dose that has none of its own.
- **A dose with neither:** refused with `lot_number_missing`.
- **Can't be taken back:** a Step done once can't be skipped, and its note is required.
- **Publish rules:** a Lot Number Step that repeats per animal, comes after the dose Step, appears twice, or sits in a procedure that doses no Pen is refused at publish.

**The SOP editor:** the `lot_number` effect is offered, fitted with a required note, once for the Pen. Choosing a vaccine as a Campaign's product gives the dose Step an optional note for her own Lot Number.

**R3, `inspector.vaccinations`,** is the Owner's and the Manager's, from their own phones:
- **what it lists:** every dose of a Vaccine given in a period (a year to today unless asked, today counted), per animal — tag, vaccine, date, Lot Number, who gave it;
- **print:** prints (`vaccinationRegister` in the domain, a line to each field) and saves as CSV (`tag,vaccine,date,lot_number,given_by`);
- **Exports:** each print or CSV is an Export, keeping its period, how many doses it listed and how many had no Lot Number.

The Inspector View shows it above the treatment register. The three health registers now share one section on the screen.

**Five tests** in 2045 (`vaccinations.test.ts`):
- **Marking:** the Manager refused; the Vet marks the FMD vaccine, and the wormer stays unmarked.
- **An FMD Campaign over three cows:**
  - the first dose, with no Lot Number yet, is refused;
  - the Campaign's Lot Number is given, and one cow has her own;
  - the Campaign's is corrected, a skip of it refused, and the third cow corrected to her own;
  - a wormer given to the first cow is left off;
  - the register shows exactly the corrected Campaign's, the second's own and the third's corrected own;
  - the default period is a year.
- **Paper and CSV:** the paper's lines, the CSV header and row, and both recorded as Exports.
- **Publish refusals:** a Lot Number Step that repeats per animal, comes after the dose, or appears twice.
- **Roles:** Barn Staff refused.

**Mutation-checked, each red:**
- **the dose check:** no refusal without a Lot Number; a dose's own Lot Number not rewritten on Correction;
- **the Campaign's Lot Number:** not rewritten on Correction, or the effect not wired;
- **the register:** non-vaccines listed; the dose's own or the Campaign's Lot Number ignored; a CSV refused for R3; the year's default a day off;
- **roles:** marking open to the Manager;
- **publish rules:** a per-animal Lot Number Step, a Lot Number Step after the doses, or two Lot Number Steps allowed.

One mutation survived: taking any product's dose note as a Lot Number. No register shows a non-vaccine's Lot Number, so the test can't see it.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Vocabulary:** "run" is the glossary's avoided word for an SOP Instance, and bare "lot" is avoided under Pen.
  - It is **Campaign** and **Lot Number** throughout: code, messages, glossary.
  - The table, relation, effect kind (`lot_number`), functions and keys were renamed, and the migration regenerated as one.
- **Work that could never be finished:** a Lot Number Step placed after the doses would have refused every vaccine dose. It, and a second Lot Number Step, are now refused at publish.
- **The editor couldn't author a dose's own Lot Number:** it only edits the first evidence, and naming a product kept the dose to a tick. Choosing a vaccine now adds the optional note.
- **Taking the Lot Number back:** the effect no longer deletes it. A once-only Step can't be skipped and its note is required, so the effect refuses an empty one rather than leave doses untraceable.
- **Only a vaccine's dose note is a Lot Number,** not a wormer's.
- **A Correction back to a skip** no longer asks the product for withdrawal days. Routing corrected campaign doses through the dose upsert, so a corrected Lot Number lands, had added that check.
- **Shared code:**
  - the report and Lot Number validators share one helper;
  - the one-of-each rule is a single map;
  - the editor's "once, with a note" effects are one set;
  - the screen's three registers share one section;
  - a CSV returns its period, so the file name no longer switches on the register;
  - the look-backs keep named figures.
- **A cross-file flake:** one full run in four failed the passport and push tests, which assert Bangla for the shared Manager. `language.test.ts` set the Manager to English and never set it back; it now restores Bangla. I couldn't reproduce the failed ordering on demand, so this is the likely cause, not a proven one.
- **Comments:** `REGISTERS_WITH_CSV`'s comment now says R3 as well as R4. An older orphaned comment in the SOP validators, which the new helper sat under, is back above `effectProblems`, the function it describes.

## Left open

- **A prescribed vaccine dose has nowhere to write a Lot Number.** It appears on R3 with none. Vaccines are given by Campaign, and a Prescription's Step has no note.
- **Marking is what the product is, not what it was:**
  - a product marked a vaccine after doses were given puts those doses on R3 without a Lot Number;
  - clearing the mark takes them off.
  - A published Campaign Version for a product marked later has no Lot Number Step. Its vaccine doses are refused until a Version with one is published, and marking gives no warning.
- **Duplicates left alone:** the router's R3 and R4 entries each pair a period with a query, as R5's does.
