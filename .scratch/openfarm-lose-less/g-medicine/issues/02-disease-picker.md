# 02 — Diseases picked from the list

**What to build:** The Vet picks a Diagnosis's disease from the farm's list (the Notifiable Diseases first) or types
another; a Notifiable Disease is matched by what was picked, and by its other names, never by exact words alone.

**Blocked by:** —

- [ ] **Record:** `diagnosis.notifiable_disease_id` (nullable); `isNotifiable` matches the id first, then the words
      against name and other names, trimmed and case-folded.
- [ ] **Other names:** `notifiable_disease` gains other names (e.g. "FMD", "খুরা রোগ", "Foot and mouth disease") — the
      standard list ships them; Owner, Manager or Vet may add.
- [ ] **Screen:** the diagnosis sheet and its correction offer the list, with "another disease" as free text.
- [ ] **Tests:** "FMD" raises the DLS Report; a picked disease raises it; a correction to a notifiable one raises it.
