# How a cattle return is measured

**Question:** Before OpenFarm decides what a return counts, how do the people whose figures the Owner will read beside ours measure a cattle fattening or dairy return? That means Bangladeshi livestock economics (BLRI, BAU, DLS and published farm studies), extension guides and the standard farm-management texts. Which measures do they use (benefit–cost ratio, gross margin, net return, return on investment, return on capital, return per head or per kg), and what does each divide by what? What counts as the money in? How is a calf bred on the farm valued? What is left out (labour, sheds, interest on own capital, manure)? How does an animal that died enter? How is a 3–8 month batch put per year, and what pitfalls are named? How is a dairy cow's or herd's return measured? (Ticket: `.scratch/openfarm-roi/issues/01-how-a-cattle-return-is-measured.md`.)

**Researched:** 27 September 2026. Primary sources read in full:

- **Bangladeshi fattening studies:** Sarma & Ahmed 2011 and Sarma, Raha & Jørgensen 2014, both in the Journal of the Bangladesh Agricultural University. Ferdush et al., with BLRI's Socioeconomic Research Division and BAU, read as the Qeios preprint (v2). The version published in _Discover Agriculture_ (January 2026) was only summarised through the publisher's page, because Springer refused a direct download.
- **Bangladeshi dairy studies:** Uddin et al. 2010 (IFCN method, LRRD); Khan et al. 2012 (with a BLRI co-author, LRRD); Alam et al. 2022 (IJARIT).
- **The World Bank's appraisal of the DLS Livestock and Dairy Development Project**, 2018.
- **Standard texts:**
  - FAO, _Farm Management for Asia: a Systems Approach_ (1997), chapters 5 and 7;
  - FAO, _Economics for Farm Management Extension_ (Kahan, 2008);
  - Gittinger, _Economic Analysis of Agricultural Projects_ (World Bank, 2nd edition), from the World Bank's own text copy.
- **Extension guides:**
  - Iowa State's _Livestock Enterprise Budgets for Iowa_ (2026) and _Financial Performance Measures for Iowa Farms_ (2026);
  - Texas A&M's feedlot closeout manual (2019) and cow-calf Standardized Performance Analysis (2006);
  - Dunn's _Measuring Cow-Calf Profitability_ (Beef Improvement Federation).
- **The investment-performance standard:** GIPS 2020 for Firms (CFA Institute).

Two sources were read in **abstract only**: Datta et al. 2019 and BLRI's buffalo study. bb.org.bd refused automated access, so **no Bangladesh Bank credit policy was read in the original**. Its fattening refinance terms come from the press and are marked **[SECONDARY]**. The annualised figures in §6.4 and the "netted" BCRs in §1.2 are my arithmetic on the studies' own tables, and are labelled as such.

---

## Answer for the ticket

1. **Bangladeshi studies report per head per batch, never per year.** Fattening studies give gross return, **gross margin** (gross return less variable cost), **net return** (gross return less total cost) and an **undiscounted BCR** (gross return ÷ total cost). Dairy studies give the same per cow per day, month, year or lactation. No Bangladeshi fattening study reports a return on capital or a rate per year. One IFCN dairy study reports a yearly ROI. The World Bank's appraisal of DLS's livestock project uses a 15-year **FIRR** discounted at 12%.
2. **A BCR is a poor figure to compare.** Its cost includes the animal's purchase price, 65–74% of a fattening batch's cost, so fattening BCRs sit near 1.2–1.5 by construction. Sarma 2014 defines BCR as gross ÷ cost and then prints **net ÷ cost (0.52)** under that name. Gittinger warns that a BCR moves with what is netted out. The figure that means the same thing in every study is **net return ÷ total cost**, which some papers call "return on cost". A Margin over the money in is that figure.
3. **The money in is the whole cost, undated.** Every Bangladeshi study divides by purchase plus everything spent. None weights money by the days it was tied up. Capital × days appears only in US practice:
   - Texas A&M's closeout: the feeder cattle plus half the other costs, × days ÷ 365;
   - Iowa State's budgets: interest on the animal for the whole period and on feed for half of it.
4. **Standard practice values a calf bred on the farm at market when she leaves the herd that bred her, not at nothing.** US standard practice (SPA) values an unsold calf at the market price at weaning. Dairy studies count the calf's value as a dairy return. Treating her as bought for 0 credits the dairy herd's calf to the fattening run. No Bangladeshi fattening study says how it treats home-bred animals.
5. **What is counted differs by study, and the figure moves with it.** Bangladeshi studies:
   - charge labour, family and hired together;
   - usually charge interest on operating capital (Sarma 2014 does not);
   - charge small depreciation on tools and sheds, and land rent (0.1–3% of cost);
   - count dung and feed sacks as returns (0.8–9% of return).

   IFCN and FAO add opportunity costs for own labour, land and capital (an "economic" figure). Dunn and the SPA say a financial figure should leave opportunity costs out, and **the two must not be mixed**. A Margin charges no wages, sheds or interest, so it will read higher than a study's net return on the same animals.

6. **Deaths.** No Bangladeshi farm survey accounts for deaths. Ferdush et al. left traders' death losses out because none happened in the survey. Elsewhere the rule is that a dead animal's cost stays in the batch and is carried by the animals sold. Texas A&M: "deads are in", and "feedyard performance with deads out is wrong and just distorts reality". Iowa State charges death loss as 1–2% of the feeder cost and 0.5–1% of other costs.
7. **Per year, and the pitfall.**
   - **Bangladeshi studies do not annualise.** Sarma 2014 compares a four-month 52% with the "prevailing public and private" 16–20%, a yearly rate, as it stands.
   - **Platforms scale simply.** Investify offered 8% over 4 months as "annualised 24%".
   - **US closeouts scale simply over average capital × days.**
   - **Lenders** quote a simple rate a year on the days the money is out. The **World Bank/DLS appraisal** uses a multi-year IRR.
   - **GIPS forbids annualising a return for less than a year.** For a fixed-life pool it prefers a money-weighted return from dated cash flows.

   Annualising assumes the money is turned again at the same margin all year. An Eid batch turns once. Compounding makes it worse: 52% in four months reads 155% a year scaled simply and 248% compounded.

