# 01 — Words, ADR and the advisers' sheet

**What to build:** the vocabulary and the decision record, before any code.

**Blocked by:** —

**Status:** done (2026-11-08)

- [x] **CONTEXT.md**, grepped first:
  - **Application Link**: the Owner's invitation to one named person (name, mobile, person or Organization) to fill
    in their own details online. Good for 7 days, used once, withdrawable until used. Avoid: invite link, referral.
  - **Application**: what comes back from an Application Link, waiting for the Owner: the Investor Details Form's
    parts, the photos, and the Portal Consent agreed with a code. Approved, declined, or lapsed. Avoid: sign-up,
    registration, KYC, onboarding.
  - Widen **Investor Details Form**'s and **Request to Join**'s _Avoid_ notes: "application" is now the Application.
    A Request to Join is still not one.
  - **Portal Consent**: may also be agreed on an Application with a code texted to their mobile, its proof kept.
  - **Investor Portal**: the first code may be texted, for an approved Application only.
  - **Investor**: "known to the Owner personally or personally introduced" stands. The link is how the Owner says so.
- [x] **ADR 0034** "Somebody the Owner sends a link to may apply online", recorded as the Owner's decision of
      2026-11-08. It amends ADR 0007 (consent and first code in person) for Applications only. Say what stays: no
      public page, the switch, the Investor Cap at signing, no money.
- [x] **Advisers' sheet** (`advisers-sheet.html`, as `openfarm-pay-in-notes/` has one): the online consent with a
      texted code in place of paper, and NID checked from a photo, not in person. In both languages.
