# 02 — Writing an Organization down

**What to build:** the Owner writes an Organization down, puts its record right, and sees it on the Investors list and
its own page.

**Blocked by:** 01

**Status:** done (2026-10-08), on feat/organization-investors

- [x] **Migration** on `investor`: `kind text not null default 'person'` (check `person|organization`);
      `signatory_name`, `signatory_nid`, `signatory_role`, `trade_license`, `rjsc_number`, `tin`, `authority`
      (what the paper is), `authority_on date`. Check: an Organization has a `signatory_name` and `authority`; a person
      has none of the Organization's columns. `nid` stays the person's own and is null for an Organization. New enum
      word → migration; move `LATEST_MIGRATION`; migrate `OpenFarm` and `openfarm_seed` on merge.
- [x] **API:** `investors.record` / `update` take a person or an Organization (a discriminated input on `kind`).
      `kind` is refused on update (`investor_kind_fixed`). The same-Investor rule is name + mobile for both; the
      refusal words say "Investor", not "person". Audit shape (`readInvestor`) carries the new fields. `list` returns
      `kind` and the Signatory; rename the `people` key to `investors` only if it is cheap — otherwise leave it.
- [x] **Web:** the record sheet opens with "A person / An Organization"; the Organization shows its fields and a
      Signatory section, mobile labelled as the Signatory's. Profile page: Organization details, Signatory, authority;
      no NID row of its own. Table: an Organization reads as its name with "Signatory: …" under it, and is found by the
      Signatory's name as well. Bangla and English words.
- [x] **Tests:** record and read an Organization; a person refuses Organization fields and the reverse; kind cannot be
      changed; the Cap counts it once (a Venture at the Cap refuses the 21st whether it is a person or an
      Organization). Prove each refusal red with its guard off.

**Not here:** Nominees (03), changing the Signatory (04), papers (05).

**As built:** migration `20261008044127_organization_investors` (`kind` + 8 columns; checks
`investor_organization_has_a_signatory`, `investor_person_has_no_signatory`, `investor_authority_on_day`,
`investor_kind_known`); `LATEST_MIGRATION` moved; `openfarm_seed` migrated (OpenFarm on merge). `investors.record` /
`update` take a union (a call without `kind` is a person, so the 70 existing callers are unchanged); `kind` refused on
update (`investor_kind_fixed`). `list` returns `kind` and `organization` (papers, authority, Signatory); the `people`
key kept. Audit shape flat (`tradeLicense` … `signatoryRole`) with trail words. Sheet: person/Organization switch when
recording; Organization and Signatory sections. Profile: Organization and Signatory cards; header "Signed for by …".
Table: Signatory line under the name; search finds the Signatory by name. Test `routers/organization-investors.test.ts`
(kind guard proved red; DB checks asserted by constraint name). Opened on the seed server (127.0.0.1:3002): recorded,
listed, searched, page, edit, saved. **The seed server needed a restart** for Drizzle to read the new columns.

**Decided while building:** `update` puts an Organization's record right, Signatory's details and mobile included,
as it does a person's; a *different* person as Signatory is 04's `changeSignatory`.
