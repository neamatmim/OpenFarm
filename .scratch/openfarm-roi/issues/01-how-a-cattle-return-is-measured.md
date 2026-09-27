# How a cattle return is measured

Status: done

Assignee: Neamat Khan Mim

Type: research

Blocked by: —

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

Before deciding what a return counts in OpenFarm, find out how cattle fattening and dairy returns are measured by people whose figures the Owner will read beside ours: Bangladeshi livestock economics (BLRI, BAU, DLS, published farm studies), extension guides, and the standard farm-management texts.

- **The measures.** Benefit–cost ratio, gross margin, net return, return on investment, return on capital employed, and return per head or per kg. Say what each divides by what, and which ones Bangladeshi fattening and dairy studies actually report.
- **The money in.** Is it the purchase price plus feed and medicine, or the average capital tied up over the batch (capital × days)? How is a calf bred on the farm valued when nothing was paid for her?
- **What is left out.** How do the studies treat family or hired labour, sheds and equipment (depreciation?), interest on own capital, and manure?
- **Deaths.** How does an animal that died, with cost and no sale, enter a batch's return?
- **Per year.** How is a 3–8 month fattening batch put on an annual basis: simple scaling by days, compounding, or capital-days? Which do lenders and Bangladeshi studies use, and what pitfalls do they name (a short batch scaled up looking better than it is)?
- **Dairy.** How is a dairy cow's or herd's return measured: per lactation, per year, over her life? How are calves and a cull cow's sale valued?

Primary sources first: peer-reviewed Bangladeshi studies, BLRI and DLS publications, FAO and standard farm-management texts.

## Resolution

Researched 2026-09-27 by a background agent. Findings: [`docs/research/measuring-a-cattle-return.md`](../../../docs/research/measuring-a-cattle-return.md), merged to main (641b522). Its "Answer for the ticket" and "What this means for OpenFarm" sections are what the grillings act on. In short:

- **Bangladeshi studies report per head per batch, never per year.** They give gross margin, net return and an undiscounted BCR. None reports a return on capital or a rate a year.
- **A BCR compares badly.** The purchase price dominates it, and the studies label it inconsistently. The figure every source can be turned into is **net return ÷ total cost** (purchase plus everything charged). A Margin over the money in is that figure.
- **The money in is the whole cost, undated**, in every Bangladeshi study. Capital × days appears only in US feedlot closeouts and budgets.
- **A calf bred on the farm is valued at market** when she leaves the herd that bred her (US standard practice), never at nothing. At 0 she credits the dairy herd's calf to the fattening run.
- **Studies charge labour, usually interest, and small depreciation, and count dung as income.** A Margin charges none of the first three, so OpenFarm's figure will read higher than a study's on the same animals. Financial and economic figures must not be mixed.
- **A dead animal stays in the run**, carried by those sold ("deads are in"). A sum of Margins must not be read as a run's return.
- **Per year:** Bangladeshi studies don't annualise, and GIPS forbids annualising under a year. Where others scale, they scale simply over days; compounding inflates a short run badly. An Eid run turns once a year.
- **Dairy** is measured per cow per year, per lactation or per 100 kg of milk. Its returns are milk, calves at market, cull sales, manure and the change in herd value.
- **Typical Bangladeshi fattening:** net return 25–52% of cost per batch of 3.5–4.5 months, BCR 1.25–1.52.
