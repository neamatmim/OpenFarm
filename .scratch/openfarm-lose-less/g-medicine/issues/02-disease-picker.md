# 02 — Diseases picked from the list

**What to build:** The Vet picks a Diagnosis's disease from the farm's list (the Notifiable Diseases first) or types
another; a Notifiable Disease is matched by what was picked, and by its other names, never by exact words alone.

**Blocked by:** —

**Status:** done, 2026-09-30.

- [x] **Glossary:** **Notifiable Disease** widened: other names, either Unicode spelling, the list offered as the Vet
      writes.
- [x] **Match:** domain `namesTheDisease` / `diseaseWord` — name, English and other names, NFC-normalised (ড় as one
      letter or ড with its dot), case-folded, any run of spaces or dashes one space. `isNotifiable` reads it.
      **Changed from the plan:** no `diagnosis.notifiable_disease_id`. The picker writes the list's own name, which
      always matches, and the list cannot be renamed — an id would have added a column and a correction path for
      nothing.
- [x] **Other names:** `notifiable_disease.other_names` (text[]); the standard six ship theirs ("FMD", "খুরা রোগ",
      "LSD", "HS", "BQ", …), and the migration gives them to lists already holding the standard names. `notifiable.add`
      takes them; `notifiable.setOtherNames` (Owner, Manager, Vet; closed to a visit) replaces them.
- [x] **Screen:** the diagnosis sheet offers the list as the Vet types (a datalist — another disease still typed
      freely) and says, before saving, "… must be reported to DLS"; the list page shows "এভাবেও লেখা হয়: …" under each
      disease, edits them from the row menu, and asks for them when a disease is added.
- [x] **Tests:** `routers/notifiable-names.test.ts` (5): by name, "fmd", "খুরা রোগ", "Foot and mouth disease"; not for
      another disease; a new other name reports from then; a Correction to "FMD" raises the report; Barn Staff refused.
      Domain `disease-names.test.ts` (4); `standard.test.ts` checks the standard FMD carries "FMD". **Proved by
      switching off** the other names in the match, the setter, the NFC normalising and the standard's other names —
      each red.
- [x] **Somebody opens it** (seed, 2026-09-30, as the Vet): the list page shows every disease's other names; answering
      D-0056's "মুখে বা ক্ষুরে ঘা" with "FMD" showed "ক্ষুরা রোগ must be reported to DLS…" before saving, and the saved
      Diagnosis raised the DLS report, its work, and two notifiable notices.

**Not built:** the Diagnosis correction dialog stays free text (other names still catch it).
