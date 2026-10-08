# What daily gain to expect from each fattening Ration

**Question:** OpenFarm measures each fattening animal's Average Daily Gain but never says what she should gain. It will put an **Expected Gain** (low–high kg a day) on each fattening Ration's Weight Band, adjust it by breed type and sex, suggest a target weight at Intake (intake weight + Expected Gain × days to the Target Window), and later let the farm's own gains replace the published figures.

What gain should each standard Ration in `packages/domain/src/standard.ts` support for a crossbred bull? By how much do breed type and sex move it? How long after purchase before gain should be judged? What else moves it: shrink, compensatory growth, age and condition, season, worms and fluke? How long do Bangladeshi farms fatten, and to what weight? Which standard references should the Owner's reference page list? (Plan: `.scratch/openfarm-expected-gain/README.md`.)

**Researched:** 29 September 2026. This builds on [`expected-gain.md`](./expected-gain.md), an earlier file written the same day in the `OpenFarm-gain` worktree and not continued. It covers the Bangladeshi trials by breed and weight, the energy equations, compensatory growth, weighing noise and slow-gainer rules, and figures taken from it say so. This file adds a range for each standard Ration, breed and sex factors, a settling-in period, farm periods and weights, and the reference list.

Primary sources read in full:

- **Bangladeshi trials.**
  - Rashid et al. 2015 (JAST A), which the earlier file had in abstract only.
  - Re-checked: Rashid et al. 2015 (LRRD), Siddque et al. 2015, Hossain et al. 2024, Rahman et al. 2009.
  - Also: Rahman et al. 2015 (JAVAR); Papry et al. 2020; Tahira et al. 2022; Mostari et al. 2017; BLRI's research workshop proceedings for 2018 and 2020; Sultana et al. 2017; Roy et al. 2025; Mustafa et al. 2021; Ahmad et al. 2013 (Pakistan).
- **Farm surveys:** Kamal et al. 2019; Hasan et al. 2022; Bhowmik et al. 2025; Mahbubul et al. 2025 (a review).
- **BLRI's own method:** its fattening package in the _Livestock and Poultry Production Technology Guide_ (2023). The text is in the old Bijoy font encoding, decoded by me.
- **Standards:** NRC (1996), corrected chapter 10; University of Arkansas MP391 (tables from NASEM 2016); Feedipedia; the Merck Veterinary Manual on feeding beef cattle (July 2026).
- **Extension:** Beef Cattle Handbook BCH-8020 and BCH-8054; Mississippi State P2577; FutureBeef; Ohio State's _Feedlot Management Primer_; Nebraska BeefWatch; Montana State; the Beef Improvement Federation (BIF) guideline on gain.
- **Cull cows:** Silva et al. 2022; DeClerck et al. 2020.

Read in **abstract only**, and marked so where used:

- **Trials and sex:** Joya 2026 (via the earlier file); Haque 2016; the BAU "Megavit-DB" trial; Santiago 2023; da Costa Gomes 2024; Maier 2011.
- **Energy, transport, heat:** Salah 2014; Alam 2010 and 2018; Islam 2024; Chang-Fung-Martel 2021; Azevedo 2024.
- **Parasites:** the eight fluke and worm papers in §8.

Moletta 2014 and Dadi 2023 were read only through a summarizing fetch. Figures a read source quotes from another are marked **[SECONDARY]**. Anything I worked out is **(my arithmetic)**, including every energy prediction in §3.

**Not reached:** NASEM (2016) itself, whose reader serves an automated reader only the front matter (NRC 1996 carries the same equations); ICAR (2013), which is sold, not online; NRC (1981)'s temperature tables; any DLS fattening guide (none found); the Agriculture Information Service fattening pages ("page not found"); Jabbar 2009; Oklahoma State E-974.

---

## Answer

1. **No Bangladeshi, DLS, BLRI, FAO or Merck source states an expected daily gain for a fattening ration.** BLRI's official package (2023) runs 90–120 days on thin cattle of 2–5 years, with concentrate at 0.8–1.0% of body weight. It gives no gain figure. Every range below is built from trials and energy arithmetic.
2. **The standard Rations feed concentrate at 1.2–1.45 kg as fed per 100 kg of body weight, 45–55% of the dry matter** (my arithmetic, §1). That is level with the best-fed ordinary Bangladeshi trials (Siddque 2015, 1.5% of live weight) and below the high-concentrate ones (Rashid 2015, 55–100%).
3. **A crossbred bull on these Rations should gain about 0.6–0.9 kg/d at 150–250 kg, 0.65–1.0 at 250–500 kg, and less past 500 kg** (the table below).
   - The low ends follow the NRC energy arithmetic, which gives 0.58–0.82 kg/d at mid-band.
   - The high ends follow the Bangladeshi crossbred trials: 0.87–1.17 kg/d (Siddque 2015; Rashid 2015, two trials).
4. **Gain rises with weight up to about 350–500 kg on these Rations, then falls.** The heavy-bull Ration supports about a fifth less than finisher 2 (0.65 against 0.82 kg/d at mid-band, my arithmetic), because intake falls to 2.0% of weight and heavier gain is fatter. In deshi bulls, gain rose with weight up to about 300 kg in both BLRI age trials.
5. **Breed.**
   - **Deshi and the local breeds:** about **0.7** of a crossbred's gain on these Rations. That is chosen so the ranges cover the deshi trials at 150–350 kg. It runs low at 100–150 kg, where Red Chittagong bulls gained 0.51–0.64. One same-ration trial gave 0.42–0.60 (Siddque 2015); BLRI's selected Pabna line gave 0.81 against a Brahman cross.
   - **Dairy crosses and Brahman crosses:** **1.0** each. No Bangladeshi trial fed the two on one ration.
6. **Sex.**
   - A castrate gains about **0.85** of an entire bull (0.84–0.88, two Brazilian trials).
   - A heifer or young female gains about **0.8** (0.75–0.92 in Bangladeshi beef-cross calves; 0.72–0.76 chained from US feedlot closeouts).
   - A thin cull cow's gain is quick and front-loaded ("most of compensatory gain occurred during the first 28 d"). No South Asian trial exists, so any factor for her is a placeholder.
   - 86–100% of Bangladeshi fattening animals are entire bulls (three surveys).
7. **Do not judge gain for 21 days after arrival.**
   - Transport shrink is 2–10% of body weight and takes 1–3 weeks to regain. Iowa's hauled cattle took 13–16 days.
   - Stepping up to grain takes at least 3 weeks (Merck; Montana; Nebraska).
   - BIF asks for 21 days of acclimation before a gain test.
   - Bangladeshi trials settled bulls for 7–15 days, after deworming.

   **The first 3 weeks read wrong in either direction.** From a haat weight they read near zero. From a weight taken off the lorry they read high while the gut refills.

8. **Thin animals and the season.**
   - A thin bull gains faster at first. That is the whole point of BLRI's package: "compensatory growth" from thin deshi cattle, fed richest for the first 45–60 days. His first 4–8 weeks will overstate what he will do later.
   - Heat costs about 0.2 kg/d on these Rations by the NRC factors (my arithmetic). Most Bangladeshi trials were run in the hot months, so their gains already carry some of that.
9. **Worms and fluke.** Every Bangladeshi trial dewormed first, so the ranges are for dewormed bulls. Published effects run from 0.04 to 0.14 kg/d. _F. gigantica_ is reported in about 80% of Bangladeshi livestock, and resistance to the common drugs is reported on farms.
10. **Periods and weights.** Farms fatten mostly 3–6 months, most commonly 4, buying 3–6 months before Eid-ul-Adha. In the one survey that gives weights, 91% went in at 100–250 kg and 94% came out at 150–450 kg. **No published target weight exists**; buyers price by size.

---

## Recommended defaults

### Expected Gain for a crossbred entire bull on the standard Rations (kg a day)

