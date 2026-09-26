# 04 — The next standard wording

**What to build:** The standard wording OpenFarm offers takes the several-Nominees drafts. A farm takes them only when the Owner publishes them, and the lawyer sees them first at the pending meeting.

- **The Investment Agreement:** the heirs clause and rules 1–5 in the Terms, the plural Nominees-know line, and the Receiver and no-Nominee lines.
- **The data clause, the Portal Consent sheet and the privacy notice:** they say «নমিনি ও গ্রহণকারীর তথ্য».

**Blocked by:** 02, for the Template's `receiverLine` and `noNomineeLine`.

**Status:** done, merged

**Spec:** [the spec](../spec.md), user stories 21–22. See also "The next standard Version".

- [x] **The standard `investment_agreement`** gains the wording of [the draft](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md):
  - the new heirs clause and rules 1–5 in «শর্তাবলি», replacing «…তাঁর নমিনির মাধ্যমে…»;
  - `nomineeLines` = the plural Nominees-know line;
  - `receiverLine` and `noNomineeLine`.

  `FIRST_PRINTED_AGREEMENT` and the Versions already published are untouched.
- [x] **The data clause, the Portal Consent sheet and «আপনার তথ্য»** say «নমিনি ও গ্রহণকারীর তথ্য» / "the Nominees' and Receivers' details" in place of «নমিনির তথ্য».
- [x] **An existing farm is not moved.** A test shows a farm on the current Version still prints its own wording, with the Nominee table under the Investor. The Templates page offers the new standard as it offered the data clause.
- [x] **The seed farm is moved.** The user's `OpenFarm` database is not.
- [x] **Somebody opens it:**
  - the Templates page shows the new standard offered;
  - on the seed farm, the Agreement to sign reads the new Terms and lines by print preview, with none, one and three Nominees;
  - on a farm left on the old Version, the old wording prints with the table.

## Checked before starting

- The data clause Version (readiness ticket 09) is the pattern: the standard gained a part, `FIRST_PRINTED_AGREEMENT` stayed the pre-edit wording, and the farm moved only on the Owner's publish.
- The lawyer's pack already carries this wording on pages 7–8. If the written opinion changes it, that change is a later Version, not this ticket.

## What was decided while building

- **The draft was wrong about where the heirs clause was.** The wording draft (and this ticket) said the new clause "replaces «…তাঁর নমিনির মাধ্যমে…»" in the Investment Agreement's Terms. The first-printed Investment Agreement never had that clause: it is in the **Master Agreement's** general terms.
  - **Investment Agreement:** the heirs clause and rules 1–5 are *added* to «শর্তাবলি», before the last term, the Arbitrator, who settles any dispute over them too. That makes 13 terms.
  - **Master Agreement:** its old clause is *replaced* by the same heirs clause and rules, so the two papers agree. Nobody signs one until the lawyer answers.
  - The lawyer's pack (pages 7–8) says "replacing the one-line heirs clause". That is true of the Master Agreement, and the pack is otherwise right.
- **The standard Investment Agreement's parties part** is now `nomineeLines: [EACH_NOMINEE_KNOWS]`, `receiverLine` and `noNomineeLine`. The old two lines (`NOMINEE_LINES`, with the hand-struck guardian line) are gone from the code. Farms that published them keep them as their stored Version.
- **Wording "nominee details" → Nominees and Receivers:**
  - the data clause (1): «… ব্যাংক হিসাব, আর তাঁর নমিনি ও গ্রহণকারীর তথ্য …»;
  - the Portal Consent (clause 3): «… আর আমার নমিনি ও গ্রহণকারীর তথ্য রাখবে»;
  - «আপনার তথ্য»: names the Nominees' name, relation, date of birth, phone and share, and a minor's Receiver's name, relation and phone.
- **Nothing moves a farm.** The farm keeps its published Version, and the standard reaches a farm only when it is first given its wording, or when the Owner starts from the standard in the editor ("OpenFarm's standard") and publishes. The seed farm is rebuilt, so it is given the new standard. The user's `OpenFarm` is untouched.
- **Tests:**
  - `standard-nominee-wording.test.ts`: a farm given its wording now prints the rules and a Receiver's line for the minor alone. A farm that publishes `FIRST_PRINTED_AGREEMENT` prints its own words (no lines, no rules), with the Nominee table under the Investor all the same.
  - Updated for the new standard: the domain terms counts (7 → 13 terms, 14 → 20 lines), the Agreement to sign (13 clauses; the no-Nominee line for somebody with none), and the web editor's line count (2 → 1).
- **Opened on the rebuilt seed farm, in Bangla, after the user signed in:** "চুক্তি সই" for আবুল হাশেম মিয়া on কোরবানি ২০২৭ ভেঞ্চার filled in his three Nominees and সুমাইয়া's Receiver. In the paper dialog:
  - the table, with সুমাইয়া marked নাবালক and রোকেয়া বেগম (মা) on the row beneath;
  - «… প্রত্যেক নমিনি জানেন …», and the Receiver's line for সুমাইয়া alone;
  - the Terms: ৭ the heirs clause, ৮–১২ the rules, ১৩ the Arbitrator.

  Closed without signing.
