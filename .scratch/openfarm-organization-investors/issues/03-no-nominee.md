# 03 — No Nominee for an Organization

**What to build:** an Organization names no Nominee anywhere, and nothing asks it to.

**Blocked by:** 02

**Status:** done (2026-10-08), on feat/organization-investors

- [x] **Server:** recording a Nomination for an Organization is refused (`organization_names_no_nominee`); signing
      an Agreement for one writes no Nomination (`agreement-write.ts`:174-182) and refuses `nominees` if sent;
      `nominationToSign` refuses; the "no nominee" reminder to the Owner is not raised for it.
- [x] **Web:** the sign-agreement sheet hides `NomineesForm` for an Organization; the profile shows no Nominees
      section and no "Record a Nomination" act; the table's nominee cell is blank for it.
- [x] **Tests:** signing an Organization writes no Nomination row; each refusal red with its guard off.

**Not here:** the paper wording (05).

**As built:** `nominations.ts` refuses an Organization in `theirs` (so `nominationToSign` and `recordNomination`) and in
`nomineesToSign` when it is given Nominees (`organization_names_no_nominee`), which covers the sign sheet, the paper laid
out to sign and the in-app offer; `writeAgreement` writes no Nomination for one. Sign sheet says "An organization names
no nominee" in place of the form; profile has no Nominees card. Each guard proved red. The "no nominee" reminder lives in
the paper wording (`NO_NOMINEE_LINE`), so it is 05's.

**Moved:** the portal's record (`theirRecord`, account page) to 04; the Data Copy to 05.