| Ration (band)                | Low  | High | What it rests on                                                                                                                                                                                                                                  | Confidence |
| ---------------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Calf ration (under 100 kg)   | 0.35 | 0.55 | Holstein-cross calves 0.35–0.42 from birth to 6 months on farms (Rahman 2015). L×HF bull calves of 78 kg 0.36–0.53 (Joya 2026, abstract). Red Chittagong at 58–86 kg 0.44–0.51 (Roy 2025)                                                         | Medium-low |
| New arrival (any weight)     | —    | —    | Not judged: the first 21 days are settling in. The Ration itself supports only 0.2–0.5 kg/d (my arithmetic, §3)                                                                                                                                   | —          |
| Bull starter (100–150 kg)    | 0.5  | 0.8  | NRC energy 0.50–0.65, protein 0.43–0.72 (my arithmetic). Red Chittagong at 109–117 kg 0.51–0.64 (Hossain 2024). Emaciated bulls at 109 kg 0.57–0.80 with 10–30% concentrate (Rahman 2009). No crossbred trial in this band                        | Low        |
| Bull grower (150–250 kg)     | 0.6  | 0.9  | NRC energy 0.52–0.72, Brahman cross 0.77 (my arithmetic). L×Brahman 176→298 kg 0.96–0.98 on a richer ration (Rashid 2015, JAST). Brahman cross 0.79 at 1.2% LW concentrate (Quang 2015, Vietnam). Mustafa's tape-measured 0.31–0.35 left out (§2) | Medium-low |
| Bull finisher 1 (250–350 kg) | 0.65 | 1.0  | NRC energy 0.62–0.76, Brahman cross 0.84 (my arithmetic). L×HF 219–287 kg on concentrate at 1.5% LW 1.01–1.17 (Siddque 2015). L×Brahman from 343 kg 0.87 on half concentrate (Rashid 2015, LRRD). BLRI "700–900 g" at 300 kg **[SECONDARY]**      | Medium     |
| Bull finisher 2 (350–500 kg) | 0.7  | 1.0  | NRC energy 0.74–0.89, Brahman cross 0.98 (my arithmetic). L×Brahman 343→427–433 kg 0.87–0.95 (Rashid 2015, LRRD). No Bangladeshi trial above about 430 kg                                                                                         | Medium-low |
| Heavy bull (500 kg +)        | 0.55 | 0.85 | NRC energy 0.62–0.72, Brahman cross 0.80 (my arithmetic). **No Bangladeshi trial.** Intake falls to 2.0% of weight and the gain is fatter                                                                                                         | Low        |

**How the ends were chosen (my reasoning).**

