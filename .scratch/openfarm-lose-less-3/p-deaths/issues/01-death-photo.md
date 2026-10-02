# 01 — A photograph of her tag with every death

**What to build:** A death or a cull is not taken without a photograph of the dead animal showing her tag. It is kept
with the Mortality and shown on her page; a stillborn calf's is asked with her disposal.

**Blocked by:** —

**Status:** open.

- [ ] **Glossary:** **Mortality** widened — written with a photograph of her showing her tag, a stillborn calf's with
      her disposal; a Correction may add a newer one and never takes one away.
- [ ] **Schema:** `mortality_photo` (the Mortality, the photo as `money_receipt` keeps one, who took it, when, and when
      a newer one replaced it). Migration `a_death_photographed`, both dev databases. **No start day:** a death written
      before has none.
- [ ] **Rule:** `animals.recordMortality` takes the photo (`receiptInput`'s shape, `money-inputs.ts`), refused without
      one by its own word rather than the schema's (`death_needs_a_photo`), so the screen says it in Bangla.
      `animals.recordDisposal` the same for a stillborn calf. The Calving's stillbirth (`calving-store.ts:53`) writes
      none. `correctMortality` may add a newer photo, marking the last replaced; nothing removes one. A new read,
      `animals.deathPhotos`, open to whoever may read `animals.photo`.
- [ ] **Words:** `death_needs_a_photo` in `apps/web/src/lib/correction-refusal.ts`, Bangla and English.
- [ ] **Screen:** the death sheet (`MortalitySheet`, `animal-acts.tsx:147`) and the disposal sheet take a `PhotoField`
      — "her tag must show" — and are not ready without it; her page shows the photograph where she left (with "replaced"
      under an older one), and "no photograph" for a death written before; the Correction sheet offers a newer one.
- [ ] **Seed:** `seed/herd.ts:385` and `seed/script.ts:929` send a small photo; every existing test writing a death
      sends one through one helper.
- [ ] **Tests:** `routers/death-photo.test.ts`. **First, red before the fix:** a Manager records a bull as died,
      buried, with no photograph — refused (today taken). Then: with one, kept and read back; a stillborn calf's
      disposal without one refused, with one kept; the Calving itself still writes her death without one; a Correction
      adds a newer photo and the first is still there; the Vet reads it. **Proved by switching off** the requirement on
      each of the two paths — each red.
- [ ] **Somebody opens it** (seed): the Manager records a death with the camera; her page shows the photograph beside
      the cause and the disposal; a dead animal from before reads "no photograph".
