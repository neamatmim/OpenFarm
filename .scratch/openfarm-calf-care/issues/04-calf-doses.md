# 04 — Calf doses in the Standard Playbook

**What to build:** The calf's doses as standard procedures, each raised from her arrival (her birth) at its age:
worming at about two weeks, FMD and anthrax at four months, the FMD booster a month later, and HS and BQ at six months.
They are written now and adopted by the Owner one by one, once the Vet has named the product and its withdrawal days.

**Blocked by:** 01, and the Vet's answers for adopting (not for building)

**Status:** not started. Ages from `docs/research/newborn-calf-care.md` §5–6: worm at day 14 (window 10–16);
FMD day 120, booster day 150; anthrax day 120; HS and BQ day 180. **The Vet chooses the worming:** DLS Appendix 35
gives piperazine at day 5–6, but _Toxocara_ reaches the calf in milk until about day 9 and piperazine cleared only
42–57% in trials, against 97% for pyrantel or levamisole.

- [ ] **Standard Playbook:** built from the existing `hisDose` / `hisDrench` helpers, with `appliesTo: { side: "dairy",
    states: ["calf", "heifer"] }` and arrival offsets from 01. Named constants each carry their source in a
      comment (NG-GLPP Appendix 31; 01's Toxocara source).
- [ ] **Needs:** each names its product need in `STANDARD_SOP_NEEDS`, and `STANDARD_DRUG_FOR` maps it to a standard
      drug with withdrawal days left empty. So none can be published until the Vet has filled them — the gate the
      fattening doses already sit behind.
- [ ] **Six-monthly after:** FMD, HS and BQ repeat every six months for the whole herd. If the farm has no standing
      herd campaign for them, name that on the plan for the Owner rather than build it here.
- [ ] **Left out:** brucellosis (female calves only; a Step cannot yet skip by sex). Say so in the code beside the
      others.
- [ ] **Tests:** `standard.test.ts` — each publishes once its product is named, and each is refused while blank.
- [ ] **Somebody opens it:** the Owner's "Standard procedures to adopt" list, showing the calf doses waiting on a
      product.
