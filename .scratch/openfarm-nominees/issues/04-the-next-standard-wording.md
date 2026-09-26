# 04 — The next standard wording

**What to build:** The standard wording OpenFarm offers takes the several-Nominees drafts. A farm takes them only when the Owner publishes them, and the lawyer sees them first at the pending meeting.

- **The Investment Agreement:** the heirs clause and rules 1–5 in the Terms, the plural Nominees-know line, and the Receiver and no-Nominee lines.
- **The data clause, the Portal Consent sheet and the privacy notice:** they say «নমিনি ও গ্রহণকারীর তথ্য».

**Blocked by:** 02, for the Template's `receiverLine` and `noNomineeLine`.

**Status:** ready for an agent

**Spec:** [the spec](../spec.md), user stories 21–22. See also "The next standard Version".

- [ ] **The standard `investment_agreement`** gains the wording of [the draft](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md):
  - the new heirs clause and rules 1–5 in «শর্তাবলি», replacing «…তাঁর নমিনির মাধ্যমে…»;
  - `nomineeLines` = the plural Nominees-know line;
  - `receiverLine` and `noNomineeLine`.

  `FIRST_PRINTED_AGREEMENT` and the Versions already published are untouched.
- [ ] **The data clause, the Portal Consent sheet and «আপনার তথ্য»** say «নমিনি ও গ্রহণকারীর তথ্য» / "the Nominees' and Receivers' details" in place of «নমিনির তথ্য».
- [ ] **An existing farm is not moved.** A test shows a farm on the current Version still prints its own wording, with the Nominee table under the Investor. The Templates page offers the new standard as it offered the data clause.
- [ ] **The seed farm is moved.** The user's `OpenFarm` database is not.
- [ ] **Somebody opens it:**
  - the Templates page shows the new standard offered;
  - on the seed farm, the Agreement to sign reads the new Terms and lines by print preview, with none, one and three Nominees;
  - on a farm left on the old Version, the old wording prints with the table.

## Checked before starting

- The data clause Version (readiness ticket 09) is the pattern: the standard gained a part, `FIRST_PRINTED_AGREEMENT` stayed the pre-edit wording, and the farm moved only on the Owner's publish.
- The lawyer's pack already carries this wording on pages 7–8. If the written opinion changes it, that change is a later Version, not this ticket.
