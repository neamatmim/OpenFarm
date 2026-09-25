# 03 — Consent and the notice as Templates

**What to build:** The Portal Consent sheet and the privacy notice "আপনার তথ্য" become two new Template kinds. They are versioned, carry the lawyer's approval, and are worded from the map's drafts. The notice's blanks become farm facts the Owner fills in.

**Blocked by:** None.

**Status:** done on `feat/consent-and-notice-templates`

**Spec:** [the readiness spec](../spec.md), user stories 14–16.

- [x] `TEMPLATE_KINDS` gains `portal_consent` and `privacy_notice`, each with its fixed fields.
- [x] Standard wording for both, from the drafts in `openfarm-investor-portal/assets/`, is given lazily like the other kinds.
- [x] The farm gains its host name, backup store name and backup country, set by the Owner only and audited.
- [x] The Templates page lists both kinds. The Owner can read, publish a new Version and record the lawyer's approval, as for the Agreement.
- [x] A notice printed or shown with a fact still unset tells the Owner what is missing, and shows no bracket on the Investor side.
- [x] Somebody opens both Templates on `/templates`, publishes a Version of each, and prints the notice. **Opened 2026-09-26 on the seed database, as the Owner:**
  - Both kinds are listed, each marked as waiting on the lawyer.
  - The notice's preview first warned that the host, the backup store and its country were missing. With them saved (made-up names, cleared afterwards), it named all three with no bracket and no warning.
  - The consent's preview is Bangla apart from the title. The Investor signs and dates first, and the Owner countersigns and dates below. Neither paper closes on "no return".
  - The editor offers the notice only facts and clauses, and the consent no stamp.
  - Both were published as Version 2.
  - **Print was not pressed:** the browser's print dialog blocks the agent's browser. The preview shown is the paper that prints.

## Checked before starting

- Kinds and fields: `packages/domain/src/paper-template.ts` (`TEMPLATE_KINDS`, `TEMPLATE_FIELDS`, the section kinds `parties`, `facts`, `clauses`, `stamp`, `signatures`).
- Standard wording: `packages/domain/src/standard-templates.ts`. Store: `packages/api/src/template-store.ts`. Router: `routers/templates.ts`. Web: `/templates`, `components/templates/`, `ventures/paper-document.tsx`.
- The consent sheet needs a signatures section for the Investor and the Owner, and no stamp. The notice needs neither.
- A new column or enum value needs a migration. Apply it to the dev database and the seed on merge, and move the latest-migration marker.

## What was decided while building

- **Each kind's rules are one record in `packages/domain/src/paper-template.ts` (`RULES`)**:
  - the facts it may say
  - the parts it must have, and the parts it may not have (`part_not_here`)
  - whether it is about money, and so closes on the lines promising no return
  - whether its English is printed
  - whether its signatures are dated
  - who signs where it has no parties part, and whether the Investor signs first
- **The consent and the notice print their title's English and nothing else.** The Investor is handed the Bangla. The English stays in the Version, for the Owner and the lawyer to read in the editor.
- **The consent** is signed and dated by the Investor first, and countersigned and dated by the Owner. It carries no stamp.
- **The notice** is read, not signed: no parties, no signatures, no stamp.
- **`paperFrom` takes a `version`** and writes it in the foot ("সংস্করণ ২ / Version 2"), so a consent kept on file says which wording was signed. Ticket 04 passes it when it prints the consent.
- **The notice's farm facts:** `{farmPhone}` stands for the draft's "Owner's phone". It is the farm's phone, the same one the letterhead prints. `dataHost`, `backupStore` and `backupCountry` are three `farm` columns, with migration `20260925191916_the_farms_data_keepers`, applied to both dev databases.
- **The data keepers are read and set through `farm.dataKeepers` / `farm.setDataKeepers`**, Owner-only from a personal session, and audited. The form sits at the top of `/templates`.
- **`factsMissing(content, values, among)`** names each fact a Version asks for that nobody has filled. The preview counts the farm's own (`FARM_FIELDS`). **For ticket 07:** the Investor-side notice page should not show a notice whose farm facts are missing. `fillIn` still leaves `____________` for an unset fact.
- **The complaint line** names the National Data Management Authority as a settled wording. The kind is marked as waiting on the lawyer, whose wording replaces it as a new Version.
- **The kinds list is twinned** in `packages/db` and `packages/domain`, and a test says the two agree.

