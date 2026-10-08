# 01 — Words and ADR

**What to build:** the words in CONTEXT.md and ADR 0020, so the code that follows has its names.

**Blocked by:** —

**Status:** done (2026-10-08), committed on docs/organization-investors

- [ ] **CONTEXT.md, change Investor (:323):** "A person **or an Organization** whose money is in a Venture"; what is
      written down for each; "the same name on the same mobile is the same Investor". Bring "and a nominee" up to date
      (Nominees are on a Nomination now, and an Organization has none).
- [ ] **New entry — Organization:** an Investor that is not a person — a company, a partnership firm, a proprietorship
      trading under its own name, a society — known to the Owner through the person who acts for it. Written down with
      its name, address, trade license, RJSC registration, TIN, the bank account it is paid into and its authority
      (the board resolution or letter that names its Signatory, and its date). Counts once towards the Investor Cap.
      Names no Nominee: its share is its own and outlives any Signatory. Never becomes a person, nor a person an
      Organization. _Avoid_: company, firm, business, institution, legal person.
- [ ] **New entry — Signatory:** the one person an Organization acts through: name, mobile, NID, role. Signs its
      papers "for and on behalf of" it, signs its Portal Consent, and signs in to the portal for it. Changed by the
      Owner as its own act; the change takes the old Signatory's sign-in away and the new one consents afresh.
      Agreements signed before the change stand. _Avoid_: representative, authorised person, agent, director.
- [ ] **Touch:** Investor Cap (:325, "distinct people" → "distinct Investors, an Organization one"); Nominee (:327,
      "an Investor who is a person"); Nomination (:331); Portal Consent (:370, signed by the Signatory for an
      Organization); Investor Portal (:353, the Signatory signs in).
- [ ] **ADR 0020 — An Organization may be an Investor, through one Signatory.** The Owner's four decisions; the
      advisers already agreed (2026-10-08, said by the Owner, no written sheet in this repo); the mobile on the record is
      the Signatory's and why; kind never changes; the one-mobile-one-account limit.

**Not here:** any code.
