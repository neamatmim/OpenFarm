# 09 — The Agreement's data clause

**What to build:** The Investment Agreement's standard wording gains a new Version with the "তথ্য / Data" section and the nominee lines. The Agreement's print dialog offers the notice beside it, so every Investor gets it at signing.

**Blocked by:** 03.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 36–37.

- [ ] The standard `investment_agreement` wording has the data section after General terms and the two nominee lines beside the nominee row. It is taken from the draft.
- [ ] Agreements already recorded stay pinned to their own Version.
- [ ] The under-18 line prints every time.
- [ ] The Agreement's print dialog offers the notice. Printing it is an Export.
- [ ] Somebody records a seeded Agreement and prints it with the notice.

## Checked before starting

- Standard wording: `standard-templates.ts`. The Agreement row records `templateVersionId`, and `termsOf` reads the Agreement's own Version.
- The nominee is in the parties' rows (`PARTIES`). The death clause mentions the nominee already.
- Print dialog: `components/ventures/paper-dialog.tsx`.