- **Low** is what a healthy, settled, dewormed crossbred bull eating the Ration in full should rarely fall under. It sits at or somewhat under the NRC prediction for the middle of the band.
- **High** is what good crossbreds reached in Bangladeshi trials on similar concentrate. It is capped near 1.0 kg/d, because the only higher figure (Siddque's 1.17) comes from one trial of five bulls. Under 150 kg no crossbred trial exists, and the high end comes from thin bulls on concentrate (Rahman 2009).

These are starting points. The farm's own gains replace them (step 4).

### Breed factor (multiply both ends)

| Breed type (from the farm's breed list)                                                  | Factor | Range      | Confidence | Why                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------ | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crossbred: Holstein-Friesian, Sahiwal and Jersey crosses, Brahman cross                  | 1.0    | —          | Medium-low | The table above is for them. No trial separates dairy from Brahman crosses; the NRC arithmetic would give a Brahman cross about a fifth more, from maintenance alone                                                                                         |
| Deshi (local) and the local breeds: Red Chittagong, Pabna, North Bengal Grey, Munshiganj | 0.7    | 0.55–0.8   | Medium-low | With 0.7 the ranges cover the deshi trials at 150–350 kg (0.45–0.60). At 100–150 kg Red Chittagong reached 0.51–0.64, above the 0.35–0.56 it gives. Same-ration ratios were 0.42–0.60 (Siddque) and 0.81 (BLRI's Pabna line). Deshi bulls seldom pass 350 kg |
| Pure dairy breeds: Holstein-Friesian, Jersey, Sahiwal, Red Sindhi                        | 1.0    | unmeasured | Low        | No fattening trial found. NRC's Holstein maintenance (1.2) would cut a pure Holstein bull to about 0.8 of a cross (my arithmetic). Use 1.0 until the farm's own gains say otherwise                                                                          |

### Sex factor (multiply both ends)

| Sex                  | Factor | Range     | Confidence  | Why                                                                                                                                                         |
| -------------------- | ------ | --------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entire bull          | 1.0    | —         | —           | The Bangladeshi default (86–100% of fattened animals)                                                                                                       |
| Castrate             | 0.85   | 0.84–0.88 | Medium      | Two Brazilian trials (Moletta 2014; Santiago 2023), and a Beefalo-cross trial by slaughter weight. None Bangladeshi                                         |
| Heifer, young female | 0.8    | 0.72–0.92 | Medium      | Bangladeshi calves: 0.80 (Papry 2020); median 0.84 in BLRI's crosses. US heifers against bulls: 0.72–0.76, chained                                          |
| Cull cow             | 0.8    | —         | Placeholder | No South Asian trial. A thin cow gains fast in her first 4–8 weeks and then slows, so a flat factor misreads her both ways. Her own Weigh-ins should decide |

### Settling-in and the suggested target weight

- **Settling in: 21 days** from Intake before any gain is judged. This is already `SETTLING_IN_DAYS` in `packages/domain/src/expected-gain.ts`. After that, judge over at least 28 days.
  - The sources would support 28 days for three cases:
    - hauls of 16 hours or more, which take 16–24 days to recover [SECONDARY, Fox 1985 via Ohio State];
    - bulls bought at a haat in the hot months;
    - bulls that arrive sick or very thin.
- **Suggested target weight (my arithmetic, a suggestion for step 3):** intake weight + Expected Gain × (days to the Target Window − 21 settling days), stepping to the next band's range as the weight crosses it.
  - An Intake weight taken off the lorry is shrunk. Refilling it adds back roughly what the settling days would have grown: 7% of 200 kg is 14 kg, against 21 days × 0.65 kg/d ≈ 14 kg. So "intake weight + gain × all the days" gives nearly the same answer for a typical haul.
  - An Intake weight taken at the haat, before the haul, should leave the 21 days out.
- **Worked example (my arithmetic):** a 180 kg crossbred bull comes in 120 days before his Target Window, which leaves 99 days after settling.
  - Low: 0.6 kg/d throughout gives 180 + 59 = **239 kg**.
  - High: 0.9 kg/d reaches 250 kg after 78 days, then 21 days at 1.0 kg/d gives about **271 kg**.
  - The suggestion is therefore **239–271 kg**. A deshi bull (× 0.7) comes to 222–242 kg.

---

## 1. What the standard Rations are

This table is worked from the lines in `standard.ts` and the feed values its note gives: napier 17% DM and 10.5% CP; rice straw 92% and 4%; crushed maize 89% and 9.5%; wheat bran 89% and 15.5%; mustard cake 92% and 36%; pulse husk 89% and 16.7%. ME is from Feedipedia (§3). **All of it is my arithmetic.**

| Ration (band)                | DM offered, % of live weight | Concentrate, % of DM | Concentrate as fed, kg per 100 kg | CP, % of DM | ME, MJ/kg DM |
| ---------------------------- | ---------------------------- | -------------------- | --------------------------------- | ----------- | ------------ |
| New arrival (any weight)     | 2.51                         | 30                   | 0.85                              | 11.1        | 8.5          |
| Bull starter (100–150 kg)    | 2.91                         | 45                   | 1.45                              | 13.7        | 9.4          |
| Bull grower (150–250 kg)     | 2.72                         | 45                   | 1.35                              | 12.8        | 9.3          |
| Bull finisher 1 (250–350 kg) | 2.48                         | 49                   | 1.35                              | 11.7        | 9.4          |
| Bull finisher 2 (350–500 kg) | 2.28                         | 55                   | 1.40                              | 12.0        | 9.9          |
| Heavy bull (500 kg +)        | 1.99                         | 54                   | 1.20                              | 11.0        | 9.7          |

"Concentrate" here means maize, bran, mustard cake and pulse husk; minerals and salt are left out. This confirms the note in `standard.ts`: intake falls from 2.9% to 2.0%, concentrate is 45–55%, and crude protein falls from 13.7% to 11%.

**How they compare with the trials:**

- above Sultana 2017 (concentrate at 1% of live weight, Pabna bulls 0.29–0.60 kg/d);
- above BLRI's package (0.8–1.0%);
- level with Siddque 2015's improved groups (1.5%, a third of the dry matter) and Quang 2015's 1.2% group;
- below Rashid 2015's calf trial (55–75% of the dry matter, 10.5 MJ ME, 14.5% CP).

## 2. The Bangladeshi trials by band

Deshi-only trials are in [`expected-gain.md`](./expected-gain.md) §1.1. Weights are live weight.

| Band    | Study                                     | Animals                                       | Start → end (kg)          | Days              | Ration                                                                            | Daily gain (kg)                            |
| ------- | ----------------------------------------- | --------------------------------------------- | ------------------------- | ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| < 100   | Rahman et al. 2015, JAVAR 2(4)            | 53 Holstein-cross calves (62.5–75% HF), farms | birth → 6 months (94–106) | about 180         | Farm feeding                                                                      | 0.35 (75% HF) / 0.42 (62.5% HF)            |
| < 100   | Joya et al. 2026 (abstract; earlier file) | 21 L×HF bull calves                           | 78                        | 75                | Isoenergetic, 10.1–12.5% CP                                                       | 0.36 → 0.53 as CP rose                     |
| 100–150 | Hossain et al. 2024 (BLRI)                | 18 Red Chittagong bulls, 15–18 months         | 109–117 → 155–175         | 90 (+15 settling) | German grass + 20 / 30 / 40% concentrate                                          | 0.51 / 0.64 / 0.56                         |
| 100–150 | Rahman et al. 2009                        | 12 emaciated bulls, breed not stated          | 109                       | 70 (+7)           | UMS + grass + 0 / 10 / 20 / 30% concentrate                                       | 0.16 / 0.57 / 0.66 / 0.80                  |
| 150–250 | Rashid et al. 2015, JAST A 5(4)           | 12 L×Brahman bull calves, 11.5 months         | 176 → 295–298             | 124 (incl. 10)    | 75:25 / 65:35 / 55:45 concentrate : roughage; 14.5% CP, 10.5 MJ ME; DM at 2.8% LW | 0.98 / 0.96 / 0.98                         |
| 150–250 | Mustafa et al. 2020, 2021 (earlier file)  | L×HF and L×Sahiwal bulls, 19–20 months        | 169–213                   | 120 (2021)        | Concentrate / concentrate + UMS / grass                                           | 0.31–0.35, **weighed by heart-girth tape** |
| 150–250 | Quang et al. 2015 (earlier file; Vietnam) | 20 Brahman-cross bulls                        | 190–200                   | 84                | Grass + straw + concentrate at 0.6 / 1.2 / 1.8% LW                                | 0.59 / 0.79 / 0.84                         |
| 250–350 | Siddque et al. 2015                       | 20 L×HF bulls, 24 months                      | 219–287 → 340–405         | 120               | Straw + grass + concentrate 1.5% LW (conventional: bran and rice polish only)     | 1.01 / 1.01 / 1.17 (conventional 0.45)     |
| 250–350 | BLRI, via a 2014 blog **[SECONDARY]**     | Growing bulls                                 | 300                       | —                 | UMS ad lib + concentrate 0.8–1.0% LW                                              | "700–900 g"                                |
| 350–500 | Rashid et al. 2015, LRRD 27(5)            | 12 F1 L×Brahman bulls, 18.5–21.5 months       | 343 → 427–433             | 90 (+10)          | All concentrate / half concentrate + half UMS / UMS alone                         | 0.95 / 0.87 / 0.21                         |
| 500 +   | —                                         | —                                             | —                         | —                 | No trial found                                                                    | —                                          |

Notes:

- **Rashid 2015 (JAST), read in full.**
  - It ran at DLS's Central Cattle Breeding and Dairy Farm, Savar, from 18 June to 19 October 2012.
  - The bulls were dewormed, then "adjusted to experimental diets for 10 d", and weighed every 10 days.
  - The rations were formulated "expecting of daily gains 1.0 kg/animal". Intake was 6.5–6.9 kg DM a day.
  - The ratio of concentrate to roughage did not change gain (P = 0.90). The 55:45 ration was cheapest per kg gained (৳136.8 against ৳153.8).
  - Its introduction gives 100–200 g/d for young indigenous cattle on traditional feeding and 300–800 g/d on improved feeding [SECONDARY].
- **Siddque 2015's bulls** were kept by 40 NGO-trained women in Sirajganj from May 2013, and weighed only at the start and end. Pooled over rations, indigenous bulls gained 0.416 kg/d and crossbreds 0.911.
- **Rahman 2015 (JAVAR):** male calves gained 0.366 kg/d and females 0.399, not significantly different. The authors say farmers "give priority to female calves".
- **The 700–900 g figure** is a 2014 post by Dr Sakhawat Hossain on vetsbd.com, attributed to "BLRI research" without a paper. BLRI's own 2023 guide gives the same concentrate allowance but no gain.
- **Five of the trials ran through the hot, humid months:** Rashid JAST June–October; Rashid LRRD April–July; Siddque from May; Hossain April–June; Rahman 2009 July–September.

## 3. What the Rations should support, by the energy equations

**This whole section is my arithmetic.**

**Energy of the feeds.** From Feedipedia, one table page per feed, read in full: napier (elephant grass) 8.2 MJ ME/kg DM; rice straw 5.8; maize grain 13.6; wheat bran 11.0. Feedipedia gives no ME for mustard cake, so rapeseed expeller (13.1) stands in. Chickpea bran (8.7) stands in for pulse husk.

**Equations.** NRC (1996) corrected chapter 10, read in full; these are the equations NASEM (2016) keeps.

- **Maintenance:** NEm = 0.077 × SBW^0.75, × 1.15 for bulls. SBW is shrunk body weight.
- **Breed factors:** 0.90 for Brahman, Sahiwal and Nellore; 1.20 for Holstein.
- **Gain:** SWG = 13.91 × RE^0.9116 × EQSBW^−0.6837, where SWG is shrunk weight gain, RE is retained energy, and EQSBW = SBW × 478 ÷ the animal's finish weight.
- **Heat:** intake × 0.90 at 25–35 °C; maintenance × 1.07 when panting.

**Assumptions:**

- the Ration is eaten in full;
- full-weight gain = shrunk gain ÷ 0.96;
- breed factor 1.0 for a Holstein × local cross, for which NRC gives none;
- finish weight 500 kg for a crossbred, 350 kg for a deshi bull, 550 kg for a Brahman cross;
- protein split by assumed escape shares: napier 0.25, straw 0.30, maize 0.55, bran 0.29, cake 0.28, husk 0.30.

**Check.** Salah et al. 2014 (abstract only) is a meta-analysis of warm-climate data. It gives maintenance of 631 kJ ME per kg LW^0.75 a day, and 24.3 kJ ME per g of gain.

| Ration          | Crossbred bull: low / mid / high weight    | Deshi, mid | Brahman cross, mid | Holstein-type, mid | Protein allows, crossbred, mid |
| --------------- | ------------------------------------------ | ---------- | ------------------ | ------------------ | ------------------------------ |
| New arrival     | 0.22 / 0.37 / 0.48 (at 150 / 250 / 350 kg) | —          | —                  | —                  | 0.76                           |
| Bull starter    | 0.50 / 0.58 / 0.65                         | 0.53       | 0.72               | 0.41               | 0.57                           |
| Bull grower     | 0.52 / 0.63 / 0.72                         | 0.57       | 0.77               | 0.47               | 0.87                           |
| Bull finisher 1 | 0.62 / 0.70 / 0.76                         | 0.62       | 0.84               | 0.54               | 1.16                           |
| Bull finisher 2 | 0.74 / 0.82 / 0.89                         | 0.72       | 0.98               | 0.67               | 2.06                           |
| Heavy bull      | 0.62 / 0.65 / 0.72 (at 500 / 550 / 650 kg) | 0.59       | 0.80               | 0.49               | > 2.5                          |

What it says:

1. **Energy limits gain from 150 kg up.** On the bull starter, protein (0.43–0.72 kg/d across the band) limits about as much as energy.
2. **Degradable protein runs short from finisher 1 on.** It falls about 2–3%, 5% and 13% under what the rumen could use for finisher 1, finisher 2 and heavy. Total protein still covers the need. The heavy Ration's 0.1 kg of mustard cake per 100 kg is thin.
3. **Feed conversion at mid-band** worsens as the bull grows: 6.3, 8.6, 10.7, 11.8 and 16.7 kg DM per kg of gain.
4. **Heat** (intake × 0.9, maintenance × 1.07) takes about 0.2 kg/d off every band, 30–38%.
5. **A thin bull** (condition 3 of 9) gains about 0.09 kg/d more, 12–15%.
6. **Salah and NRC disagree at both ends.** Salah prices every kilo of gain alike, so it runs high for heavy bulls. Its higher maintenance puts it under NRC below 200 kg.
7. **MP391's NASEM tables agree at 227–318 kg:** a TDN of 61–65% supports about 0.5–0.7 kg/d.
8. **Against the trials:**
   - NRC fits deshi bulls: 0.53–0.72 predicted, 0.45–0.64 found.
   - It is conservative for good crossbreds: 0.58–0.82 predicted, 0.87–1.17 found.
   - It is far above Mustafa's tape-measured 0.31–0.35.

## 4. Breed

Each factor is gain ÷ the comparison animal's gain on the same ration **(my arithmetic)**.

| Comparison                                                                               | Factor                                        | Source                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Indigenous ÷ L×HF bulls, same improved rations, 120 days                                 | 0.42–0.45                                     | Siddque 2015                                                           |
| Indigenous ÷ L×HF bulls, conventional ration                                             | 0.60                                          | Siddque 2015                                                           |
| BCB-1 (BLRI's selected Pabna line) ÷ Brahman × BCB-1 males, birth to 12 and to 24 months | 0.81                                          | BLRI Annual Research Review Workshop 2018, Mostari et al.              |
| The same, 68-day finishing trial at 18–24 months, 55:45 grass : concentrate              | 1.2 (0.78 against 0.65 kg/d, not significant) | Same. The authors say BCB-1 "had some compensatory growth effect"      |
| Red Chittagong ÷ Holstein-cross bull calves, 98 days                                     | 0.75                                          | BAU "Megavit-DB" trial (**abstract only**)                             |
| 25% ÷ 50% Brahman-cross calves                                                           | 0.93                                          | Haque et al. 2016 (**abstract only**; the abstract contradicts itself) |
| Pabna ÷ Red Chittagong bulls, 24 months, concentrate 1.25% LW                            | 1.59 (0.709 against 0.447 kg/d)               | Roy et al. 2013 **[SECONDARY]**, via Siddque 2015                      |
| Dhanni / Lohani / Cholistani ÷ Friesian × Sahiwal, 120 kg calves, 120 days (Pakistan)    | 0.99 / 0.84 / 0.72                            | Ahmad et al. 2013. Pakistani zebu are far bigger than deshi            |

- **Dairy against Brahman crosses.** Nothing measured separates them.
  - The trials give L×HF 1.01–1.17 (Siddque) and L×Brahman 0.87–0.98 (Rashid), on different rations and at different weights.
  - NRC's lower maintenance for _Bos indicus_ would favor the Brahman cross by about a fifth. No trial has shown it.
- **Within a type, the sire alone** moved calf gain twofold: 0.36–0.72 kg/d by sire in one 50% Brahman population (Tahira 2022).
- **Native cattle convert feed better** even where they gain more slowly. BCB-1 took 7.8 kg DM per kg of gain against 11–12 for the crosses (BLRI 2018).
- **Mature size caps deshi bulls.** BLRI's 2-year weights were 356 kg for BCB-1 against 417 kg for Brahman crosses and 487–542 kg for European-beef crosses (BLRI 2020, three animals each). Red Chittagong males mature near 342 kg ([`expected-gain.md`](./expected-gain.md) §1.1).

## 5. Sex

**Bangladeshi fattening is of entire bulls.**

| Survey       | Entire bulls | Other                                                                                                                     |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Kamal 2019   | 86.3%        | The rest castrated                                                                                                        |
| Hasan 2022   | 88.89%       | "nobody reared cows or heifers for fattening"                                                                             |
| Bhowmik 2025 | 100%         | Buyers "consider castrated cattle less desirable for ceremonial slaughter" and "treated the castrated bull as a deformed" |
| Hashem 1999  | —            | 5.2% of farmers fattened females **[SECONDARY]**, via Mahbubul 2025                                                       |

**No Bangladeshi trial compares castrates or fattened cows with bulls.**

| Comparison                                                  | Figures                                                 | Factor (my arithmetic)                       | Source                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Steer ÷ bull, Purunã composite, 116 days (Brazil)           | 1.12 against 1.33 kg/d; feed conversion 7.6 against 6.6 | 0.84                                         | Moletta et al. 2014 (read through a summary)                      |
| Steer ÷ bull, Angus × Nellore, 180 days                     | 1.38 against 1.60 kg/d                                  | 0.86                                         | Santiago et al. 2023 (**abstract only**)                          |
| Female ÷ male, 25% Brahman calves, birth to 12 months       | 0.338 against 0.422 kg/d (422 calves)                   | 0.80                                         | Papry et al. 2020. From 9 months, weights by body-measure formula |
| Female ÷ male, five BLRI beef genotypes, birth to 24 months | 0.39–0.61 against 0.46–0.74 kg/d                        | 0.75–0.92, median 0.84                       | BLRI 2018, Mostari et al. (2–8 animals a group)                   |
| Female ÷ male, Holstein-cross calves, birth to 6 months     | 0.399 against 0.366 kg/d, not significant               | 1.09                                         | Rahman et al. 2015 (farmers favored heifer calves)               |
| Heifer ÷ steer, Kansas feedlot closeouts, 1985–91           | 2.66–2.84 against 3.12–3.30 lb/d                        | 0.85–0.88; × 0.84–0.86 = 0.72–0.76 of a bull | Williams et al., Beef Cattle Handbook BCH-8054                    |

**Cull cows.**

- Zebu cull cows of 318 kg, about nine years old, gained **1.0–1.2 kg/d** over 105 days on an 80% concentrate ration, including 15 days of adaptation (Silva et al. 2022).
- Thin US beef cull cows (condition 2.1 of 9) gained **2.94 kg/d to day 28**, falling to 2.60 by day 56. The authors: "most of compensatory gain occurred during the first 28 d" (DeClerck et al. 2020).
- Thin Holstein culls that were lame, or had leukosis, gained little and lost money (Maier et al. 2011, abstract).

## 6. The first weeks: shrink, step-up and compensatory growth

**Shrink.**

- **Rate** (Mississippi State P2577): "about 1 percent per hour for the first 3 to 4 hours and then roughly 0.25 percent per hour for the next 8 to 10 hours". Feeder cattle commonly lose 2–8%. About 65% is feces and 28% urine.
- **By hours in a truck** (Brownson, BCH-8020): 5.5% at 8 hours, 7.9% at 16 and 8.9% at 24. Cattle bought at a sale yard shrank 9.1%, against 7.2% for those bought from the rancher. "Bulls usually shrink substantially because of travel-related stress."
- **With recovery time** (Ohio State primer, after Fox 1985 **[SECONDARY]**):
  - 2–8 hours: 4–6% lost, 4–8 days to recover;
  - 8–16 hours: 6–8%, 8–16 days;
  - 16–24 hours: 8–10%, 16–24 days.
- **Recovery:**
  - Iowa: after a 660-mile haul, "the yearlings required an average of 16 days and the calves 13 days to recover the weight loss" (BCH-8020).
  - Mississippi: "Typically it takes 1 week or less", up to 30 days.
  - FutureBeef: "generally 10 to 21 days".
- **Bangladesh.** Benapole to Chittagong, about 648 km, took 13.8 hours "fasting in the vehicle" (Alam et al. 2018, abstract). At market in April, 72% of cattle were dehydrated (Alam et al. 2010, abstract). **No Bangladeshi study weighed shrink.**

**Step-up and intake.**

- **Merck:** a receiving ration of about 35% roughage, and adaptation to grain "≥ 3 weeks".
- **Nebraska:** week-one intake is 1.0–1.5% of body weight; "a 21- to 28-day transition or 'step-up' period is often required".
- **Montana State:** "not recommended to conduct a series of step-up rations shorter than 21 days".
- **Ohio State:** "On day one … only 22% of the calves may eat."
- **BIF:** "an acclimation period of at least 21 days" before a gain test.
- Bangladeshi trials settled bulls for 7 days (Rahman 2009), 10 days (Rashid, twice), 14 days (Mustafa 2021) and 15 days (Hossain 2024; Roy 2025).

**What shrink does to a gain figure (my arithmetic).** Take a 300 kg bull that lost 7%, 21 kg.

- **Weighed at the haat:** he makes back no net weight for about a fortnight. A true 0.7 kg/d reads as 0.35 over his first 28 days.
- **Weighed off the lorry:** the refill adds up to 1.5 kg/d to his first fortnight. Dahmer et al. 2022 found 1.3–1.5 kg/d over days 0–14 on arrival weights.

**Compensatory growth.** [`expected-gain.md`](./expected-gain.md) §5 has Keogh 2016: 2.6 kg/d against 1.3 kg/d for 55 days after restriction. Added here:

- **BLRI's package is built on compensatory growth.** Its core feature, in its own words, is "profitable meat production from undernourished deshi cattle by using 'compensatory growth'". It says to buy cattle of 2–5 years, "undernourished or weak but not diseased", and to feed the richest ration "for at least 45–60 days after purchase", cutting back in the last days (all my translation).
- DeClerck's thin cows gained most in their first 28 days (§5).
- In the energy arithmetic, condition 3 of 9 adds 12–15% (§3).
- **For the app:** a thin bull's first 4–8 weeks after settling may run above the range. The range should not be raised on them.

**Gain slowing towards finish.**

- Hossain 2024's Red Chittagong bulls gained "at an increasing rate" early and "at a decreasing rate" later in 90 days.
- In Ethiopia, gain fell from 1.11 to 1.06 to 1.02 kg/d over the first, middle and last parts of a 90-day run (Dadi 2023, read through a summary).
- The energy arithmetic puts the fall past 500 kg (§3). Below that, gain rose with weight in the BLRI age trials.

## 7. Age and condition at arrival

| Study                     | Animals                                          | Age → daily gain (kg)                                                                  | Feed conversion                      |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Sultana et al. 2017, BLRI | Pabna bulls, silage + concentrate 1% LW, 72 days | 6–12 months (98 kg) 0.294; 13–24 months (183 kg) 0.519; 25–36 months (288 kg) 0.597    | 10.9 / 10.1 / 12.2, not different    |
| Roy et al. 2025, BLRI     | Red Chittagong bulls, 90 days                    | 9–10 months (58 kg) 0.44; 15–16 (86 kg) 0.51; 21–22 (112 kg) 0.55; 27–28 (160 kg) 0.59 | 5.0 / 6.8 / 6.5 / 8.8 (oldest worse) |

- **In local bulls up to about 300 kg, older and heavier bulls gain more a day, while feed per kg gained stays level or worsens.** This is why the bands rise with weight.
- **Farm practice buys older animals.**
  - BLRI's package: 2–5 years.
  - Bhowmik 2025: 96% of animals 1.5–3 years.
  - Hasan 2022: bulls of about 250 kg at 2.5–3 years.
  - [SECONDARY, via Sultana 2017] Pabna bulls of 24–36 months "may earn more profit" than younger ones.
- **No Bangladeshi trial compares body condition at intake.** Emaciated 109 kg bulls on 10–30% concentrate gained 0.57–0.80 kg/d (Rahman 2009). Well-kept Red Chittagong bulls of 112 kg gained 0.55 (Roy 2025). Different breeds and trials, so this is not a controlled comparison.

## 8. Season and health

**Heat.**

- **In Bangladesh, heat stress is expected "when THI for ruminant rearing exceeds 74, particularly from February to December".** THI peaks near 90 in June in the west-central region (Islam et al. 2024, abstract, 1995–2022 weather data).
- **On intake:** "DMI reduced by 0.45 kg/day for every unit increase in THI" (Chang-Fung-Martel et al. 2021, abstract). The data are mostly dairy; do not apply the slope to bulls directly.
- **Shade:** full shade improved gain and feed conversion in a meta-analysis of 6,729 feedlot cattle (Azevedo et al. 2024, abstract; no kg figure). Shade or cooling raised gain from 0.88 to 0.94–0.98 kg/d ([`expected-gain.md`](./expected-gain.md) §6.1).
- **In the energy arithmetic (§3)**, heat takes about 0.2 kg/d off these Rations.
- **The trials already carry heat.** The Bangladeshi crossbred gains in §2 were mostly measured from April to October. Do not cut the ranges again for the hot months; read a hot-month shortfall with that in mind.
- **Winter.** BLRI's package says feed need rises in winter, and bulls must be kept out of cold wind.
- **When the Target Window falls.** Eid-ul-Adha moves about 11 days earlier each year: about 16 May 2027, 5 May 2028, 24 April 2029, 13 April 2030 (calculated dates from calendar sites **[SECONDARY]**; Bangladesh follows its own moon sighting). A 120-day Season will run from about January, and finish in the pre-monsoon heat.

**Worms and fluke.**

| Study                                       | What                                                     | Effect on gain                                                                         |
| ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Wamae et al. 1998 (abstract), Kenya         | Experimental chronic _F. gigantica_                      | Infected Boran cattle gained 22 kg less over 23 weeks, about 0.14 kg/d (my arithmetic) |
| Hamel et al. 2024 (abstract)                | _F. hepatica_, pooled from 7 trials                      | Treated cattle gained "almost 15% more" over 8 weeks, about 0.12 kg/d (my arithmetic)  |
| Suhardono et al. 1991 (abstract), Indonesia | Natural _F. gigantica_, treated every 8 weeks for a year | "no differences" in gain; the infections were light                                    |
| Keyyu et al. 2009 (abstract), Tanzania      | Worms plus _F. gigantica_, albendazole 2–4 times a year  | 14.8–17.7 kg more over 13 months, about 0.04 kg/d (my arithmetic)                      |
| Baltzell et al. 2015 (earlier file)         | Deworming, US stocker calves, 23 studies                 | +0.05 kg/d                                                                             |
| Jacob et al. 2015 (abstract), India         | HF × Haryana calves of 80 kg with _F. gigantica_         | Gain and feed conversion worse; no figure                                              |

**In Bangladesh:**

- _F. gigantica_ "affects around 80% livestock of Bangladesh", with laboratory signs of triclabendazole resistance (Hasan et al. 2022, _Parasitology_, abstract).
- Gut worms were resistant to albendazole, levamisole and ivermectin on all ten Mymensingh farms tested; on one farm the ivermectin resistance was only suspected (Khatun et al. 2025, abstract).
- The odds of fluke rise with age: 5.2× at 1–3 years and 6.1× at 3–8 years, against yearlings (Khan et al. 2017, abstract). The 2–3-year bulls farms buy are the likeliest to carry it.
- **No Bangladeshi deworming trial with a weight result was read.**

**What this means for the ranges.** BLRI's package deworms every animal together straight after purchase, and every Bangladeshi trial here dewormed before starting. The ranges are for dewormed bulls. A bull under his range after settling is worth a dung test before anyone blames the Ration.

## 9. How long Bangladeshi farms fatten, and to what weight

| Source                                                         | Sample                             | Fattening period                                                                                             |
| -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BLRI Technology Guide 2023, fattening package                  | —                                  | "designed for 90 to 120 days" (my translation)                                                               |
| Kamal et al. 2019, SAARC J. Agric. 17(1)                       | 80 farmers, 2017                   | 3 months or less 16.3%; **3–6 months 35%**; 6–12 months 31.3%; over a year 17.5%. 30% fatten only before Eid |
| Hasan et al. 2022, Meat Research 2(2)                          | 45 farmers, Rangpur, 2020          | Cattle "bought by the farmers usually 3–6 months before Eid-ul-Adha"; 57.78% fatten only before Eid          |
| Bhowmik et al. 2025, WJARR 28(2)                               | 60 farmers, 100 cattle, north-east | 3 to 8 months; **4 months the commonest (31%)**, then 7 months (28%)                                         |
| Mahbubul et al. 2025, Bangladesh J. Anim. Sci. 54(1), a review | —                                  | "just three to four months before Eid-ul-Azha"                                                               |
| Sarma & Ahmed 2011; Sarma et al. 2014; Ferdush et al. 2026     | 120, 150 and 90 farmers            | 4.5, 4 and 3.8 months ([`measuring-a-cattle-return.md`](./measuring-a-cattle-return.md))                     |

Bhowmik's text says periods of six months or more "were uncommon (1%)". Its own table contradicts that, with 7 and 8 months at 33%. The table is used here.

**Weights in and out.** Only Bhowmik 2025 gives both, in bands:

- **In:** 100–150 kg 34%; 151–200 kg 38%; 201–250 kg 19%; heavier 9%.
- **Out:** 150–250 kg 42%; 251–350 kg 32%; 351–450 kg 20%; heavier 6%.
- 81% were local cattle.

Hasan 2022's Rangpur fatteners sold bulls "having around 250 kg live weight within 2.5 to 3 years age".

**No target weight is published.**

- The final weight band was the one strong predictor of a price over ৳1 lakh (Bhowmik 2025).
- BLRI's package advises medium-sized black or red cattle, because "very few buyers can afford a big animal" (my translation).
- Each bull's suggestion therefore comes from his own Intake weight, his range and his days, not from a standard finish weight.

**Steroids muddy what neighbors report.** Kamal 2019 found 58.8% of fatteners using steroids as growth promoters, and 98% believed they helped. Hasan 2022 found 5% in Rangpur; Bhowmik 2025 found none. A neighbor's gain may not be a clean-fed gain.

## 10. References for the Owner's page

Chosen for being free to open, and checked on 29 September 2026.

| #   | Reference                                                                                                                                     | Publisher, year                                | Link                                                                                                                                               | Good for                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | প্রাণিসম্পদ ও পোল্ট্রি উৎপাদন প্রযুক্তি নির্দেশিকা (Livestock and Poultry Production Technology Guide), "গরু হৃষ্টপুষ্টকরণ" package, pp. 9–13 | BLRI, 2023 (revised)                           | https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-blri/2026/7/be22d154-5229-4c4e-a80e-daa1b8a296d2.pdf | The official Bangladeshi fattening method: choosing, deworming, feeding, selling; 90–120 days            |
| 2   | DLS publications                                                                                                                              | Department of Livestock Services               | https://dls.gov.bd/pages/publications                                                                                                              | Deworming guide (2023), treatment guidelines for large animals, fodder guide                             |
| 3   | Feeding and Nutritional Management of Beef Cattle                                                                                             | Merck Veterinary Manual, 2026                  | https://www.merckvetmanual.com/management-and-nutrition/nutrition-beef-cattle/feeding-and-nutritional-management-of-beef-cattle                    | Receiving new cattle, stepping up to grain over three weeks, typical gains                               |
| 4   | Nutrient Requirements of Beef Cattle, 8th revised edition                                                                                     | NASEM, 2016                                    | https://nap.nationalacademies.org/read/19014                                                                                                       | The standard for energy, protein and intake; free to read in a browser                                   |
| 5   | Beef Cattle Nutrition Series Part 3: Nutrient Requirement Tables (MP391)                                                                      | University of Arkansas, 2018                   | https://www.uaex.uada.edu/publications/pdf/MP391.pdf                                                                                               | Look-up tables from NASEM: intake, energy and protein by weight and gain, bulls included                 |
| 6   | Feedipedia                                                                                                                                    | INRAE, CIRAD, AFZ and FAO                      | https://www.feedipedia.org/                                                                                                                        | What each feed contains: napier, straw, maize, bran, oil cakes                                           |
| 7   | Balanced Feeding for Improving Livestock Productivity (Garg, Animal Production and Health Paper 173)                                          | FAO, 2012                                      | https://www.fao.org/4/i3014e/i3014e.pdf                                                                                                            | Ration balancing with South Asian feeds, from India's NDDB                                               |
| 8   | Tropical Animal Feeding (Preston, Animal Production and Health Paper 126)                                                                     | FAO, 1995                                      | https://www.fao.org/4/V9327E/V9327E00.htm                                                                                                          | Feeding cattle on tropical feeds and by-products                                                         |
| 9   | Rashid et al., Effect of concentrate feeding on the cost effective growth performance of F1 Local × Brahman bulls in Bangladesh               | LRRD 27(5), 2015                               | https://www.lrrd.org/lrrd27/5/rash27100.htm                                                                                                        | What Brahman-cross bulls gained at 343 kg on concentrate, half concentrate and urea-molasses-straw alone |
| 10  | Siddque et al., Growth performance … of native and crossbred (Local × Holstein Friesian) bulls for fattening                                  | J. Agric. Sci. Technol. A 5, 2015              | https://www.davidpublisher.com/Public/uploads/Contribute/57a2b8611751b.pdf                                                                         | Deshi and Holstein-cross bulls side by side on the same rations                                          |
| 11  | Sultana et al., Effect of age on feed efficiency and carcass yield characteristics of indigenous bull                                         | Bangladesh J. Anim. Sci. 46(1), 2017           | https://www.banglajol.info/index.php/BJAS/article/view/32171                                                                                       | How gain changes with age and weight in Pabna bulls (BLRI)                                               |
| 12  | Understanding and Managing Cattle Shrink (P2577)                                                                                              | Mississippi State University                   | https://extension.msstate.edu/sites/default/files/publications/P2577_web.pdf                                                                       | How much weight a bull loses on the road and how fast he gets it back                                    |
| 13  | BIF Guidelines: Gain                                                                                                                          | Beef Improvement Federation, 2026              | https://guidelines.beefimprovement.org/index.php/Gain                                                                                              | How long to settle cattle and how long to weigh them before a gain means anything                        |
| 14  | Livestock Research for Rural Development; Bangladesh Journal of Animal Science                                                                | CIPAV; Bangladesh Animal Husbandry Association | https://www.lrrd.org/ ; https://www.banglajol.info/index.php/BJAS                                                                                  | Where new Bangladeshi fattening trials are published, free                                               |

Every link opened on 29 September 2026. Items 1, 3, 5, 9, 10, 11, 12 and 13 were read in full for this file. NASEM (4) shows an automated reader only its front matter.

---

## Unclear / not found

- **No expected-gain figure from BLRI, DLS, FAO or Merck** for a fattening bull. BLRI's package gives the method and the concentrate allowance, never the gain.
- **No crossbred trial in the 100–150 kg band, and no Bangladeshi trial above about 430 kg.** The heavy-bull range rests on energy arithmetic alone.
- **Dairy crosses have never been fed against Brahman crosses** on one ration in Bangladesh. Mustafa's 0.31–0.35 kg/d against Siddque's 1.01–1.17 is still unexplained ([`expected-gain.md`](./expected-gain.md) §1.2).
- **No Bangladeshi trial of castrates, heifers or cull cows** in fattening. The sex factors are foreign trials plus Bangladeshi calf growth.
- **No Bangladeshi measurement of shrink**, or of weight gained after deworming.
- **No temperature factor for intake was read from NRC (1981).** The heat arithmetic uses NRC (1996)'s factors.
- **Stand-ins and summaries:**
  - two feed energy values are stand-ins (rapeseed expeller for mustard cake, chickpea bran for pulse husk);
  - Moletta 2014 and Dadi 2023 were read only through a summary;
  - the "Megavit-DB" trial's journal and year are not confirmed.
- **Flagged inconsistencies in read sources:**
  - Bhowmik 2025's text and table disagree on fattening periods;
  - Haque 2016's abstract gives two different gains for its 25% crosses;
  - BLRI 2018's Moringa trial (Sultana et al.) prints gains of 0.62–0.84 kg/d that its own weights (186→237 kg over 115 days, about 0.44) do not support, so it is not used;
  - BLRI's 2023 guide prints the concentrate allowance once as ".08–1.0%" beside "0.8–1.0%" elsewhere.

---

## Sources

**Bangladeshi trials and herd data**

- Rashid, M.M., Huque, K.S., Hoque, M.A., Sarker, N.R. & Bhuiyan, A.K.F.H. 2015. Effect of Concentrate to Roughage Ratio on Cost Effective Growth Performance of Brahman Crossbred Calves. J. Agric. Sci. Technol. A 5: 286–295. doi:10.17265/2161-6256/2015.04.007: https://www.davidpublisher.org/Public/uploads/Contribute/564c2bf226c64.pdf
- Rashid, M.M., Hoque, M.A., Huque, K.S. & Bhuiyan, A.K.F.H. 2015. Effect of concentrate feeding on the cost effective growth performance of F1 Local x Brahman bulls in Bangladesh. LRRD 27(5) #100: https://www.lrrd.org/lrrd27/5/rash27100.htm
- Siddque, M.A.B., Sarker, N.R., Hamid, M.A., Amin, M.N. & Sultana, M. 2015. Growth Performance, Feed Conversion Ratio and Economics of Production of Native and Crossbred (Local × Holstein Friesian) Bulls for Fattening under Different Improved Feeding. J. Agric. Sci. Technol. A 5: 770–781: https://www.davidpublisher.com/Public/uploads/Contribute/57a2b8611751b.pdf
- Hossain, S.M.J., Miah, M., Shejuty, S.F., Kabir, M.A. & Das, D. 2024. Evaluation of the growth performance of RCC growing bull through the replacement of concentrate with green grasses. Research Journal of Agricultural Economics and Development 3(2): 23–33: https://abjournals.org/ajbmr/wp-content/uploads/sites/28/journal/published_paper/volume-3/issue-2/RJAED_AHV8WFYC.pdf
- Rahman, M.A., Alam, A.M.M.N. & Shahjalal, M. 2009. Supplementation of Urea-Molasses-Straw Based Diet with Different Levels of Concentrate for Fattening of Emaciated Bulls. Pak. J. Biol. Sci. 12(13): 970–975: https://scialert.net/fulltext/?doi=pjbs.2009.970.975
- Rahman, S.M.A., Bhuiyan, M.S.A. & Bhuiyan, A.K.F.H. 2015. Effects of genetic and non-genetic factors on growth traits of high yielding dairy seed calves and genetic parameter estimates. J. Adv. Vet. Anim. Res. 2(4): 450–457: https://bdvets.org/JAVAR/V2I4/b116_pp450-457.pdf
- Sultana, N., Huque, K.S., Rahman, M.Z. & Das, N.G. 2017. Effect of age on feed efficiency and carcass yield characteristics of indigenous bull. Bangladesh J. Anim. Sci. 46(1): 17–23. doi:10.3329/bjas.v46i1.32171: https://www.banglajol.info/index.php/BJAS/article/view/32171
- Roy, B.K., Roy, A., Huque, K.S., Khanam, J.S., Akon, N. & Sarker, N.R. 2025. Effect of Age on Intake and Growth Performance of Different Age Groups of Red Chittagong Cattle Bulls. SAARC J. Agric. 23(1): 175–183. doi:10.3329/sja.v23i1.79899: https://www.banglajol.info/index.php/SJA/article/view/79899
- Papry, Shejuty, Bhuiyan & Hoque 2020. J. Bangladesh Agril. Univ. 18(2): 435–441. doi:10.5455/JBAU.73448 (25% Brahman-cross calves, birth to 12 months; title not recorded here): https://www.banglajol.info/index.php/JBAU/article/download/73651/49020
- Tahira et al. 2022. J. Agric. Food Environ. 3(1): 21–25. doi:10.47440/JAFE.2022.3104 (50% Brahman-cross calves by sire; title not recorded here): https://journal.safebd.org/index.php/jafe/article/download/144/114
- Mostari et al. 2017. Bangladesh J. Anim. Sci. 46(2): 82–87. doi:10.3329/bjas.v46i2.34433 (BCB-1 and beef-cross calves; title not recorded here).
- BLRI Annual Research Review Workshop 2018, Proceedings, Mostari, Khan, Roy, Hossain & Sultana, pp. 1–2; Sultana et al. (Moringa), pp. 43–44: https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-blri/2024/12/7372fe2c013f4dc4a8e7f36dea13dd29.pdf
- BLRI Annual Research Review Workshop 2020, Proceedings, Mostari, Khan, Roy & Jalil, p. 23: https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-blri/2024/12/d4f78cf3b40f4c29850cc030a0a7e24c.pdf
- Mustafa, M.M.H., Islam, M.R. & Rahman, M.M. 2021. Effect of ration on growth and cost of production during fattening of upgraded Shahiwal bulls. J. Agric. Food Environ. 2(2): 44–48: https://journal.safebd.org/index.php/jafe/article/download/90/83
- Haque et al. 2016. Evaluation of growth performance of Brahman cross calves to local environment of Bangladesh. Asian J. Med. Biol. Res. 2(2): 259–265. doi:10.3329/ajmbr.v2i2.29069 (abstract only): https://www.banglajol.info/index.php/AJMBR/article/view/29069
- BAU "Megavit-DB" trial: Red Chittagong and Holstein-cross bull calves, 98 days. Seen only as an abstract in search results; ResearchGate and academia.edu refused the full text; journal and year not confirmed.
- Joya, S.H. et al. 2026. Trop. Anim. Health Prod. 58(3): 210 (abstract only, via [`expected-gain.md`](./expected-gain.md)): https://pubmed.ncbi.nlm.nih.gov/41917213/

**Bangladeshi method and surveys**

- BLRI 2023. প্রাণিসম্পদ ও পোল্ট্রি উৎপাদন প্রযুক্তি নির্দেশিকা-২০২৩ (পরিমার্জিত), গরু হৃষ্টপুষ্টকরণ, pp. 9–13 (package by Dr Khan Shahidul Huque): https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-blri/2026/7/be22d154-5229-4c4e-a80e-daa1b8a296d2.pdf
- Kamal, M., Hashem, M., Mamun, M.A., Hossain, M. & Razzaque, M. 2019. Study of cattle fattening system in selected region of Bangladesh. SAARC J. Agric. 17(1): 105–118. doi:10.3329/sja.v17i1.42765: https://www.banglajol.info/index.php/SJA/article/view/42765
- Hasan, M., Hashem, M., Azad, M., Billah, M. & Rahman, M. 2022. Fattening practices of beef cattle for quality meat production at Rangpur district of Bangladesh. Meat Research 2(2). doi:10.55002/mr.2.2.15: https://bmsa.info/meatresearch/home/article/view/29
- Bhowmik, P., Alam, M., Datta, A. & Amin, U.S. 2025. Socioeconomic determinants and production factors influencing beef fattening success in Bangladesh. World J. Adv. Res. Rev. 28(2): 1834–1845. doi:10.30574/wjarr.2025.28.2.3932: https://journalwjarr.com/sites/default/files/fulltext_pdf/WJARR-2025-3932.pdf
- Mahbubul, M., Huda, M.N., Akter, M.M. & Ety, M.U.S. 2025. A review on present condition, problems and prospect of beef cattle production: Bangladesh perspective. Bangladesh J. Anim. Sci. 54(1): 1–11. doi:10.3329/bjas.v54i1.80840: https://www.banglajol.info/index.php/BJAS/article/view/80840

**Other trials**

- Ahmad et al. 2013. J. Anim. Sci. Technol. 55(6): 539–543. doi:10.5187/JAST.2013.55.6.539 (Pakistan).
- Quang, D.V. et al. 2015. J. Anim. Sci. Technol. 57: 35 (via [`expected-gain.md`](./expected-gain.md)): https://pmc.ncbi.nlm.nih.gov/articles/PMC4582636/
- Moletta et al. 2014. Acta Sci. Anim. Sci. 36(3): 425–432. doi:10.4025/actascianimsci.v36i3.23736 (read through a summary): https://www.scielo.br/j/asas/a/m8Zywthv3rcZZX5j47gwd7r/
- Silva et al. 2022. Trop. Anim. Health Prod. 54: 262 (zebu cull cows): https://pmc.ncbi.nlm.nih.gov/articles/PMC9371959/
- DeClerck et al. 2020. Transl. Anim. Sci. 4(1): 170–181 (thin cull cows): https://pmc.ncbi.nlm.nih.gov/articles/PMC6994039/
- Abstract only: Santiago et al. 2023, J. Proteomics 278: 104871; da Costa Gomes et al. 2024, Trop. Anim. Health Prod. 56: 276; Maier et al. 2011, JAVMA 239: 1594.
- Dahmer et al. 2022. Transl. Anim. Sci. 6: txac085. doi:10.1093/tas/txac085.
- Dadi 2023. Int. J. Anim. Sci. Technol. 7(4): 57–65 (read through a summary).

**Standards and energy**

- NRC 1996. Nutrient Requirements of Beef Cattle, 7th revised edition, corrected chapter 10: https://nap.nationalacademies.org/resource/beef/beef10.pdf
- NASEM 2016. Nutrient Requirements of Beef Cattle, 8th revised edition (front matter only): https://nap.nationalacademies.org/read/19014
- Gadberry, S. 2018. Beef Cattle Nutrition Series Part 3: Nutrient Requirement Tables (MP391). University of Arkansas: https://www.uaex.uada.edu/publications/pdf/MP391.pdf
- Feedipedia (elephant grass, rice straw, maize grain, wheat bran, rapeseed expeller, chickpea bran): https://www.feedipedia.org/
- Salah, N., Sauvant, D. & Archimède, H. 2014. Animal 8(9): 1439–1447 (abstract only): https://pubmed.ncbi.nlm.nih.gov/24902005/
- Merck Veterinary Manual. Feeding and Nutritional Management of Beef Cattle (J. Smith, revised July 2026): https://www.merckvetmanual.com/management-and-nutrition/nutrition-beef-cattle/feeding-and-nutritional-management-of-beef-cattle

**Shrink, arrival and weighing**

- Brownson, R. Shrinkage in Beef Cattle. Beef Cattle Handbook BCH-8020: https://www.iowabeefcenter.org/bch/ShrinkageBeefCattle.pdf
- Parish, J.A. & Rhinehart, J.D. Understanding and Managing Cattle Shrink (P2577). Mississippi State University: https://extension.msstate.edu/sites/default/files/publications/P2577_web.pdf
- Boyles, S., Loerch, S., Fluharty, F. et al. Feedlot Management Primer. Ohio State University: https://agnr.osu.edu/sites/agnr/files/imce/pdfs/Beef/feedlot_0.pdf
- FutureBeef. Liveweight loss and recovery in cattle (reviewed 25 June 2026): https://futurebeef.com.au/resources/liveweight-loss-and-recovery-in-cattle/
- Sperber, J. 2024. Welcome to the feedlot: best practices for managing newly received feeder calves. Nebraska BeefWatch: https://beef.unl.edu/beefwatch/2023/welcome-feedlot-best-practices-managing-newly-received-feeder-calves
- Montana State University Extension. Step Up Rations: https://animalrangeextension.montana.edu/beef/articles/step-up-rations.html
- Beef Improvement Federation. Guidelines: Gain (edited 18 February 2026): https://guidelines.beefimprovement.org/index.php/Gain
- Williams, J., Langemeier, M., Mintert, J. & Schroeder, T. Profitability Differences Between Steers and Heifers. Beef Cattle Handbook BCH-8054: https://www.iowabeefcenter.org/bch/ProfitabilityDifferencesSteersHeifers.pdf
- Alam, M. et al. 2018. Vet. Rec. Open 5: e000248. doi:10.1136/vetreco-2017-000248 (abstract only).
- Alam, M.R., Gregory, N.G. et al. 2010. Animal Welfare 19(3): 301–305 (abstract only).

**Heat, worms and fluke (abstracts only)**

- Heat: Islam et al. 2024, Vet. Anim. Sci. 24: 100359; Chang-Fung-Martel et al. 2021, Int. J. Biometeorol. 65: 2099–2109; Azevedo et al. 2024, J. Therm. Biol. 119: 103798.
- Fluke and worms, abroad: Wamae et al. 1998, Trop. Anim. Health Prod. 30: 23–30; Hamel et al. 2024, Parasitol. Res. 123: 281; Suhardono et al. 1991, Trop. Anim. Health Prod. 23: 217–220; Keyyu et al. 2009, Trop. Anim. Health Prod. 41: 25–33; Jacob, Singh & Verma 2015, J. Anim. Physiol. Anim. Nutr. 99: 299–307.
- Fluke and worms, Bangladesh: Hasan et al. 2022, Parasitology 149: 1339; Khatun et al. 2025, J. Parasit. Dis. 49: 747; Khan et al. 2017, Vet. Parasitol. Reg. Stud. Rep. 9: 104.

**[SECONDARY] — quoted by a read source, not read**

- Roy, B.K. et al. 2013. BLRI Annual Research Review Workshop 2012–13 (quoted by Siddque 2015 and Hossain 2024).
- Hossain, S. 2014. ইউ এম এস (ইউরিয়া মোলাসেস স্ট্র) বনাম কিছু অজানা তথ্য. vetsbd.com (a blog quoting unnamed "BLRI research"): https://vetsbd.com/blog/2014/04/02/
- Fox, D.G. et al. 1985 (shrink and recovery by hours, via the Ohio State primer).
- Hashem, M.A. et al. 1999 (5.2% of farmers fattening females, via Mahbubul 2025).
