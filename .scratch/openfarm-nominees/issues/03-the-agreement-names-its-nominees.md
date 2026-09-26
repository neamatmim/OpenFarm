# 03 — The Agreement names its Nominees

**What to build:** The sign sheet shows the Investor's Nominees in force, and the Owner may change them for this signing. The printed Agreement carries exactly that list. Signing records it as the Investor's Nomination, made by the Agreement, so a new Investor signs nothing extra and the Agreement keeps which Nominees it named. With no Nominee, the sheet reminds and never blocks.

**Blocked by:** 02.

**Status:** done, merged

**Spec:** [the spec](../spec.md), user stories 12–16. See also "The Investment Agreement".

- [x] **`investorStatements.agreementToSign`** takes an optional `nominees`, defaulting to the list in force, and refuses with `nomineesProblem`, judged on the day being signed.
- [x] **`ventures.sign`** takes the same `nominees`. In its transaction it records a Nomination with `how = agreement`, `agreement_id` set and `signed_on` = `stamped_on`. It does this even when the list equals the one in force.
- [x] **Signing with no Nominee** records a Nomination with no rows. **The Cap and every other refusal of `sign` are unchanged.**
- [x] **`sign-agreement-sheet.tsx`** gains the shared Nominees block, filled from the list in force, and sends exactly the list it printed. With none, it shows «কোনো নমিনি নেই / No Nominee» above the button and never disables it.
- [x] **Tests:**
  - Signing records the list printed.
  - Signing with a changed list makes it the one in force.
  - A later মনোনয়নপত্র leaves the Agreement's own Nomination's rows unchanged. **Assert on the rows.**
  - A minor on the stamped day needs a Receiver, and one who turns eighteen that day does not.
- [x] **The Investor's history** names an Agreement-made Nomination by its Venture («… শোধ যাচাই ভেঞ্চার Agreement, signed …»). It says "photo kept" when the Agreement's stamped paper is photographed; the photo is never shown, as for any Agreement.
- [x] **The seed** signs every seeded Agreement with its Investor's Nominees, so their lists read as signed for. *Not done:* the ticket's "one Investor with no Agreement keeps a `carried_over` list". Every seeded Investor signs, and the seed no longer writes a list it only carried over. `carried_over` comes from the migration on real databases, and was seen there in ticket 01.
- [x] **Somebody opens it:**
  - signs a seeded Agreement in Bangla, first with the list in force and then with a changed one;
  - sees the Investor's Nominees change and "not yet signed for" go;
  - sees the Agreement by print preview with three Nominees, one a minor.

## Checked before starting

- `sign` is at `routers/ventures.ts:940`, and `agreementToSign` at `routers/investor-statements.ts:36`.
- The sign sheet prints through `agreementToSign` and then signs with the same inputs. Keep the Nominees in the one form state both calls read.

## What was decided while building

- **`nominees` is optional on `sign` and `agreementToSign`**, via the shared `nomineesInput` in `nominations.ts`.
  - Left out, it means the list in force, checked like any other list. A carried-over nominee with no date of birth is therefore refused (`nominees_born_missing`) until the Owner adds it.
  - The sign sheet always sends the list it printed.
- **The check runs before the transaction**, judged on `stampedOn`, so a refused signing writes nothing. A test asserts no Agreement appears.
- **`nominationBySigning(tx, trail, …)`** records the Agreement's Nomination inside the signing transaction, after the Agreement row, with its own Audit Event (`entity: "nomination"`, the list in force before and after). The unique index on `agreement_id` holds one per Agreement.
- **An Agreement stamped earlier than the মনোনয়নপত্র in force** records its Nomination, but it isn't in force, because the latest signed paper governs. Nothing refuses this; the history shows both.
- **`NominationOnFile` gains `ventureName`**, and `hasPhoto` counts an Agreement's stamped-paper photo. Both come from `withTheirAgreements` in `nomination-store.ts`: three reads rather than a join, because an Agreement declares no relations.
- **The web:**
  - The sign sheet shows `TheNomineesItNames` (the shared `NomineesForm`) once somebody is chosen, filled from their list in force.
  - Minors are judged on the stamp day, or today until one is typed. Print and sign both need `draftsProblem` to be clear.
  - With no Nominee, the block says «কোনো নমিনি নেই…» and the button stays enabled.
- **Proven by switching off:** with the check off, 2 tests go red; with the recording off, 4 do.
- **Opened on the seed farm (in English):**
  - "Sign an Agreement" on শোধ যাচাই ভেঞ্চার for রফিকুল ইসলাম filled in his carried-over নাসরিন আক্তার. Signing stayed disabled until her date of birth was given.
  - Signed as PAY-6-02. His page now reads "Named in the শোধ যাচাই ভেঞ্চার Agreement, signed 26 September 2026", with her date of birth. "Not yet signed for" is gone, and the carried-over list is under Earlier Nominations.
