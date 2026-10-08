# 01 — The Portal Consent's signing clause

**What to build:** The Portal Consent gains one clause: a code the farm sends to the Investor's phone or email, which
they enter in the portal, is their signature on the paper they agree to there (ICT Act 2006 s.13(3)(ক)). It ships as the
next standard Version, a farm on the one before caught up as every standard is. Each Portal Consent records whether the
wording it was signed in carried the clause, and an Investor whose consent in force does not is told — and the Owner
told — that they sign the new clause at their next visit and agree on paper until then.

**Blocked by:** —

**Status:** open

- [ ] The clause, in Bangla and English, in the standard Portal Consent (and the Organization's Signatory's form of it),
      as a new standard Version with `PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE` kept whole for the catch-up.
- [ ] How a Version is known to carry it, when the Owner may edit the wording: decide and record (a marked clause the
      template checks keep, rather than matching words).
- [ ] `consentAllowsSigningInApp(investor)` on the server, from the consent in force and its Version.
- [ ] The Investor's portal card and their portal account page say whether they can agree in the app, and why not.
- [ ] Tests: a consent signed on the old wording does not allow it; on the new, it does; a withdrawn consent never does.
- [ ] CONTEXT.md **Portal Consent** says what the clause is for.
- [ ] Somebody opens the consent sheet in both languages and the Investor's portal card.