8. **Dairy is measured per cow per year, per lactation, or per 100 kg of milk.** The returns are:
   - milk;
   - calves at market value;
   - cull cows at sale value;
   - manure;
   - the change in herd value.

   A lifetime figure (yearly × lactations kept) can reverse the ranking of cows (Khan 2012). IFCN's cost of milk takes calves, culls and manure off the cost before dividing by milk. OpenFarm's Cost per Litre does not.

9. **Typical Bangladeshi figures.**
   - **Fattening:** net return 25–52% of cost per batch of 3.5–4.5 months, BCR 1.25–1.52. The World Bank/DLS beef-fattening model has an FIRR of 35%.
   - **Dairy:**
     - BCR 1.31 per buffalo lactation (BLRI);
     - BCR 2.17 per cow per day (Alam 2022, which does not say whether family labour or interest is costed);
     - IFCN ROI up to about 40% a year on a large intensive farm, and a loss on two small farms once family labour is costed;
     - FIRR 19–23% (World Bank/DLS).

---

## Summary table

| Measure                                | Divides                                                                       | Who reports it here                                                                                           | What to watch                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Gross margin                           | Gross return − variable cost (taka, no ratio)                                 | Every Bangladeshi fattening and dairy study; FAO; Iowa ("income over variable costs")                         | Where labour sits: Ferdush makes it fixed, Sarma 2014 variable                          |
| Net return / net margin                | Gross return − total cost (taka)                                              | Every Bangladeshi study                                                                                       | Total cost may or may not include family labour, interest, depreciation                 |
| Benefit–cost ratio (farm studies)      | Gross return ÷ total cost, undiscounted                                       | Sarma 2014 (defined), Ferdush, Alam, BLRI buffalo                                                             | Purchase price in the cost pins fattening near 1; Sarma 2014 prints net ÷ cost as "BCR" |
| Benefit–cost ratio (project appraisal) | PV of benefits ÷ PV of costs                                                  | Gittinger                                                                                                     | Changes with netting convention; Gittinger prefers NPV/IRR                              |
| Return on cost / net return per taka   | Net return ÷ total cost                                                       | Alam ("return on cost" 117.6%); FAO ("net total factor productivity" 23%); implied by Sarma and Ferdush       | Per batch; says nothing about time                                                      |
| Return on capital / ROA                | Annual net return (after a charge for own labour) ÷ capital or average assets | FAO; Iowa C3-55; Dunn/SPA; IFCN ROI                                                                           | Needs a register of assets; annual by definition                                        |
| Return on equity                       | (Net return − interest paid) ÷ own capital                                    | FAO; Iowa C3-55                                                                                               | Only differs from ROA where money is borrowed                                           |
| Annualised ROI (feedlot)               | (Net income + interest paid) ÷ (feeder cost + ½ other costs) × days ÷ 365     | Texas A&M closeout                                                                                            | Simple scaling; assumes capital turns over                                              |
| FIRR / NPV                             | Discounted multi-year cash flows                                              | World Bank/DLS appraisal (12%, 15 years); Gittinger                                                           | A project measure, not a batch's                                                        |
| Money-weighted return (IRR)            | Dated cash flows in and out                                                   | GIPS 2020 (closed-end, fixed-life funds)                                                                      | Not annualised under a year                                                             |
| Per head / per cow                     | Any of the above ÷ head                                                       | Bangladeshi fattening (per head), dairy (per cow per day/month/year/lactation), Iowa (per head, per cow unit) | Per cow can mislead (Dunn)                                                              |
| Per kg / per litre / per 100 kg milk   | Cost or return ÷ kg gained, litres, 100 kg ECM                                | IFCN (per 100 kg ECM); Alam (per litre); Texas A&M (cost of gain)                                             | Bangladeshi fattening studies cannot: farmers do not weigh                              |

---

## 1. The measures

### 1.1 In Bangladeshi fattening studies

