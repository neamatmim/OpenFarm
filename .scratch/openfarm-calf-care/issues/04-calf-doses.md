# 04 — Calf doses in the Standard Playbook

**What to build:** The calf's doses as standard procedures, each raised from her arrival (her birth) at its age:
worming at about two weeks, FMD and anthrax at four months, the FMD booster a month later, and HS and BQ at six months.
They are written now and adopted by the Owner one by one, once the Vet has named the product and its withdrawal days.

**Blocked by:** 01, and the Vet's answers for adopting (not for building)

**Status:** done. Ages from `docs/research/newborn-calf-care.md` §5–6: worm at day 14 (window 10–16);
FMD day 120, booster day 150; anthrax day 120; HS and BQ day 180. **The Vet chooses the worming:** DLS Appendix 35
gives piperazine at day 5–6, but _Toxocara_ reaches the calf in milk until about day 9 and piperazine cleared only
42–57% in trials, against 97% for pyrantel or levamisole.

- [x] **Standard Playbook:** built from the existing `hisDose` / `hisDrench` helpers, with `appliesTo: { side: "dairy",
    states: ["calf", "heifer"] }` and arrival offsets from 01. Named constants each carry their source in a
      comment (NG-GLPP Appendix 31; 01's Toxocara source).
- [x] **Needs:** each names its product need in `STANDARD_SOP_NEEDS`, and `STANDARD_DRUG_FOR` maps it to a standard
      drug with withdrawal days left empty. So none can be published until the Vet has filled them — the gate the
      fattening doses already sit behind.
- [x] **Six-monthly after:** FMD, HS and BQ repeat every six months for the whole herd. If the farm has no standing
      herd campaign for them, name that on the plan for the Owner rather than build it here.
- [x] **Left out:** brucellosis (female calves only; a Step cannot yet skip by sex). Say so in the code beside the
      others.
- [x] **Tests:** `standard.test.ts` — each publishes once its product is named, and each is refused while blank.
- [x] **Somebody opens it:** the Owner's "Standard procedures to adopt" list, showing the calf doses waiting on a
      product.

**Built (2026-09-29):**

- Six standard procedures, each counted from her arrival (her birth) and for calves and heifers on the Dairy side:
  `calfDeworming` (day 14), `calfFmd` (120), `calfFmdBooster` (150), `calfAnthrax` (120), `calfHs` (180), `calfBq`
  (180). Built with `hisDose` / `hisDrench` and `appliesTo: { side: "dairy", states: ["calf", "heifer"] }`.
- Needs: the vaccines reuse the herd's (`fmdVaccine`, `anthraxVaccine`, `hsVaccine`, `bqVaccine`). A new
  `calfDewormer` need, with pyrantel as its standard drug: it joins the Drug List with no withdrawal days, so nothing
  can give it until the Vet fills them. The Vet's sheet asks which drug and when.
- Six-monthly FMD, and yearly HS and BQ, after the calf's doses: the herd campaigns (`fmdVaccination` and the rest)
  already cover every animal in a Pen, so nothing new is built for them.
- Not in the seed: the seed farm does not adopt them, as it does not adopt anthrax.
- Opened on the seed farm as Owner: the calf doses are in "Standard procedures to adopt", each asking for its product.
