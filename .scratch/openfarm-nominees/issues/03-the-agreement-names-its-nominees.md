# 03 — The Agreement names its Nominees

**What to build:** The sign sheet shows the Investor's Nominees in force, and the Owner may change them for this signing. The printed Agreement carries exactly that list. Signing records it as the Investor's Nomination, made by the Agreement, so a new Investor signs nothing extra and the Agreement keeps which Nominees it named. With no Nominee, the sheet reminds and never blocks.

**Blocked by:** 02.

**Status:** ready for an agent

**Spec:** [the spec](../spec.md), user stories 12–16. See also "The Investment Agreement".

- [ ] **`investorStatements.agreementToSign`** takes an optional `nominees`, defaulting to the list in force, and refuses with `nomineesProblem`, judged on the day being signed.
- [ ] **`ventures.sign`** takes the same `nominees`. In its transaction it records a Nomination with `how = agreement`, `agreement_id` set and `signed_on` = `stamped_on`. It does this even when the list equals the one in force.
- [ ] **Signing with no Nominee** records a Nomination with no rows. **The Cap and every other refusal of `sign` are unchanged.**
- [ ] **`sign-agreement-sheet.tsx`** gains the shared Nominees block, filled from the list in force, and sends exactly the list it printed. With none, it shows «কোনো নমিনি নেই / No Nominee» above the button and never disables it.
- [ ] **Tests:**
  - Signing records the list printed.
  - Signing with a changed list makes it the one in force.
  - A later মনোনয়নপত্র leaves the Agreement's own Nomination's rows unchanged. **Assert on the rows.**
  - A minor on the stamped day needs a Receiver, and one who turns eighteen that day does not.
- [ ] **The Investor's history** names an Agreement-made Nomination by its Venture and links to the Agreement's photo.
- [ ] **The seed** signs every seeded Agreement with its Investor's Nominees, so their lists read as signed for. One Investor with no Agreement keeps a `carried_over` list.
- [ ] **Somebody opens it:**
  - signs a seeded Agreement in Bangla, first with the list in force and then with a changed one;
  - sees the Investor's Nominees change and "not yet signed for" go;
  - sees the Agreement by print preview with three Nominees, one a minor.

## Checked before starting

- `sign` is at `routers/ventures.ts:940`, and `agreementToSign` at `routers/investor-statements.ts:36`.
- The sign sheet prints through `agreementToSign` and then signs with the same inputs. Keep the Nominees in the one form state both calls read.
