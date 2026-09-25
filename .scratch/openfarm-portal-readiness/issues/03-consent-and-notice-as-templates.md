# 03 — Consent and the notice as Templates

**What to build:** The Portal Consent sheet and the privacy notice "আপনার তথ্য" become two new Template kinds. They are versioned, carry the lawyer's approval, and are worded from the map's drafts. The notice's blanks become farm facts the Owner fills in.

**Blocked by:** None.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 14–16.

- [ ] `TEMPLATE_KINDS` gains `portal_consent` and `privacy_notice`, each with its fixed fields.
- [ ] Standard wording for both, from the drafts in `openfarm-investor-portal/assets/`, is given lazily like the other kinds.
- [ ] The farm gains its host name, backup store name and backup country, set by the Owner only and audited.
- [ ] The Templates page lists both kinds. The Owner can read, publish a new Version and record the lawyer's approval, as for the Agreement.
- [ ] A notice printed or shown with a fact still unset tells the Owner what is missing, and shows no bracket on the Investor side.
- [ ] Somebody opens both Templates on `/templates`, publishes a Version of each, and prints the notice.

## Checked before starting

- Kinds and fields: `packages/domain/src/paper-template.ts` (`TEMPLATE_KINDS`, `TEMPLATE_FIELDS`, the section kinds `parties`, `facts`, `clauses`, `stamp`, `signatures`).
- Standard wording: `packages/domain/src/standard-templates.ts`. Store: `packages/api/src/template-store.ts`. Router: `routers/templates.ts`. Web: `/templates`, `components/templates/`, `ventures/paper-document.tsx`.
- The consent sheet needs a signatures section for the Investor and the Owner, and no stamp. The notice needs neither.
- A new column or enum value needs a migration. Apply it to the dev database and the seed on merge, and move the latest-migration marker.
