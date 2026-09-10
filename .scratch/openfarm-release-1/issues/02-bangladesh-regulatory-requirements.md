# Bangladesh regulatory requirements for cattle, medicine and milk

Status: resolved

Type: research

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**AFK research.** Findings go on branch `research/bangladesh-regulatory` at `docs/research/bangladesh-regulatory.md`.

What does the law and the Department of Livestock Services (DLS) in Bangladesh actually require a commercial dairy + fattening farm (100–500 head) to record, keep, and report? Primary sources only (Acts, rules, DLS circulars, BSTI standards, official forms). For each item: what is required, by whom, retention period, and the source.

Cover:

1. **Animal identification** — is there a national cattle ID/ear-tag scheme? Mandatory? What number format?
2. **Movement & sale records** — what must be recorded when cattle are bought, sold, or transported (incl. for Eid-ul-Adha fattening sales)?
3. **Veterinary medicine records** — prescription requirements, records of treatment, **milk and meat withdrawal periods**, banned substances (e.g. growth promoters in fattening).
4. **Milk** — quality/hygiene standards (BSTI), any record-keeping obligations for milk sold.
5. **Disease reporting** — notifiable diseases, mortality reporting, vaccination records (FMD, anthrax, LSD etc.).
6. **Farm registration / licensing** — any obligations the software should help evidence.
7. **Buyer/processor requirements** — what large dairy processors or meat buyers in Bangladesh typically demand from suppliers, if documented.

Flag clearly where rules are unclear, unenforced, or where you could not find a primary source.

## Answer

Findings: `docs/research/bangladesh-regulatory.md` on branch **`research/bangladesh-regulatory`** (commit `4aa745c`). Read with `git show research/bangladesh-regulatory:docs/research/bangladesh-regulatory.md`. 25-row summary table; every claim cited; secondary sources marked.

**Headline**: Bangladeshi law imposes very few _explicit_ farm-level record duties. The hard obligations are: register the farm with DLS and renew; report suspected notifiable disease to DLS in writing without delay (Animal Disease Act 2005 s.3); no steroids/hormones/antibiotics in feed (Animal Feed Act 2010 s.14; DLS notice 1 Oct 2013 on fattening); antibiotics only on a registered practitioner's prescription (Drugs & Cosmetics Act 2023 s.40(d)); keep supplier/buyer names, addresses and invoices for milk sold (Safe Food Act 2013 s.38). Everything else is required _indirectly_ or by the non-mandatory DLS _National Guidelines on Good Livestock Production Practices_ (2023).

**Decision-relevant findings**

1. **No national cattle ID scheme.** Only the BINLI barcode ear-tag _pilot_ under LDDP; no number format published. → Animal ID is the farm's own scheme, with an optional official-tag field, plus the DLS-guideline minimum data set (birth place/date, owner, movements, slaughter).
2. **Statutory retention: none.** DLS guideline says "minimum 3 years". Registration form asks the farm to declare its "record-keeping method"; registration validity 5 years (Rule 19) — conflicts with "renew by 31 March every year" on the certificate form (unresolved).
3. **Treatment/withdrawal records matter at slaughter**: Meat Rules 2021 r.10 / Schedule-7 — vet may demand prescription + withdrawal period for any treatment in the **30 days before slaughter**, farm disease history for **6 months**, and records a **tag number** and the animal's **30-day location** on the fitness certificate; r.18 transport card names the farm of origin. **No Bangladeshi withdrawal-period table for cattle exists** — use product labels; residue liability via Safe Food Act s.30 + BFSA MRLs.
4. **Prescriptions**: treatment must be by a BVC-registered practitioner (BVC Act 2019); the farm should hold the prescription for each antibiotic purchase.
5. **Milk**: BSTI BDS 1702:2019 applies only to _pasteurised_ milk — raw-milk sales need no BSTI licence and there is no raw-milk standard. Processors publish no supplier policies; Milk Vita pays on fat content against a dispatch challan. DLS guideline supplies record templates (treatment: 11 fields; procurement: 6; vaccination schedule FMD/anthrax/HS/BQ/brucellosis).

**Not sourced**: full text of Animal Disease Rules 2008 and the notifiable-disease schedule (LSD status unconfirmed); numeric limits of BDS 1702:2019 and milk MRLs; whether "registered physician" covers vets; enforcement of BFSA s.38 and the July 2026 registration regulations against farms; any DLS transport permit for haat/Eid sales (none in law); published Bengal Meat/PRAN/Akij supplier requirements.

Feeds → [Animal identity scheme](./06-animal-identity-scheme.md), [Health, medicine and withdrawal model](./08-health-medicine-and-withdrawal.md), [Audit trail and correction rules](./16-audit-trail-and-correction-rules.md), [Compliance reports and exports](./19-compliance-reports-and-exports.md), [DLS farm registration evidence](./22-dls-farm-registration-evidence.md).
