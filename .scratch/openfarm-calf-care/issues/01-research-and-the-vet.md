# 01 — Research, and the questions for the Vet

**What to build:** A research note in `docs/research/newborn-calf-care.md`, in the house style (Question, Researched,
sources read in full, abstract-only marked, `[SECONDARY]`, Answer, Sources). It gives every figure tickets 02–05
write into the Standard Playbook a source. Beside it, a one-page sheet of questions for the Vet, like the go-live
withdrawal sheet, so the doses in 04 can be adopted.

**Blocked by:** —

**Status:** done

- [x] **Colostrum:** how soon (first feed within 2 hours, at most 6), how much (about 10% of birth weight — 3–4 L
      for a crossbred calf, less for a deshi one), and the second feed within 12 hours. Primary sources: DLS NG-GLPP
      2023 (the calf chapter; the PDF on dls.portal.gov.bd would not load over TLS on 2026-09-29, so try another
      copy), Merck Veterinary Manual, the Calf Notes colostrum note.
- [x] **Navel care:** dip, not spray, in 7% iodine at birth, and again within the day.
- [x] **Birth weight** of crossbred and deshi calves in Bangladesh: sets the weigh-in Step's warn range. The fattening
      weigh-in's minimum is 20 kg; a deshi calf can be lighter.
- [x] **Toxocara vitulorum:** why calves are wormed at 10–16 days (passed through the dam's milk), the drugs that work
      in Bangladesh, and whether cattle calves are at the same risk as buffalo (the Bangladeshi studies are mostly
      buffalo).
- [x] **Vaccination ages:** NG-GLPP Appendix 31, already summarised in `docs/research/bangladesh-regulatory.md` §5.4.
- [x] **Weaning age** on Bangladeshi dairy farms, and the calf's milk allowance before it.
- [x] **Calf losses in Bangladesh:** morbidity and mortality, causes, and age at death — the studies found on
      2026-09-29 (ResearchGate 347885531, 26591013 and 329058139), read in full where they can be.
- [x] **The Vet's sheet:** the calf dewormer and each calf vaccine the farm will use, with milk and meat withdrawal
      days; whether they agree with the colostrum and navel steps as written.
- [x] Add the sources to `STANDARD_REFERENCES` (the Standards and sources page).

**Done (2026-09-29):**

- `docs/research/newborn-calf-care.md`. Its "Recommended figures" table is what 02–05 build from. DLS NG-GLPP was
  read through the Internet Archive: dls.portal.gov.bd now answers "Domain is not available".
- Corrections it made to the plan: the 30.9% / 8.64% figures were Ethiopian, and the Bangladeshi ones replaced them
  in the README. The "each hour of delay, 10%" figure appears in no primary source and is not used.
- Birth-weight warn range: 12–45 kg (02). Worming: day 14 with pyrantel or levamisole, against DLS's piperazine at
  day 5–6. The Vet chooses (04).
- The Vet sheet: `.scratch/openfarm-calf-care/vet-calf-sheet.html`, printable, in Bangla: the first-day care to agree
  or change, the calf dewormer and its meat withdrawal, and the vaccine ages. The vaccines' withdrawal days are on
  the go-live sheet already.
- Standards and sources page: NG-GLPP (archived copy), Hridoy 2025 (birth weights), Godden 2019 (colostrum), Merck
  "Feeding Young Dairy Calves". Each link was opened and answered 200 on 2026-09-29.
