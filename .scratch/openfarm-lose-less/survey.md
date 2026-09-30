# Where the farm still loses — survey of 2026-09-29

The Owner asked whether the app has every way for the farm to lose less. Baki and calf care were the first gaps chosen
and are merged. This is the second survey, from the code, in four areas. Sizes are rough judgements, not measured.
Claims marked **checked** were confirmed by reading the code; the rest are the survey's own.

## Candidate plans

| #   | Gap                                    | What is missing                                                                                                                                                                                                                                                                                         | Rough size                                         |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A   | **A missing animal, and a head count** | The round's "Animal not found" skip writes nothing and tells nobody (**checked**, `effects/observation.ts:63`). No Missing/Stolen exit; Mortality only died/culled. No regular herd count against the register — only the opening one.                                                                  | One bull ৳1–2 lakh                                 |
| B   | **A sick animal nobody chases**        | A sighting on the round raises work only for a Heat (**checked**). Others sit on the Vet's 14-day list, then drop off; the Manager is never told. Milking's "Unwell" skip writes no sighting. No fresh-cow check (milk fever, retained placenta). No repeat-illness count.                              | Large: late treatment → death or lost lactation    |
| C   | **Feed shrink in taka**                | The weekly count's shortfall is kept in kg, never priced, never reaches the Owner. The count has no trigger (**checked**, `standard-playbook.ts:542`) and no checker; nobody is told when counts stop. No weighed-on-arrival vs slip. No ৳/kg per delivery or price-jump notice. No days-of-feed-left.  | Few % of the feed bill — lakhs a year              |
| D   | **The cow nobody watches**             | No per-cow yield drop against her own recent days (**checked**, no signal found). No "no heat since calving" or "return heat due" watch — she surfaces only at 150 open days on the cull list. No heifer-not-served-by-age. Tank vs Dispatch shown per day, never flagged or kept as a running balance. | Large: each missed heat ≈ 21 days of milk and calf |
| E   | **Who holds the farm's cash**          | No record of who received a Sale's cash or when it reached the farm; no farm cash book. Buying Float is Venture-only — the Farm's own trips carry cash unaccounted. No staff advance with a balance deducted at payday.                                                                                 | Tens of thousands per Eid; ৳10k+ per trip          |
| F   | **Sale broker fee** (a defect)         | CONTEXT.md "Selling Trip" says "A broker's fee for one sale is typed on that Sale"; the `sale` table and `sale.record` have no such field (**checked**). A fee typed by hand becomes an Overhead, not the animal's cost.                                                                                | ৳0.5–2k a head sold                                |

## Smaller or waiting

- Notifiable disease matched on exact words (`health-store.ts:476`, by design): "FMD" vs "Foot and mouth disease" raises no DLS report. A picker or aliases would close it.
- Adult herd vaccination/deworming campaigns have no trigger and no "last vaccinated" view — waits on the Vet's withdrawal days anyway.
- Bought-in dairy animals have no quarantine path (Intake is Fattening-only); release does not check the vaccines were given.
- A dose from a pharmacy (no Prescription) starts no Withdrawal.
- Mortality cause is free text — no deaths by cause, no adult rate.
- Buying price not compared with market or recent buys during the Season; no early-death-by-seller.
- Shrink % at sale; Eid countdown / held past Eid notice; sale price not checked against market low or her cost.
- Milk rejected by the buyer, milk sold under market, semen cost per pregnancy, conception rate by technician.
- Medicine stock never counted; expenses paid twice (same amount, person, day); splitting a bill under the approval line.
- Dairy ration has no per-litre line; ration screen shows no ৳ per head per day.

## Chosen, 2026-09-29

The Owner chose **A, B, C and D**. Plans: `a-missing/`, `b-unwell/`, `c-feed-shrink/`, `d-cow-watch/`, each with its
Owner's decisions. E (cash) and F (sale broker fee) are still open.

**Suggested build order** (small and plumbing first):

1. **A-01** "Not found" is heard — also passes the chosen skip reason into `EffectInput`, which B-02 reuses.
2. **C-02** the count every week (fixes the wrong `stockCount` comment), then **C-01** the shortfall in taka.
3. **B-01** an Observation raises work, then B-02, B-03, B-04.
4. **D-01** research, then D-02, D-04, D-05, D-03.
5. **A-02**, **A-03**; C-03, C-04, C-05; B-05.
6. **A-04** only once the advisers have approved the lost/stolen clause.

## Chosen, 2026-09-30 (the smaller items)

The Owner chose all four groups of the "smaller or waiting" list. Plans: `g-medicine/` (pharmacy dose, disease picker,
medicine count), `h-money-slips/` (duplicates, split bills), `i-selling/` (under cost, shrink, after Eid),
`j-buying-deaths/` (deaths by cause, last buys, early losses by seller). Left on the list: adult campaigns (wait on the
Vet), dairy quarantine, milk rejected/sold under market, semen cost and conception rate, dairy ration ৳ per litre.

**Build order:** G-01 (food safety), G-02, H-01, H-02, I-01, J-01, I-02, I-03, J-02, J-03, G-03.

**Done 2026-10-01:** all eleven — G-01, G-02, G-03, H-01, H-02, I-01, I-02, I-03, J-01, J-02, J-03.
