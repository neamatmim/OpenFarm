# 01 — The Portal Consent's signing clause

**What to build:** The Portal Consent gains one clause: a code the farm sends to the Investor's phone or email, which
they enter in the portal, is their signature on the paper they agree to there (ICT Act 2006 s.13(3)(ক)). It ships as the
next standard Version, a farm on the one before caught up as every standard is. Each Portal Consent records whether the
wording it was signed in carried the clause, and an Investor whose consent in force does not is told — and the Owner
told — that they sign the new clause at their next visit and agree on paper until then.

**Blocked by:** —

**Status:** done, pending merge

- [x] The clause, in Bangla and English, in the standard Portal Consent (and the Organization's Signatory's form of it),
      as a new standard Version with `PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE` kept whole for the catch-up.
- [x] How a Version is known to carry it, when the Owner may edit the wording: decide and record (a marked clause the
      template checks keep, rather than matching words).
- [x] `consentAllowsSigningInApp(investor)` on the server, from the consent in force and its Version.
- [x] The Investor's portal card and their portal account page say whether they can agree in the app, and why not.
- [x] Tests: a consent signed on the old wording does not allow it; on the new, it does; a withdrawn consent never does.
- [x] CONTEXT.md **Portal Consent** says what the clause is for.
- [x] Somebody opens the consent sheet in both languages and the Investor's portal card.

## What was decided while building

- **The clause is marked, not matched:** `Clause.signingClause: true` (domain `paper-template.ts`), kept by the editor
  (which spreads over the clause) and by the wire (`template-content.ts`); `carriesSigningClause(content)` decides. The
  editor labels the marked clause, saying what removing it does.
- **The new standard:** the clause for a person and, `only` an Organization's, for its Signatory; the opening says "the
  following" instead of "these three things"; "Nothing is signed or paid through the portal" becomes "Nothing is paid
  … A paper I agree to there with the code binds me as one I sign on paper does."
  `PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE` is kept whole for the catch-up.
- **Signing the new one replaces the old:** `recordConsent` replaces a consent in force that lacks the clause when
  today's wording carries it — the old one ends as `withdrawn_how = "replaced"` (migration
  `20261008153141_a_consent_replaced`), portal access untouched, no new code given. `lastConsentsWithdrawn` skips a
  replaced one, and the Owner can never end a consent as replaced by hand.
- **Where it shows:** `ConsentSaid.signsInApp` (investors list → the Owner's portal card, with "Print the new consent"),
  and `portal.me` `record.signsInApp` (the account page line).
- **Found on the way:** the American English rename also changed the standard wording's *words* (organisation, licence),
  so a farm saved before it never matched any earlier standard and was never caught up. The catch-up now compares in
  today's spelling (`spelledAsToday` in `template-store.ts`); the saved Version still prints as saved.
