# 04 — Changing the Signatory, and the portal

**What to build:** the Owner changes an Organization's Signatory; the portal is the Signatory's, for the Organization.

**Blocked by:** 02

**Status:** done (2026-10-08), on feat/organization-investors

- [x] **`investors.changeSignatory`** (Owner, personal session, audited as its own Audit Event kind): new name,
      mobile, NID, role, and the authority that names them. Takes away the portal sign-in and the Portal Consent in
      force (both were the old Signatory's); open Pay-in Notes and Requests to Join the old Signatory sent stay the
      Organization's. The mobile moves with the Signatory, under the same-Investor rule. Refused for a person
      (`investor_is_a_person`) and for a retired Organization.
- [x] **`investors.update` puts the Signatory's details right** (a typo, the same person's new mobile), as for a
      person; a different person is `changeSignatory`'s. Say so in ADR 0020 (it now says update cannot change them).
- [x] **Portal record:** `theirRecord` and the account page read as the Organization — its details, the Signatory with
      their NID masked, no Nominees section.
- [x] **Portal:** the invitation and the Welcome Letter name the Signatory and the Organization ("…, for <Org>"); the
      account is named after the Signatory; the portal's header and account page read as the Organization, with "you
      sign in as its Signatory". Agreeing in the app: the Signatory agrees for the Organization; the agreement records
      the account, as today.
- [x] **Tests:** changing the Signatory takes the old sign-in away (the old password is refused), the new Signatory
      can be invited only after a new Portal Consent; `update` refuses a Signatory change.

**Not here:** papers (05).

**As built:** `investors.changeSignatory` (Owner, personal session; refuses a person `investor_is_a_person`, a retired
Organization, and a mobile that makes it another Investor). In the same transaction `signatoryLeaves`
(portal-store.ts) takes the access away with `revoked_why = signatory_changed`, disables the old account, ends its
sessions, **lets go of the account (`userId` null)** so the new Signatory opens one in their own name, and ends the
consent in force today with `withdrawn_how = signatory_changed`. Neither word can be chosen by the Owner in the
take-away dialog. Migration `20261008050401_a_signatory_changes` widens both `_known` checks; `LATEST_MIGRATION`
moved; `openfarm_seed` migrated. Joining names an Organization's account after its Signatory. `portal.me` returns
`record.organization` (Signatory's NID masked) and no Nominees; the account page shows the Organization and its
Signatory. Owner side: "Change signatory" on the Signatory card, a sheet that says what it ends; the taken-away
line says to invite the new one once they sign a consent. Test `routers/organization-signatory.test.ts`, three guards
proved red. Opened on the seed server: changed the Signatory of the seeded Organization, header/card/toast right.

**Not built:** the Welcome Letter and the consent paper's wording (05, papers). No audit "kind" of its own: the change
is the investor's `update` event, its before/after showing the Signatory leave.