**Sarma, Raha & Jørgensen 2014**, J. Bangladesh Agril. Univ. 12(1): 127–134 ([PDF](https://www.banglajol.info/index.php/JBAU/article/view/21402/14707)).

- **Sample:** 150 fatteners in Sathia (Pabna) and Raiganj (Sirajganj), field survey 2013. The average batch took four months.
- **Definitions, p.129:**
  - "Gross margin (GM) is the difference between the total revenue earned and the total variable cost incurred, GM = TR − TVC";
  - "NM = TR − TC";
  - "Benefit cost ratio i.e. (BCR) is the total revenue divided by the total cost, BCR = TR/TC. When BCR is greater than 1, the business is profitable."
- **Table 2, per head:**
  - TR 39,247.61, made of the sale 38,698.33 and "sales of manure" 549.28 (1.40%);
  - TC 25,896.77, of which the purchase is 19,138.76 (73.90%);
  - NM 13,350.84;
  - "Ratio = 0.52".
- **The ratio printed is not the ratio defined.** TR/TC is 1.52. What is printed is NM/TC. The text says so: "for every one BDT invested in cattle fattening BDT 0.52 was realized as net profit … (52%) is higher than the prevailing public and private manages [sic] 16–20%" (p.132). The comparison sets a four-month return against what can only be yearly rates.

**Sarma & Ahmed 2011**, J. Bangladesh Agril. Univ. 9(1): 141–146 ([PDF](https://www.banglajol.info/index.php/JBAU/article/download/8756/6493)).

- **Sample:** 120 small fatteners in Rajbari, surveyed September–November 2010. Fattening lasted 4.5 months.
- **Method:** "Net Margin (NM) = Total Return − Total Cost". Costs are split into direct and indirect. Returns are also direct and indirect.
- **Table 2, per head:**
  - cost 16,316, including "interest on capital" 1,129, labour 1,711 and depreciation 234;
  - return 21,875, including manure 1,220 and by-products 728;
  - "profit Tk 5559 per cattle".
- No BCR is printed. TR/TC is 1.34 (my arithmetic).

**Ferdush et al.**, "Economics of cattle fattening focusing on profitability and marketing efficiency in selected areas of Bangladesh", _Discover Agriculture_ 4, article 15 (15 January 2026) ([article](https://link.springer.com/article/10.1007/s44279-025-00321-5); read as the [Qeios preprint v2](https://www.qeios.com/read/WHWLTS.2/pdf)).

- **Authors** include BLRI's Socioeconomic Research Division, BAU and BAURES.
- **Sample:** 90 farmers in Dhamrai, Kushtia Sadar and Pachbibi, data 2018. Batches averaged 3.8 months and 2.74 head.
- **Method:** "Costs and returns analyses were done on a total cost basis."
- **Table 1, cost per head:**
  - purchase 45,079 (65.51%);
  - feed 14,602 (21.22%);
  - treatment 389;
  - **interest on operating capital 1,188 (1.73%)**;
  - labour 7,208 (10.57%), treated as a fixed cost;
  - housing 59;
  - total 68,813.
- **Table 2, return per head:**
  - cattle sale 85,449, **cow dung 598** and feed sacks 124, total 86,171;
  - gross margin 24,625; net return 17,358;
  - **BCR (D/C) 1.25**, ranging 1.18–1.36 by area.
- The text reads the BCR as "for every BDT invested in cattle fattening, BDT 0.25 was realised as net profit".
- 53% of farmers fatten all year; 47% only before Eid-ul-Adha.
- For the traders (beparies), "return over investment was 2.28%", a per-trade figure with no time attached.

### 1.2 The benefit–cost ratio in project appraisal

**Gittinger**, _Economic Analysis of Agricultural Projects_, 2nd edition, World Bank EDI ([World Bank text](https://documents.worldbank.org/curated/en/584961468765021837/text/multi0page.txt)).

- The benefit–cost ratio "is the ratio obtained when the present worth of the benefit stream is divided by the present worth of the cost stream". In appraisal it is a **discounted** measure.
- "The benefit-cost ratio is not commonly used in developing countries. This is because the value of the ratio will change depending on where the netting out in the cost and benefit streams occurs." Where it is used, "it is desirable that all analysts … follow a common netting-out convention".
- For financial analysis, the discount rate "is usually the marginal cost of money to the farm … the rate at which the enterprise is able to borrow money".

**What netting does to a fattening BCR (my arithmetic).** Take the purchase price off both sides, as if the animal simply passed through:

- Sarma 2014: the BCR moves from 1.52 to **2.98**;
- Ferdush: the BCR moves from 1.25 to **1.73**.

Same animals, same profit. This is why a fattening BCR cannot sit beside a dairy BCR, where no purchase dominates.

**World Bank, Livestock and Dairy Development Project (P161246), Project Appraisal Document**, 2018 ([PAD](https://documents1.worldbank.org/curated/en/472591544410829587/pdf/project-appraisal-document-pad-P161246-11152018-636799896178312769.pdf)). This is DLS's project.

- Farm models were "developed based on information collected from DLS as well as NGO's and private sector actors" (para 83).
- The financial analysis uses a "subproject operation/evaluation period of 15 years … and annual discount rate of 12 percent for the financial analysis" (para 84).
- Financial IRR and NPV at farm level (para 85):
  - **35% and US$1,900** for small-scale beef fattening;
  - 19% and US$6,000 for a dairy farm changing to crossbreds;
  - 23% and US$10,300 for a crossbred dairy farm.

### 1.3 Return on capital, ROA and ROE

**FAO, _Farm Management for Asia: a Systems Approach_** (Farm Systems Management Series 13, 1997), chapter 7 ([fao.org](https://www.fao.org/4/w7365e/w7365e0a.htm)). All measures are on an **annual** basis.

- **Farm gross margin** = gross return − direct costs. **Net returns** = gross margin − fixed costs. **Sustainable returns** also charge depreciation.
- The "economic" appraisal charges family labour "at its market value of Rs 10 per day", "an assumed opportunity cost of 10 per cent interest … on all capital including land", and depreciation (Table 7.8).
- **Gross total factor productivity** = total gross returns ÷ total costs (1.23). This is what Bangladeshi studies call the BCR.
- **Net total factor productivity** = net returns ÷ total costs (0.23): "the net return per Rs of input is 23 per cent".
- **Return on capital** = total net returns ÷ total capital, including land (7.83%).
- **Return on equity** = (net returns − cost of borrowed capital) ÷ equity (7.61%). It "can be compared with the rate of return that may be available from alternative investments".

**FAO, _Economics for Farm Management Extension_** (Kahan, 2008, reprint 2013) ([PDF](https://www.fao.org/4/i3228e/i3228e.pdf)).

- Gross margin = value of production − variable costs. Profit = total gross margin − fixed costs.
- Net farm family income = farm profit less "the cost of family labour".
- Rate of return = additional annual profit ÷ cost of investment × 100. The capital counted is livestock, shed, equipment and working capital.
- "Each capital item is normally valued at its purchase price or cost of production."
- The rate "will clearly need to be higher than the rate of interest if the money has to be borrowed". The worked dairy example returns 41.6%.

**Iowa State, _Financial Performance Measures for Iowa Farms_** (AgDM C3-55, revised September 2026) ([PDF](https://www.extension.iastate.edu/agdm/wholefarm/pdf/c3-55.pdf)).

- **ROA** = (net farm income from operations − value of operator and unpaid family labour and management) ÷ average total farm assets, at fair market value.
- **ROE** also takes off farm interest, and divides by average net worth.
- "Common farm wage rates in the community can be used to value unpaid labor and management."
- Long-term Iowa ROA has run at 6–10%.

**Dunn, _Measuring Cow-Calf Profitability and Financial Efficiency_** (Beef Improvement Federation, c. 2003) ([PDF](https://beefimprovement.org/wp-content/uploads/2013/07/Measuring-Cow-Calf-Profitability.pdf)).

- The SPA's ROA = (net income + interest − family living) ÷ total invested in land, cattle, buildings, improvements and equipment. It is "usually calculated for a fiscal year".
- For judging management, "assets should be recorded at their financial, or cost, basis. It is inappropriate to use market values or opportunity costs."
- A financial analysis uses cost; an economic analysis uses market value, and is only for deciding to enter or leave. "It is inappropriate and confusing to mix the methodologies."

### 1.4 The IFCN method, used for Bangladeshi dairy

**Uddin, Sultana, Ndambi, Hemme & Peters 2010**, "A farm economic analysis in different dairy production systems in Bangladesh", LRRD 22(7) #122 ([lrrd.org](https://lrrd.org/lrrd22/7/uddi22122.htm)).

- **Returns:**
  - "Milk returns";
  - "**Cattle returns:** Amount obtained from selling cull cows, male calves, and surplus heifers +/- livestock inventory";
  - "**Other returns:** Returns from sales or value of manure used at home".
- **Total costs** are the P&L account ("cash costs, depreciation, etc.") plus opportunity costs for "family labour, own land, own capital".
- **Entrepreneur's profit** = returns − all of those.
- **Return on investment (real)** = "the percentage of farm profits on the investment costs, adjusted to the inflation rate". The highest, 40%, is on the 22-cow intensive farm in Sirajganj.
- **Unit:** results are per 100 kg of energy-corrected milk (ECM), with milk yield per cow per year.

### 1.5 Per head, per kg, per litre

- **Bangladeshi fattening studies report per head.** They cannot report per kg because fatteners do not weigh. Sarma & Ahmed 2011 recommend "weighting their animals at purchase and at regular interval".
- **Dairy studies report per unit of milk:**
  - Alam 2022 adds a "net return (per liter of milk)";
  - IFCN works per 100 kg ECM.
- **Texas A&M's closeout** puts cost of gain per unit of gain at the centre: "the most important product of the cattle cost accounting system is the cost of gain" ([manual](https://agecoext.tamu.edu/wp-content/uploads/2020/07/D5a.-User-Manual-Finished-Cattle-Closeout-9-3-2019.pdf)).
- **Dunn** found per cwt of calf "the most statistically sensitive" denominator, and warns that "expressing efficiency ratios on a per cow or per acre basis can be misleading".

---

## 2. The money in

| Source                          | Money in                                                                                                                                                                                | Time-weighted?                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Sarma 2011, 2014; Ferdush; Alam | Total cost: purchase + feed + medicine + labour + (interest) + depreciation + rent                                                                                                      | No. The whole batch's cost, whenever spent |
| FAO 1997                        | Total costs for the year (TFP); total capital including land (return on capital)                                                                                                        | Annual                                     |
| Iowa C3-55; Dunn/SPA            | Average farm assets over the year (market in Iowa, cost in SPA)                                                                                                                         | Annual average                             |
| Iowa B1-21 budgets              | Interest charged on the feeder "6.5 months" (whole period); "Interest is calculated on feed and other variable costs for one-half of the production period"                             | Yes, as an interest cost                   |
| Texas A&M closeout              | "Investment required is estimated by taking one half of the investment [in] non-cattle costs plus the total payweight cost of the feeder cattle times days on feed divided by 365 days" | Yes: capital × days                        |
| GIPS 2020 money-weighted return | Each external cash flow on its own day ("using daily external cash flows", 2.A.29)                                                                                                      | Yes, exactly                               |

**What this means.** The half-of-feed rule is an average-capital shortcut. The animal's price is tied up from day one. Feed is paid for gradually, so on average only half of it is out.

**No Bangladeshi study weights by time.** The Bangladeshi denominator is what OpenFarm's Margin already adds up: the purchase and everything charged.

---

## 3. A calf bred on the farm

- **SPA, Texas A&M** (McGrann & Bevers, June 2006) ([SPA-1](https://agecoext.tamu.edu/wp-content/uploads/2013/08/Spa-1.pdf)). This covers all weaned calves, "whether they are market calves, retained ownership calves … or replacement heifer calves": "**For calves not sold, a value should be assigned based on the current market price and net pay weight at the time of weaning.**" Raised feed is also valued at market, as "the opportunity cost … (i.e., earnings foregone by not selling the raised feed that was fed)".
- **Texas A&M closeout, 2019.**
  - "The value placed on feeder cattle [is] most often … a purchase cost or estimated market value."
  - A retained calf's "Total Unrealized Sales Value (opportunity cost) is the net sales revenue that is projected if the calves are sold at weaning".
  - Its costs to weaning "are sunk costs" that do not decide whether to keep her.
- **IFCN, and the Bangladeshi dairy studies.** The calf is a **return of the dairy herd**:
  - IFCN counts male calves and surplus heifers in "cattle returns", with inventory change;
  - Alam 2022 counts "the average values of calf" (Tk 122 a cow a day) in gross return;
  - Khan 2012 prices a "one year old calf".
- **FAO 1997:** "For subsistence-oriented farms it will be necessary to impute prices/values to products which are not sold for cash."
- **FAO 2008:** capital is valued "at its purchase price or cost of production".
- **Dunn:** a financial ROA values assets at cost. Market value belongs to an economic analysis, and the two must not be mixed.

**Bangladeshi fattening studies are silent.** In Ferdush, "79% of farmers bought cattle from a recognised nearby cattle market … while 14% own farms and the rest … both". Yet its cost table gives every animal an "initial price of cattle" and does not say how the home-bred ones were priced. No other study says either.

**The consequence (my inference).** At a purchase price of 0, a home-bred animal's whole sale value shows as the fattening run's gain. In every framework above, the part she was worth at weaning is the dairy herd's product.

---

## 4. What is left out

| Item                    | Sarma 2014                                                                        | Sarma & Ahmed 2011                         | Ferdush 2026                                           | Alam 2022 (dairy)                  | IFCN (Uddin 2010)                                 | FAO 1997                          | Iowa B1-21                                                                             | Dunn/SPA (financial)                               |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Hired labour            | In ("labour charges" 2.18%)                                                       | In (labour 1,711)                          | In (fixed, 10.57%)                                     | Not stated                         | In                                                | In                                | $20/h                                                                                  | In                                                 |
| Family labour           | In, lumped with hired ("including both family labour and hired labour")           | Not separated                              | In ("family labour … included the owner themselves")   | Not stated                         | At "the average wage rate per hour in the region" | At opportunity cost, Rs 10/day    | Same $20/h                                                                             | Out; family living subtracted from ROA's numerator |
| Interest on own capital | **None**                                                                          | "Interest on capital" 1,129 (6.9% of cost) | "Interest on operating capital" 1.73%, rate not stated | Not stated                         | 3% real (own), 6% (borrowed)                      | 10% on all capital including land | 7.11% on the feeder (whole period), feed (half period)                                 | Out: opportunity cost                              |
| Sheds, equipment        | Depreciation of feeders, drinkers, rakes, spade, tubewell, "shade", bucket (1.0%) | Depreciation 234                           | "Housing" 59 (0.09%)                                   | Fixed cost 48.85/day, not itemised | Straight-line on purchase price, zero residual    | Depreciation charged              | 14% of original investment a year (8% depreciation, 5% interest, 1% tax and insurance) | At cost, depreciated                               |
| Land                    | Land rent 0.55%                                                                   | Rent 270                                   | None                                                   | –                                  | Regional rent for own land                        | 10% on land value                 | –                                                                                      | At cost                                            |
| Manure                  | **Return**, 1.4%                                                                  | **Return**, 1,220 (5.6%) + by-products 728 | **Return**, dung 598 + sacks 124 (0.8%)                | **Return**, Tk 2.29/day            | **Return**, "value of manure used at home"        | –                                 | A cost (application), not income                                                       | –                                                  |

**What the table shows.** The Bangladeshi fattening studies are **partly economic**. They impute family labour and usually interest on the animals' money, but not on the farm's capital, and their sheds are almost free. IFCN and FAO are **fully economic**. SPA and Dunn are **financial**. OpenFarm's Margin is **narrower than all of them**: no wages, sheds, utilities, repairs, equipment or interest (CONTEXT.md, **Herd Cost** and **Margin**).

**The effect of the opportunity costs.** Uddin 2010 found every typical Bangladeshi dairy farm had a positive farm income. But the small extensive and traditional farms had a **negative entrepreneur's profit** (−0.93 and −0.27 US$/100 kg ECM): "The variation is due to the opportunity costs", chiefly family labour. The same farms read profitable or not depending on which is counted.

**Texas A&M's warning on labels:** "Most frequently in feedyard and other cattle reporting, these numbers are gross margins … and do not include overhead and owner labor and management costs, which are required to calculate a true profit." It adds that the owner's management should be costed at what a hired manager would be paid.

---

## 5. Deaths

- **Bangladeshi farm surveys** (Sarma 2011, 2014; Ferdush) interviewed fatteners about animals they sold. None treats mortality in its cost or return tables.
- **Ferdush, on the traders' costs:** "Losses due to theft, death, snatching, and accidents also incurred costs. However, this type of problem did not occur during the study period and was therefore not included as a cost item."
- **Texas A&M closeout (2019).** The key data include the "number of head sold net of death loss". Payweight out is counted "(deads are in) … Feedyard performance with deads out is wrong and just distorts reality." Margins are "dollars per head out", so the dead animals' cost is carried by the head sold.
- **Iowa State B1-21 (2026) budgets** carry a "Death loss" line in variable costs:
  - yearlings: "1% of feeder purchase costs and 0.5% of all other variable costs";
  - calves: 2% and 1%;
  - cow-calf: "2% death rate on replacement heifers and cows".
- **FAO 1997, chapter 5** ([fao.org](https://www.fao.org/4/w7365e/w7365e08.htm)). The sheep-flock budget is annual. Deaths enter as fewer animals to sell: "the normal death rate among ewes is five per cent annually … nine per cent of lambs do not survive".
- **IFCN dairy:** a death shows in "+/- livestock inventory".

**The rule everywhere it is stated.** A batch's return counts the dead animal's purchase and keep in the money in, with nothing back. A sum of per-animal profits over the animals sold leaves the loss out.

---

## 6. Per year

### 6.1 What each source does

- **Bangladeshi studies: no annualising.** Returns are per head for the batch (3.5–4.5 months).
  - Ferdush says "per year profitability … was measured in terms of gross return and gross margin", but its tables are per head per batch.
  - Sarma 2014 sets its four-month 52% beside the "prevailing" 16–20%, a yearly rate, unscaled.
- **Bangladeshi platforms: simple scaling.** Investify's "Qurbani Eid Cattle Project 2026" states "4 months, projected ROI 8% ('Annualized ROI 24%')", which is 8% × 3. This is from the scheme's page as recorded in [`cattle-investment-schemes.md`](./cattle-investment-schemes.md) §1.3.
- **Texas A&M closeout: simple scaling over average capital × days.** "Annualized Net Return on Investment … is the net income plus cash interest paid divided by annualized capital investment requirement … Capital is adjusted for the time cattle are on feed" (see §2). ROA is defined the same way.
- **Iowa State budgets: capital-days, as an interest cost.** Interest is charged per annum for the months the money is out, so the budget's "income over all costs" is already net of what the money would have cost at the bank.
- **FAO, Iowa C3-55, Dunn, IFCN: annual accounts.** Returns on capital are for a year of the farm, over the year's capital. No batch is scaled.
- **World Bank/DLS appraisal: compounding, multi-year.** A 15-year FIRR and NPV at 12%.
- **Lenders.** Bank interest is a simple rate a year on the balance for the days outstanding. Bangladesh Bank's 2023 refinance for cattle fatteners lent "at 4 per cent interest", repayable "within 18 months, including a grace period of three months". That is from the [Daily Star, 22 March 2023](https://www.thedailystar.net/business/economy/news/cattle-fatteners-get-loans-tk-5000cr-bb-fund-3277391) **[SECONDARY]**.

### 6.2 The investment standard

**GIPS 2020 for Firms** (CFA Institute) ([PDF](https://www.gipsstandards.org/wp-content/uploads/2021/03/2020_gips_standards_firms.pdf)):

- **2.A.12:** "Returns for periods of less than one year must not be annualized." Repeated in the [GIPS Q&A on partial-period returns](https://www.gipsstandards.org/qadatabase/5001/).
- **1.A.35:** a firm may present money-weighted returns where it controls the cash flows and the fund is "closed-end", "fixed life", "fixed commitment" or has illiquid investments. A Venture is closed-end and has a fixed life.
- **2.A.29:** money-weighted returns use "daily external cash flows".
- **5.A.1:** present the "annualized … since-inception money-weighted return" once a year has passed. "When the composite has a track record that is less than a full year", present "the **non-annualized** … since-inception money-weighted return".

### 6.3 The pitfalls named

- **Annualising a short period is a simulation, not a result** (GIPS 2.A.12).
- **A BCR or a per-batch return has no time in it.** Two batches with the same BCR over four and ten months are the same by BCR, not per year (Gittinger's measures are discounted for this reason).
- **Comparing a batch's return with a yearly rate unscaled** understates the batch (Sarma 2014). **Scaling it** overstates it unless the money really turns again.
- **A figure labelled "profit" is often a gross margin** (Texas A&M).

### 6.4 What scaling does to the Bangladeshi figures (my arithmetic)

| Study                      | Net ÷ total cost, per batch | Months | Simple × 12/months  | Compounded |
| -------------------------- | --------------------------- | ------ | ------------------- | ---------- |
| Sarma & Ahmed 2011         | 34.1%                       | 4.5    | 90.9%               | 118.6%     |
| Sarma 2014                 | 51.6%                       | 4      | 154.7%              | 248.1%     |
| Ferdush 2026               | 25.2%                       | 3.5    | 86.5%               | 116.2%     |
| Investify 2026 (projected) | 8%                          | 4      | 24% (as advertised) | 26.0%      |

**Texas A&M's capital-days method reads higher still.** On Ferdush's figures, the capital is the purchase 45,079 plus half of the other costs: 56,946. Held for 3.5 months, that is the same as 16,609 held for a year. Net return plus interest (18,546) over 16,609 is **112% a year**, above simple scaling on total cost (86.5%), because the average capital is smaller than the total cost.

**What the rates assume.** Each rate a year assumes the money goes straight back into another batch at the same margin. 47% of Ferdush's farmers fatten only before Eid-ul-Adha. For them the money turns once a year. What it earns the rest of the year is what it would have earned idle.

---

## 7. Dairy

- **Per cow per year.** IFCN; Khan 2012; Iowa's cow-calf budget ("One Cow Unit").
  - Khan converts lactation yield to a year: "Milk yield (kg/year) = Milk yield per lactation (kg) x 365/Calving interval".
- **Per lactation.** BLRI's buffalo study: "Per lactation total cost was estimated BDT 24,507, lactation period was 255 days … the BCR was 1.31 (undiscounted)". This is Islam, Nahar, Begum, Deb, Khatun & Mustafa, BLRI; a book chapter deposited on [Zenodo](https://zenodo.org/records/5137756) in 2021, data January–April 2016; **abstract only**.
- **Per cow per day, or per month.**
  - Alam, Sampa, Anny & Afrin 2022, IJARIT 12(1): 182–187 ([doi](https://doi.org/10.3329/ijarit.v12i1.61050), [Zenodo](https://zenodo.org/records/7086280)): gross return Tk 1,099 a cow a day, made of milk 975, calf 122 and dung 2.29, against total cost 505. Net return 594, "Return on cost {(f/d)*100}" 117.62%, "BCR (a/d)" 2.17. The paper does not say whether family labour or interest is costed.
  - Datta, Haider & Ghosh 2019, TAHP 51(1): 55–64: "average monthly revenue and cost of milk production were US$ 79 and US$ 21 per cow" ([abstract](https://pubmed.ncbi.nlm.nih.gov/30003526/)). **Abstract only**, so the cost basis cannot be checked.
- **Per 100 kg milk.** IFCN. Its "cost of milk production only" takes the non-milk returns off the total cost before comparing with the milk price: "the non-milk returns have been subtracted from the total costs to show a cost bar that can be compared with the milk price".
- **Over her life.** Khan, Miah, Huque, Khatun & Das 2012, LRRD 24(1) #20 ([lrrd.org](http://www.lrrd.org/lrrd24/1/khan24020.htm)): "The lifetime profitability was estimated by the product of yearly profit per cow and the lactation number of cows." Farmers keep Local and Red Chittagong cows to 7 lactations and Holstein × Local to 3.
  - Per year, Holstein × Local earns most: US$101, against 54 for RCC and 40 for Local.
  - Over a life, RCC earns most: US$378, against 303 for Holstein × Local and 280 for Local. "In consideration of life-time productivity and calving interval, RCC would generate higher profitability."
- **Calves** are valued at market as a return of the herd (IFCN "cattle returns"; Alam's "values of calf"; SPA "current market price … at the time of weaning").
- **Cull cows** are valued at what they fetch:
  - IFCN: "cull cow return is the second largest source of returns for the dairy farmers because of high market value for cull cows in Bangladesh";
  - Khan: beef was 19–23% of revenue;
  - Iowa's cow-calf budget: "0.18 head" of cull cow a year per cow unit, "yearly cull cow sales of $425", and interest and insurance "on herd at 10%". That is a charge on the cows themselves as capital.
- **The herd's own value.** IFCN adds "+/- livestock inventory" to returns. Dunn warns that valuing the herd at market mixes an economic analysis into a financial one.

---

## 8. Typical figures

| Study               | Enterprise, place, data year                 | Unit                       | Cost       | Return     | Net                 | Ratio reported                      | Net ÷ cost |
| ------------------- | -------------------------------------------- | -------------------------- | ---------- | ---------- | ------------------- | ----------------------------------- | ---------- |
| Sarma & Ahmed 2011  | Fattening, Rajbari, 2010                     | Per head, 4.5 months       | 16,316     | 21,875     | 5,559               | –                                   | 34%        |
| Sarma et al. 2014   | Fattening, Pabna & Sirajganj, 2013           | Per head, ~4 months        | 25,897     | 39,248     | 13,351              | "0.52" (net ÷ cost; TR ÷ TC = 1.52) | 52%        |
| Ferdush et al. 2026 | Fattening, Dhamrai, Kushtia, Joypurhat, 2018 | Per head, 3.5–3.8 months   | 68,813     | 86,171     | 17,358              | BCR 1.25 (1.18–1.36)                | 25%        |
| World Bank/DLS 2018 | Small-scale beef fattening model             | 15-year project            | –          | –          | NPV US$1,900        | FIRR 35%                            | –          |
| Alam et al. 2022    | Dairy, Dhaka region, 2018                    | Per cow per day            | 505        | 1,099      | 594                 | BCR 2.17                            | 118%       |
| Islam et al. (BLRI) | Buffalo milk, 10 districts, 2016             | Per lactation (255 days)   | 24,507     | –          | –                   | BCR 1.31 (undiscounted)             | –          |
| Khan et al. 2012    | Dairy, Chittagong                            | Per cow per year           | US$189–378 | US$229–475 | US$40–101           | –                                   | 21–27%     |
| Uddin et al. 2010   | Dairy, IFCN typical farms                    | Per 100 kg ECM; annual ROI | –          | –          | −0.93 to +13.53 US$ | ROI up to 40%                       | –          |
| World Bank/DLS 2018 | Small dairy models                           | 15-year project            | –          | –          | NPV US$6,000–10,300 | FIRR 19–23%                         | –          |

The spread within fattening, 25–52% net on cost per batch, is as much what is costed as how the animals did.

---

## What this means for OpenFarm

### Constraints the spec should respect

1. **Say what is and is not charged, beside the figure.** The studies the Owner will read charge family labour, usually interest, and small depreciation, and count dung as income. A Margin charges none of the first three. On the same animals, OpenFarm's figure will read **higher** than a study's net return. The glossary's line that wages, sheds and equipment "are the place and the people, and the Farm's" should reach the page as a sentence, or the Owner will compare unlike things.
2. **Divide by total cost, and do not call it a BCR.** Net ÷ (purchase + everything charged) is the one figure every source can be turned into:
   - FAO's "net return per Rs of input";
   - Alam's "return on cost";
   - what Sarma 2014 printed.

   A BCR is dominated by the purchase price, is labelled inconsistently, and moves with netting.

3. **A dead animal stays in the run.** Her purchase and keep are money in with nothing back (Texas A&M, Iowa, FAO). A sum of Margins, which leaves her out, must not be read as a run's return.
4. **A figure a year shorter than a year says what it assumes.** It assumes the money turns again at the same margin, which an Eid run does not. Investor-facing words should follow GIPS 2.A.12 and not annualise under a year. The pooled-investment research already forbids anything that reads as a promised return.
5. **Scale simply if at all.** Bank rates, feedlot closeouts and lenders' interest are simple rates a year over days. Compounding a four-month return inflates it (§6.4). A bank rate typed in beside the figure is simple per annum.

### Choices for the grilling

- **Ticket 04, what a return counts.**
  - **The home-bred calf.** Purchase 0 (today's Margin) or market value when she crosses from the dairy herd to the fattening run. That is SPA's rule, and OpenFarm already prices an **Internal Sale** at weight × a rate the Owner enters.
  - **Dung and sacks** as income, as every Bangladeshi study counts them.
  - **Whether to also show a study-like figure** that imputes wages and interest, so the Owner can set it beside BLRI's.
  - **For a Venture:** return on the money spent on animals, or on the capital raised. A money-weighted return on the Investors' dated money in and out also catches money idle in the Venture Account; a return on animals' cost does not.
- **Ticket 05, per year.** The options are:
  - no rate a year (the Bangladeshi and GIPS answer for under a year);
  - simple × 365 ÷ days over total cost;
  - Texas A&M's capital-days, which reads higher because feed is paid gradually;
  - a money-weighted IRR from dated money events.

  Also decide:
  - a floor on days below which no rate a year is shown;
  - whether a loss is scaled at all.

- **Ticket 08, dairy.**
  - The unit: per cow per year (IFCN, Khan), per lactation (BLRI) or both.
  - Whether calves (at market) and cull sales count as the herd's return.
  - Whether Cost per Litre should, like IFCN's cost of milk, take calves, culls and dung off the keep first.
  - A lifetime figure can rank cows differently from a yearly one.
- **Ticket 09, what an Investor reads.** GIPS: a fixed-life pool reports a money-weighted since-inception return, not annualised before a year has passed.

### Take to the advisers

Nothing for the lawyer or the Shariah scholar arises from this ticket alone. Ticket 09 should show them any Investor-facing rate a year alongside the GIPS rule above.

---

## Unclear / not found

- **The published _Discover Agriculture_ version of Ferdush et al.** was not read in full. The preprint's tables were used. The publisher's page summary gives the same headline figures (68,813; 17,358; 1.25; 65.51%).
- **The rate behind Ferdush's "interest on operating capital"** is not stated. Neither is the wage used for family labour in Sarma 2014 or Ferdush.
- **Datta et al. 2019 and BLRI's buffalo study** were read in abstract only. Datta's cost basis (US$21 against US$79 revenue) cannot be checked.
- **No Bangladeshi study was found that states how deaths or home-bred animals enter a fattening return.**
- **No DLS publication** stating a return measure was found. DLS's figures reach us through the World Bank's appraisal of its project.
- **Bangladesh Bank's Agricultural and Rural Credit Policy** was not read, because bb.org.bd blocked access. The fattening refinance terms are from the press.
- **Kay, Edwards & Duffy, _Farm Management_, and the Farm Financial Standards Council's _Financial Guidelines_** were not read. Iowa State's C3-55 was used for the FFSC-style ratios. The FFSC PDF did not download.
- **The IFCN method's own documents** (Hemme's TIPI-CAL) were read only as Uddin 2010 describes them.
- **Dunn's paper is undated.** Its latest reference is 2002.

---

## Sources

**Bangladeshi studies**

- Sarma, P.K., Raha, S.K. & Jørgensen, H. 2014. An economic analysis of beef cattle fattening in selected areas of Pabna and Sirajgonj Districts. J. Bangladesh Agril. Univ. 12(1): 127–134: https://www.banglajol.info/index.php/JBAU/article/view/21402
- Sarma, P.K. & Ahmed, J.U. 2011. An economic study of small scale cattle fattening enterprise of Rajbari district. J. Bangladesh Agril. Univ. 9(1): 141–146: https://www.banglajol.info/index.php/JBAU/article/view/8756
- Ferdush, J. et al. 2026. Economics of cattle fattening focusing on profitability and marketing efficiency in selected areas of Bangladesh. Discover Agriculture 4: 15: https://link.springer.com/article/10.1007/s44279-025-00321-5 (read as the preprint: https://www.qeios.com/read/WHWLTS.2/pdf)
- Uddin, M.M., Sultana, M.N., Ndambi, O.A., Hemme, T. & Peters, K.J. 2010. A farm economic analysis in different dairy production systems in Bangladesh. LRRD 22(7) #122: https://lrrd.org/lrrd22/7/uddi22122.htm
- Khan, M.K.I., Miah, G., Huque, K.S., Khatun, M.J. & Das, A. 2012. Economic and genetic evaluations of different dairy cattle breeds under rural conditions in Bangladesh. LRRD 24(1) #20: http://www.lrrd.org/lrrd24/1/khan24020.htm
- Alam, M.A., Sampa, A.Y., Anny, S.A. & Afrin, S. 2022. Financial profitability analysis of dairy milk production in some selected areas of Bangladesh. IJARIT 12(1): 182–187: https://doi.org/10.3329/ijarit.v12i1.61050 (PDF via https://zenodo.org/records/7086280)
- Datta, A.K., Haider, M.Z. & Ghosh, S.K. 2019. Economic analysis of dairy farming in Bangladesh. Trop. Anim. Health Prod. 51(1): 55–64 (abstract only): https://pubmed.ncbi.nlm.nih.gov/30003526/
- Islam, S., Nahar, T.N., Begum, J., Deb, G.K., Khatun, M. & Mustafa, A. 2021. Economic Evaluation of Buffalo (Bubalus bubalis) Production in Bangladesh (book chapter; abstract only): https://zenodo.org/records/5137756
- World Bank 2018. Project Appraisal Document, Livestock and Dairy Development Project (P161246), paras 83–85: https://documents1.worldbank.org/curated/en/472591544410829587/pdf/project-appraisal-document-pad-P161246-11152018-636799896178312769.pdf

**Standard texts**

- FAO 1997. Farm Management for Asia: a Systems Approach (FAO Farm Systems Management Series 13), chapter 7: https://www.fao.org/4/w7365e/w7365e0a.htm; chapter 5: https://www.fao.org/4/w7365e/w7365e08.htm
- Kahan, D. 2008 (reprint 2013). Economics for Farm Management Extension. FAO Farm Management Extension Guide: https://www.fao.org/4/i3228e/i3228e.pdf
- Gittinger, J.P. Economic Analysis of Agricultural Projects, 2nd edition. World Bank EDI (World Bank Documents text copy): https://documents.worldbank.org/curated/en/584961468765021837/text/multi0page.txt

**Extension guides**

- Iowa State University. Livestock Enterprise Budgets for Iowa–2026 (AgDM B1-21, FM 1815, revised June 2026): https://www.extension.iastate.edu/agdm/livestock/pdf/b1-21.pdf
- Plastina, A. Financial Performance Measures for Iowa Farms (AgDM C3-55, FM 1845, revised September 2026): https://www.extension.iastate.edu/agdm/wholefarm/pdf/c3-55.pdf
- McGrann, J. 2019. Finished Cattle Retained Ownership Closeout's Profitability Analysis, User Manual. Texas A&M AgriLife Extension: https://agecoext.tamu.edu/wp-content/uploads/2020/07/D5a.-User-Manual-Finished-Cattle-Closeout-9-3-2019.pdf
- McGrann, J.M. & Bevers, S.J. 2006. Standardized Performance Analysis (SPA-1), cow-calf. Texas A&M: https://agecoext.tamu.edu/wp-content/uploads/2013/08/Spa-1.pdf
- Dunn, B.H. Measuring Cow-Calf Profitability and Financial Efficiency. Beef Improvement Federation (undated, c. 2003): https://beefimprovement.org/wp-content/uploads/2013/07/Measuring-Cow-Calf-Profitability.pdf

**Investment-performance standard**

- CFA Institute 2019. Global Investment Performance Standards (GIPS) for Firms 2020, provisions 1.A.35, 2.A.12, 2.A.29, 5.A.1: https://www.gipsstandards.org/wp-content/uploads/2021/03/2020_gips_standards_firms.pdf
- GIPS Q&A, Partial Period Returns: https://www.gipsstandards.org/qadatabase/5001/

**In this repo**

- Investify's Qurbani project terms, as read from its page: [`cattle-investment-schemes.md`](./cattle-investment-schemes.md) §1.3

**[SECONDARY]**

- The Daily Star, 22 March 2023, "Cattle fatteners to get loans from Tk 5,000cr BB fund": https://www.thedailystar.net/business/economy/news/cattle-fatteners-get-loans-tk-5000cr-bb-fund-3277391
