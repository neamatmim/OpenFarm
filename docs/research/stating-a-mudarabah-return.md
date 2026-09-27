# How a mudarabah return is stated to investors, and what makes a stated rate read as a promise

**Question:** A **Venture** is a mudarabah with the Owner as mudarib. Before an Investor is shown a return, either as a share of their capital or as a rate a year, on a settled Venture or on the **Projection**, find out how such a return is stated elsewhere, and what makes a stated rate read as a promise. The places to look are Bangladesh's Islamic banks, AAOIFI and the Shariah regulators, the Bangladeshi cattle and agri platforms, and the regulators. (Ticket: `.scratch/openfarm-roi/issues/02-how-a-mudarabah-return-is-stated.md`.)

**Researched:** 27 September 2026. Primary sources:

- **Islamic banks:** the banks' own profit-rate notices and product terms (Islami Bank Bangladesh, Al-Arafah, Social Islami, EXIM, Shahjalal, and the Islamic windows of Eastern Bank and Bank Asia); IBBL's 2024 and 2025 annual reports.
- **Bangladesh Bank:** its Guidelines for Conducting Islamic Banking (2009) with Appendix III; its rate circulars of 2020–2025; its press releases, read from its own site and the Internet Archive.
- **BSEC:** the Mutual Fund Rules 2025 and 2001, the Alternative Investment, Public Issue, Public Offer and Investment Sukuk Rules, and press releases, all from sec.gov.bd.
- **Statutes:** bdlaws.minlaw.gov.bd.
- **Shariah standards:** AAOIFI Shari'ah Standards 13, 17, 40, 45 and 47 (aaoifi.com); resolutions 30 and 123 of the International Islamic Fiqh Academy (iifa-aifi.org); Bank Negara Malaysia's Mudarabah and Investment Account policy documents; IFSB-9, IFSB-22 and GN-3.
- **Platforms:** the platforms' own pages and public APIs, live or archived.
- **Comparators:** GIPS, the SEC, FINRA, the UK FCA, EU PRIIPs, the Securities Commission Malaysia, and Pakistan's SECP and State Bank.

The parts on Bangladeshi banks, platforms, regulators and foreign rules were gathered by four research agents in parallel. The load-bearing quotes (SS 40 5/2, BNM G 16.10, GIPS 2.A.12, IBBL's Shariah reports, EBL's and Al-Arafah's terms, Freshie's FAQ, WeGro's 2024 FAQ, biniyog's API, the Consumer Rights Protection Act and the Mutual Fund Rules' item ৮) were checked again against the source. Bangla quotes from BSEC Gazette PDFs were read from page images, because the text layer is broken. News is used only for what happened in the collapsed schemes and is marked **[SECONDARY]**. **[SNIPPET]** means seen only in a search result. English renderings of Bangla are mine. **This is research, not legal or Shariah advice.**

---

## Answer for the ticket

1. **Bangladesh's Islamic banks state a mudaraba return as a rate a year, and always say whether it is "provisional" or "final".**
   - The rate a bank announces in advance is headed "Provisional Rate of Profit" at IBBL, Al-Arafah, Social Islami, EXIM, Shahjalal, Eastern Bank and Bank Asia.
   - The "Final Rate of Profit" is declared once the auditors have certified the year's income and the Shariah board has reported. It can come out lower. IBBL's 12-month term deposit was provisionally 8.25%, then 10.00%, then 10.50% during 2024, and its final rate was 9.19%.
   - The notices seldom print "p.a.", but the rate is annual. Bangladesh Bank's own chart lists these rates under "PERCENTAGE PER ANNUM".
   - The Bangla words are মুনাফার হার (profit rate), প্রাক্কলিত or সাময়িক হার (estimated or interim rate), চূড়ান্ত লাভের হার (final rate of profit), ওয়েটেজ (weightage) and "কমবেশী হতে পারে" (may be more or less).
2. **Bangladesh Bank requires the terms before the year and works out the rate after it.**
   - Its 2009 Guidelines require the profit-sharing ratio and the weightages to be disclosed before the year starts. The depositors' "Rate of Return" is then computed from actual income.
   - It sets no wording for a provisional rate, and no rule on displaying or advertising the rate was found.
   - Its rate policy has treated the mudaraba rate as an interest rate. The circulars from 2020 to 2024 are about "সুদ/মুনাফা হার" (interest/profit rate), and from 2021 to 2023 they barred term-deposit rates below inflation.
   - Since September 2025, a bank's promotional material and its method of calculating depositors' profit must be certified by its Shariah Supervisory Committee.
3. **The Shariah standards let a past return and an expected return be stated. What they forbid is setting the entitlement as a percentage of capital, as a fixed sum, or as a guarantee.**
   - Profit is shared by agreed ratio, "not ... a percentage of the capital" (AAOIFI SS 13 8/1; SS 40 4/1).
   - An "expected rate of return which is not considered to be binding if not achieved" is allowed, provided the final distribution follows realised profit (SS 40 5/2).
   - Whenever profit is mentioned in advertising, the method of calculating it must be disclosed (SS 47 §9).
   - Bank Negara Malaysia makes the split explicit. Profit "shall not be fixed in the form of a certain percentage of the capital" (S 16.9), but "the ex-post performance profit amount ... may be translated into a fixed percentage yield of the capital" (G 16.10).
   - **A settled Venture's return put as a share of capital describes a fact. It is not a term of the contract.** The Shariah risk lies in the Projection, and in anything that makes a stated figure binding in practice.
4. **A stated rate became a promise wherever it was paid whatever happened.**
   - IBBL's Shariah board, in its 2024 and 2025 reports, told the bank not to treat provisional rates as final when it topped depositors up "as 'Hiba'".
   - Al-Arafah's terms keep the provisional rate as a floor. If the final rate is lower, "ব্যাংকের কোন দাবী/আপত্তি থাকবেনা" (the bank will have no claim).
   - IFSB GN-3 says smoothing makes profit-sharing returns "behave more like those on conventional deposits", with expectations "based on the same interest rates".
   - Five merged Islamic banks made heavy losses in 2024–25. Bangladesh Bank first said that under Shariah no profit is due, then allowed a 4% rate after all **[SECONDARY]**.
5. **No Bangladeshi cattle or agri platform publishes a realised return as a percentage.**
   - biniyog.io's 290 completed campaigns still display their projected ROI, and the `finalizedROI` field is empty for every one.
   - DeenAgro's completed project shows only "প্রত্যাশিত মুনাফা" (expected profit).
   - Freshie Farm alone shows what investors got. It gives taka per share per batch ("বিনিয়োগকারির লাভঃ ৭২০০" on a Tk 55,000 share over six months) and never a percentage, because "% এর গ্যারান্টি দিলে সেটা সুদ হয়ে যায়" (a guaranteed % becomes interest).
   - Projections are stated per run. Several are annualised by plain multiplication: Investify's 8% over four months becomes "Annualized ROI 24%".
   - The offers that read as promises add "fixed", "secure", "insured" or "capital protection".
6. **Every scheme shut down, prosecuted or warned against promised a fixed figure before any result: a set amount a month per lakh, or a high rate.**
   - Nazran promised Tk 3,000 a month per lakh, with capital doubled in 33 months.
   - Ehsan Group promised Tk 1,800–2,000 a month per lakh, sold as "শরিয়ত সম্মত সুদবিহীন" (Shariah-compliant, interest-free).
   - Destiny promised "৪৬ শতাংশ হারে মুনাফা" (profit at 46%).
   - A savings cooperative in Meherpur was reported for bank-like deposits at 18–24%, where a bank then paid at most 5%.
   - Bangladesh Bank's warnings name "অস্বাভাবিক উচ্চ হারে মুনাফা" (unusually high profit) and deposit-taking "ব্যাংক-ব্যবসার অনুরূপ" (like banking).
   - **No case was found in which a profit-sharing return stated after the fact was held to be interest or a deposit, and none clearing one either.**
7. **Bangladeshi law has one rule on stating a past return. It binds only mutual funds, but its tests fit a Venture.** The BSEC Mutual Fund Rules 2025 (Fourth Schedule, carried over from 2001) say:
   - an advertisement is misleading if it presents past income so that it seems likely to recur, or states profit without the risk;
   - one that shows past performance must state how the rate was worked out;
   - it must also say that past performance is no indicator of future results "and is not a basis for comparison with other investments".

   The Consumer Rights Protection Act 2009 does not reach investments, because its "service" is a closed list. No BSEC or Bangladesh Bank rule on annualising was found.

8. **For a run shorter than a year, a rate a year is a simulated figure in the regimes for risk investments.**
   - GIPS 2.A.12 says: "Returns for periods of less than one year must not be annualized". Its handbook explains that the extrapolation "produces a simulated return".
   - EU PRIIPs shows projections for holdings under a year "non-annualised".
   - The regimes that do annualise short periods are those for bank accounts and income funds: Islamic bank deposits, BNM's investment accounts, and Pakistan's money-market and income funds (its equity funds are not annualised). An annual rate on a four-month Venture therefore puts it beside a bank account in the reader's eye.
   - Where a regulator allows a short period to be annualised, it wants the formula shown and a "no certainty" line (FINRA 2220).
9. **For OpenFarm:**
   - **The settled return.** Show a settled Venture's return first in taka and as a share of capital over the Venture's own days, worked from the Settlement. Show a loss the same way.
   - **The rate a year.** It may sit beside that share, labelled as the share scaled to a year and with the working shown. It never stands alone.
   - **The Projection.** Never show it as a rate a year. At most, show it as a low–high share of capital over the run, under "an estimate, not a promise".
   - **Words.** Avoid "মুনাফার হার", which is the banks' and Bangladesh Bank's word for a deposit rate. Avoid "নিশ্চিত", "নির্ধারিত", "ফিক্সড" and "secure".
   - **No top-ups.** Never top an Investor up to any stated figure.
   - **No past results on offers.** Keep a past result off every offer.
   - **Advisers first.** The wording, the rate a year and any bank rate beside it go to the lawyer and the Shariah scholar before any switch turns on.

---

## Summary table

| Who                             | What is stated                                                                                 | Before or after the result                     | As a rate a year?                                                                                       | What keeps it from reading as a promise                                                                                                                                                                   | Source                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Islamic banks, provisional rate | A % for each deposit product                                                                   | Before: for the months ahead                   | Yes, though "p.a." is seldom printed                                                                    | Headed "Provisional". Final rate declared after audit. EBL: "indicative, non-guaranteed (not part of the Mudarabah contract)". **Undone** where the provisional rate works as a floor (AIBL; IBBL's hiba) | IBBL, AIBL, SIBL, EXIM, SJIBL, EBL, Bank Asia notices |
| Islamic banks, final rate       | A % for each product, per year                                                                 | After: audited accounts and the Shariah report | Yes                                                                                                     | It is the result. IBBL has published one for most years since 2013                                                                                                                                        | IBBL final-rate notices; annual reports 2024, 2025    |
| Bank Asia                       | Realised rate month by month                                                                   | After                                          | "Annualized Profit Rate"                                                                                | Under "Historical Rate of Profit"                                                                                                                                                                         | Bank Asia Islamic window                              |
| Bangladesh Bank                 | Sharing ratio and weightage before; "Rate of Return" after                                     | Both                                           | Yes                                                                                                     | Terms disclosed before the year; result computed after                                                                                                                                                    | 2009 Guidelines, App. III; IBRPD Circ. 01/2025        |
| AAOIFI, IIFA                    | An expected rate is allowed; the final split follows realised profit                           | Both                                           | Not addressed for mudarabah. An annualised % is allowed in financing "with full disclosure" (SS 47 §10) | Not binding; method disclosed; no guarantee                                                                                                                                                               | SS 13, 17, 40, 47; IIFA 30, 123                       |
| Bank Negara Malaysia            | Past profit as a % yield on capital; projections as best, flat and worst case                  | Both                                           | Yes: rate × days/365                                                                                    | No "fixed return" wording; "NOT A DEPOSIT PRODUCT"; "past performance is not indicative"                                                                                                                  | Mudarabah PD 2015; Investment Account PD 2017         |
| IFSB                            | Historical returns as a % of funds, by maturity                                                | After                                          | Yes                                                                                                     | "not projections or estimates"; the rate paid and the rate earned shown apart                                                                                                                             | IFSB-22; GN-3                                         |
| BSEC, mutual funds              | Past performance in advertisements                                                             | After                                          | Not addressed                                                                                           | Method stated; "no indicator of future results"; "not a basis for comparison with other investments"                                                                                                      | Mutual Fund Rules 2025, 4th Sch.                      |
| Freshie Farm                    | Taka profit per share per batch                                                                | After                                          | **No %, ever**                                                                                          | "a guaranteed % becomes interest"                                                                                                                                                                         | freshie.farm                                          |
| biniyog.io                      | Projected % and "annualized"                                                                   | Before, and still after completion             | Yes: (roi ÷ months) × 12                                                                                | Murabaha fixed mark-up; "Compensation is not guaranteed"                                                                                                                                                  | biniyog.io and its API                                |
| WeGro                           | Projected range for the run                                                                    | Before                                         | No, per run                                                                                             | 2026: "does not guarantee returns". 2024: loss "supported by WeGro as a marketing cost"                                                                                                                   | wegro.global                                          |
| Investify                       | "Proj. ROI (4 Months) 8%", "Annualized ROI 24%"                                                | Before                                         | Yes, by multiplication                                                                                  | None beside the figure; "Secure high returns"                                                                                                                                                             | investify.fund                                        |
| DeenAgro                        | "প্রত্যাশিত মুনাফা", "১২%+ বার্ষিক রিটার্ন"                                                    | Before, and still after completion             | Yes                                                                                                     | Contract: estimated monthly profit "not final"                                                                                                                                                            | deenagro.com                                          |
| iFarmer / iharvst               | "fixed return" (2020), then "Estimated Earning" range (2022), then "Projected Earnings" (2026) | Before                                         | No, per run                                                                                             | "projected"                                                                                                                                                                                               | Internet Archive; [SECONDARY]                         |
| Collapsed schemes               | Tk X a month per lakh; capital doubled                                                         | Promised before; paid monthly                  | Monthly                                                                                                 | None                                                                                                                                                                                                      | [SECONDARY] news                                      |
| GIPS, PRIIPs, SEC               | Past return under a year; projections                                                          | Both                                           | **Never under a year**                                                                                  | "not annualized" label; scenarios                                                                                                                                                                         | GIPS 2.A.12; PRIIPs Annex IV pt 45; Form N-1A         |

---

## 1. Islamic banks in Bangladesh

### 1.1 A provisional rate first, a final rate after

**Islami Bank Bangladesh PLC (IBBL).** Its "Profit Rate on Deposits" page ([islamibankbd.com](https://www.islamibankbd.com/profit-rates-on-deposits)) lists two kinds of notice.

- **Provisional notices.**
  - Example: "Provisional Rates of Profit on different types of Mudaraba Deposits with effect from 01.01.2026" ([PDF](https://www.islamibankbd.com/public/assets/profit-rate-main/1775551629_Provisional%20Profit%20rates%20w.e.f.%2001.01.2026.pdf)).
  - Columns: "Existing Provisional Rates | Revised Provisional Rates w.e.f 01.01.2026 | Remarks". The remarks read "Unchanged" or "w.e.f. …".
  - Sample row: "Mudaraba Term Deposits … 12 Months 10.00% 10.00% Unchanged".
  - There is no "p.a.", no disclaimer, and no word on the sharing ratio or on loss.
- **Final notices.**
  - Example: "Final Rates of Profit on Mudaraba Deposits for the year 2024" ([PDF](https://www.islamibankbd.com/public/assets/profit-rate-main/1767676496_Final%20Rates%202024%20for%20website.pdf)), with one column, "Final Rates of profit".
  - Final-rate notices are listed for 2013–2016, 2018–2021, 2023 and 2024. 2025's final rates are so far only in the annual report.
- **No Bangla notices.** IBBL publishes no Bangla rate notice.

The product pages say what the provisional rate is for:

- **Mudaraba Savings Account.** "This principle offers depositors an agreed portion of business profit and assigns risk for any genuine loss. Islami Bank distributes a minimum 65% of its investment income among all Mudaraba accounts as per waitage." Also: "Profit on provisional basis is paid twice a year. Additional amount (if any) is paid after annual calculation of Final Rate".
- **Mudaraba Monthly Profit Deposit Account.** "The profit amount shall be adjusted on completion of each accounting year after declaration of final rate of profit."
- **Annual Report 2024, note 3.17.2** ([PDF](https://www.islamibankbd.com/public/assets/annual-report/1761203020_Annual_Report_2024.pdf)). Profit is paid "at provisional rate on half-yearly/yearly/anniversary basis considering overall projected growth, performance and profitability of the Bank during the year. Final Rates of profit of any accounting year are declared after finalization of Shari'ah Inspection report and certifying the Investment Income of the Bank by the statutory auditors." The 2025 report says the same.

**Al-Arafah Islami Bank (AIBL)** gives the Bangla wording, in its contract terms (চুক্তির শর্তাবলী):

- **Rate notice** ([PDF, 27 September 2026](https://www.aibl.com.bd/wp-content/uploads/2026/09/Deposit-Rate-24.9.2026-v2.pdf)). "Provisional Profit Rate (Effective from 27/09/2026)", "12 Month MTDR 9.00%".
- **Term deposit, clause গ** ([page](https://www.aibl.com.bd/deposit/mudaraba-term-deposit-mtdr/)). "ব্যাংক মুদারাবা তহবিল বিনিয়োগ করে উক্ত বিনিয়োগের আয়ের শতকরা ৭০% মুদারাবা ... জমাকারীদের মধ্যে ওয়েটেজ ভিত্তিতে বন্টণ করে। ওয়েটেজ এবং বিনিয়োগ আয় বণ্টণের হার ব্যাংক এককভাবে নির্ধারণ করে।" (The bank distributes 70% of the income on the mudaraba fund among depositors by weightage. The bank alone sets the weightage and the rate of distribution.)
- **Term deposit, clause ৬.** "বাৎসরিক চুড়ান্ত লাভের হার ঘোষিত হওয়ার পূর্বে কোন জমা হিসাব বন্ধ হয়ে গেলে উক্ত জমাকারী গত বৎসরের সাময়িক হারে লাভ নিতে বাধ্য থাকবে। পরবর্তীকালে এ ধরনের জমার উপর লাভের হার কম ঘোষিত হলে জমাকারী বা ব্যাংক কাহারো কোন দাবী থাকবে না।তবে লাভের হার বেশী হলে তা গ্রাহককে প্রদান করা হবে।" (An account closed before the annual final rate is declared takes last year's interim rate. If the final rate comes out lower, neither side has a claim. If it is higher, the difference is paid to the customer.)
- **Savings deposit, clause ৫** ([page](https://www.aibl.com.bd/deposit/mudaraba-savings-deposit-msd/)). "বার্ষিক লাভ-লোকসান হিসাব চূড়ান্ত হওয়ার পূর্বে প্রাক্কলিত হারে লাভ প্রদান করা হয় ।" (Before the annual profit-and-loss account is final, profit is paid at an estimated rate.) If the final rate is higher the difference is credited; if lower, "ব্যাংকের কোন দাবী/আপত্তি থাকবেনা" (the bank will have no claim).
- **Ahsan scheme, clause ১০** ([page](https://www.aibl.com.bd/deposit/mudaraba-ahsan-deposit-scheme/)).
  - "মেয়াদান্তে প্রাক্কলিত মুনাফাসহ সম্ভাব্য প্রাপ্য টাকার পরিমাণ নিম্নোক্ত ছকে দেখানো হলো । প্রকৃত হিসাব অনুযায়ী প্রতি বৎসরান্তে মুনাফার অংক গ্রাহকের হিসাবে জমা করা হয় । মেয়াদান্তে প্রকৃত মুনাফার পরিমাণ প্রাক্কলিত মুনাফার পরিমাণের চেয়ে কমবেশী হতে পারে।" (The table shows the probable amount receivable at maturity, with estimated profit. Actual profit is credited each year end, and it may be more or less than the estimate.)
  - Clause গ of the same terms: "বিনিয়োগে লোকসান হলে মুদারাবা জমাকারীগণ তা বহন করবেন।" (If the investment makes a loss, the mudaraba depositors bear it.)
- **Internal circular of 28 January 2025** ([PDF](https://www.aibl.com.bd/wp-content/uploads/2025/01/Re-Fixation-of-Rate-Installment-Size-Period-of-Scheme-28.01.2025.pdf)).
  - It heads a table "প্রাক্কলিত মুনাফার হার ১০.০০%" (estimated profit rate 10.00%).
  - It instructs branches: "ডিপোজিট স্কীমসমূহের প্রাক্কলিত মুনাফার পরিমান কম/বেশী হতে পারে তা হিসাব খোলার প্রাক্কালে গ্রাহককে অবহিত করতে হবে এবং হিসাব খোলার ফরমে গ্রাহকের সম্মতি সূচক স্বাক্ষর গ্রহন করতে হবে।" (At account opening, tell the customer that the estimated profit may be less or more, and take their signature of consent on the form.)

**The other banks.**

- **Social Islami Bank.** "Provisional Profit Rate" ([PDF](https://www.siblbd.com/assets/downloads/Provisional-Profit-Rate-01-02-2026.pdf)), where new rates apply to existing deposits too. "Weightage on the rate of return is given to deposits of longer maturity."
- **EXIM Bank** ([page](https://www.eximbankbd.com/deposit/Deposit_Rates)).
  - Columns: "Weightage | Provisional Rate of Profit | Net payable after deduction of 10% tax for Tk. 1.00 lac" (the net payable is a taka sum).
  - Heading: "estimated payable after maturity ( may be more or less)".
  - The term-deposit page speaks of "a commitment to return his/their deposited money with more or less certain percentage of profit". That wording leans towards a promise.
- **Shahjalal Islami Bank.** "Provisional Rate of Profit" ([page](https://sjiblbd.com/profit_rate.php)).
- **Eastern Bank, Islamic window** ([page](https://ebl.com.bd/islamic/profit-distribution)). This is the plainest statement found:
  - "To comply with regulatory requirements, the Bank distributes profit to Mudarabah depositors at a provisional rate, which is indicative, non-guaranteed (not part of the Mudarabah contract), and subject to adjustment after finalization of actual profits at the year-end. Upon finalization, any shortfall with the provisional rate shall be credited to the customer's account, and any excess profit paid by the Bank may be deducted from the customer's account."
  - It states its sharing ratio: "35:65".
- **Bank Asia, Islamic window** ([page](https://www.bankasia-bd.com/islamic/product/Profit-on-Deposit)).
  - "Hereby the rate of profit paid is variable."
  - It is the only bank found that publishes realised rates month by month, under "Historical Rate of Profit" and "Month wise Annualized Profit Rate" ([PDF](https://www.bankasia-bd.com/downloads/IProfit_Rate_November_2024.pdf)). Example: 1-year term deposit, 7.64% … 8.02% for the months of 2024.

### 1.2 How far the final rate moved from the provisional rate (IBBL)

| Product                        | Year | Provisional rates in force                                          | Final rate |
| ------------------------------ | ---- | ------------------------------------------------------------------- | ---------- |
| Term deposit, 12 months        | 2023 | 6.85%                                                               | 6.85%      |
| Term deposit, 12 months        | 2024 | 8.25% (from 14.01.2024) → 10.00% (25.06.2024) → 10.50% (01.11.2024) | **9.19%**  |
| Term deposit, 12 months        | 2025 | 10.50% → 10.25% (16.07.2025) → 10.00% (01.10.2025)                  | 10.25%     |
| Monthly profit scheme, 5 years | 2023 | 6.25% → 7.15% (07.05.2023)                                          | **6.80%**  |
| Monthly profit scheme, 5 years | 2024 | 10.70% → 12.00%                                                     | **11.21%** |

A final rate below the provisional rate is a real result, not a formality. [SECONDARY]: a former BIBM faculty member told the Daily Star in 2020 that Bangladesh's Islamic banks "hardly change the profit rate at the end of the year, which is fictitious in true sense". The table shows that IBBL's final rates have moved since then.

### 1.3 Where the provisional rate worked as a promise

- **IBBL's Shari'ah Supervisory Council, Annual Report 2024 (p. 190).** "Profit distribution for Mudaraba Deposit Accounts has been carried out in accordance with the ratios and weightages mentioned in the contracts … However, the instruction has been given not to treat the provisional profit rates as final rates while giving additional profit to the dipositors as 'Hiba' from the bank."
- **The Committee again, Annual Report 2025 (p. 197).** "Mudaraba depositors were also given additional profit (hibah) by the bank. However, instructions has been given that, in granting such additional profit (hibah), the provisional profit rate should not be treated as the final rate."
- **Read together.** The bank paid depositors more than the ratios and weightages gave them, as a gift from its own side. The Shariah board had to say, two years running, that this must not turn the provisional rate into the final one.
- **AIBL's clauses ৫ and ৬** do the same by contract. If the final rate is lower, the bank makes no claim, so a depositor never gets less than the provisional rate. EBL is the counter-example: it "may" take the excess back.
- **The product copy can slip too.** IBBL's Senior Citizen Monthly Profit scheme page says it offers "guaranteed monthly profit payouts". The same page says "the rate of profit paid is variable" and "Profit on provisional basis is paid every month". A bank's own marketing line contradicts its terms.
- **The five merged banks [SECONDARY].**
  - Bangladesh Bank officials told the Daily Star in January 2026: "শরিয়াহ অনুযায়ী, ব্যাংক লোকসানে থাকলে কোনো মুনাফা বণ্টন করা হয় না।" (Under Shariah, when a bank is in loss, no profit is distributed.)
  - On 22 January 2026 Bangladesh Bank allowed "a provisional profit at an annual rate of 4 percent" instead (Daily Star, 22 January 2026; the URL was not captured).
  - The Governor said depositors would get 4% for 2024 and 2025, paid by the government as ex gratia, because "ওই দুই বছরে একীভূত হওয়া পাঁচটি ব্যাংকই বড় ধরনের লোকসানে ছিল" (all five merged banks were in heavy loss in those two years) ([BSS, 29 January 2026](https://www.bssnews.net/bangla/trade/278187)).
  - No primary Bangladesh Bank document was found for either decision.
  - This is the Bangladeshi case in point. Depositors treated a mudaraba rate as owed, and when the banks' losses left no profit to share, the state paid a rate anyway.

---

## 2. What Bangladesh Bank requires

### 2.1 Guidelines for Conducting Islamic Banking (BRPD Circular 15, 9 November 2009)

Read via the Internet Archive ([guidelines](http://web.archive.org/web/20250605151255/https://www.bb.org.bd/aboutus/regulationguideline/islamicbanking/guideislamicbnk.pdf); [circular](http://web.archive.org/web/20240715144513/https://www.bb.org.bd/mediaroom/circulars/brpd/nov092009brpd15e.pdf)). The circular says the guidelines are issued under s.45 of the Bank Company Act and are "supplementary, not substitute, to the existing banking laws".

- **Section IV, on mudaraba deposits:** "Profit, if any, is divisible between the Sahib-Al-Maal and the Mudarib at a predetermined ratio, while loss, if any, is borne by the Sahib-Al-Maal."
- **Section VIII, Framework of Rate of Return:** "Losses, if any, will be borne by the depositor unless the loss is due to the negligence by the bank … it is essential to ensure calculation of rate of return in a fair and equitable manner."
- **Appendix III, principles:**
  - (ii) "Profit sharing ratio (PSR) … should be declared before the starting of accounting year/at the time of Mudaraba contract and to be duly disclosed to the Mudaraba depositors."
  - (iii) The ratio "cannot be reduced after the declaration is done for any accounting year."
  - (ix) The weightage and any change to it "should be disclosed to Mudaraba depositors before the starting of any accounting year/ Mudaraba contract."
- **Appendix III, Annexure 3.** "Rate of Return = Share of Distributable Profit of Individual Mudaraba Deposit … x 100 / Total Yearly Product of Individual Mudaraba Deposits". The product weights each taka by the time it stayed in the pool.
- **Appendix III, s.7:** banks must keep "the records of calculation of rate of return" and publish a board-approved framework of rate of return.
- **What the guidelines lack.** They never use "provisional" for depositors; the only use is for Bangladesh Bank's own liquidity support (Section VI). They say nothing on guarantees beyond putting the loss on depositors, and nothing on how a rate may be advertised.

### 2.2 The mudaraba rate treated as an interest rate

- **BRPD Circular 03, 24 February 2020.** "ঋণ/বিনিয়োগ এর সুদ/মুনাফা হার যৌক্তিকীকরণ" (rationalising the interest/profit rate on loans and investments). It set a 9% cap from 1 April 2020.
- **BRPD Circular 17, 8 August 2021** ([archive](https://web.archive.org/web/20210812171006/https://bb.org.bd/mediaroom/circulars/brpd/aug082021brpd17.pdf)). Headed "আমানতের সুদ/মুনাফা হার যৌক্তিকীকরণ" (the interest/profit rate on deposits). 3(ক): the "সুদ/মুনাফা হার" on individuals' term deposits "মূল্যস্ফীতি হার অপেক্ষা কোনক্রমেই কম নির্ধারণ করা যাবে না" (may in no case be set below the inflation rate). **The regulator set a floor under a profit-sharing return.** Circular Letter 75 of 12 December 2023 revoked it.
- **BRPD Circular 09, 19 June 2023 (SMART).** Shariah-based banks set investment profit rates by adding a margin to SMART.
- **BRPD Circular 10, 8 May 2024.** "Interest/Profit Rate of Loan/Investment". Rates were freed, and "Islamic Sharia'h based banks shall determine profit rate following the above instructions".
- **Bangladesh Bank's rate chart** ([archive, February 2025 data](https://web.archive.org/web/20250512095317/https://www.bb.org.bd/en/index.php/financialactivity/interestdeposit)). "ANNOUNCED INTEREST RATE CHART Of The SCHEDULED BANKS (DEPOSIT RATE)(PERCENTAGE PER ANNUM)". It lists Islami, Al-Arafah, EXIM, SIBL and Shahjalal among the conventional banks without distinction. IBBL's line matches its provisional rates from 1 January 2025.
- **[SECONDARY]** In March 2020 a Bangladesh Bank official told the Daily Star that the 9–6 rate bounds "will also be applicable for Islamic lenders" ([Daily Star](https://www.thedailystar.net/business/news/the-curious-rise-islamic-banking-bangladesh-1880035)). **No circular setting the 6% deposit rate was found.**
- **In law, a mudaraba deposit is a deposit.** The Deposit Protection Ordinance 2025 (No. 64 of 2025; [bdlaws](http://bdlaws.minlaw.gov.bd/act-details-1577.html)) defines আমানত as "সুদ বা মুনাফাভিত্তিক অথবা সুদ বা মুনাফাবিহীন" (interest- or profit-based, or neither). It has since been replaced by the Deposit Protection Act 2026, which was not read.

### 2.3 The Shariah committee certifies the words and the method (IBRPD Circular 01, 28 September 2025)

[PDF](https://www.bb.org.bd/mediaroom/circulars/ibrpd/sep282025ibrpd01.pdf):

- 7(ক): all policies, contracts, products, services "এবং প্রচারণা সামগ্রী" (and promotional material) must be certified by the Shariah Supervisory Committee.
- 7(খ): "লাভ/ক্ষতি এবং ইনভেস্টমেন্ট অ্যাকাউন্ট হোল্ডারদের/আমানতকারীদের অনুকূলে প্রদেয় মুনাফা হিসাবায়ন পদ্ধতি SSC কর্তৃক তত্ত্বাবধান ও প্রত্যয়ন করতে হবে" (the method of calculating profit and loss, and the profit payable to depositors, must be supervised and certified by the SSC).
- 7(জ): the committee's decision on Shariah matters is final.

The Venture is not a bank, but this is the pattern the farm already follows by taking the wording to its own Shariah scholar.

### 2.4 What was not found

No Bangladesh Bank rule requiring banks to display or advertise deposit or profit rates in a set form was found. Circulars checked: BRPD 27/2010, 02/2012, 04/2012 and Circular Letter 09/2011, which is about lending rates. A 2026 circular refers to BRPD 27/2010 as covering "interest calculation, display, and disclosure", but the text read has no display rule. The Central Shariah Board for Islamic Banks of Bangladesh has published no guidance on its site. [SECONDARY]: the Financial Express reports it favours an Income Sharing Ratio method under which "Provisional rate is not required … The profit rate obtained in the ISR is always an 'output'" ([FE, 6 July 2023](https://today.thefinancialexpress.com.bd/views-opinion/isr-module-in-islamic-banking-1688565507)).

---

## 3. AAOIFI and the Shariah regulators

### 3.1 A share of profit, never a percentage of capital, never guaranteed

**AAOIFI Shari'ah Standard 13, Mudarabah** (issued 16 May 2002; [PDF](https://aaoifi.com/wp-content/uploads/2020/08/SS-13-Mudarabah.pdf)):

- **8/1:** "The distribution of profit must be on the basis of an agreed percentage of the profit and not on the basis of a lump sum or a percentage of the capital."
- **8/5:** a stipulated lump sum voids the contract.
- **8/7:** "No profit can be recognised or claimed unless the capital of the Mudarabah is maintained intact … the distribution of profit depends on the final result of the operations at the time of liquidation".
- **8/8:** profit may be paid "on account", to be revised on actual or constructive valuation.
- **The Shari'ah basis:** "It is also not permissible to provide money in return for a periodic pre-agreed payment (rent) to a person who is willing to invest it as this will constitute a debt with Riba."

That last sentence describes exactly what the collapsed schemes sold (§5).

**SS 40, Distribution of Profit in Mudarabah-Based Investment Accounts** (issued 19 June 2009; [PDF](https://aaoifi.com/wp-content/uploads/2020/08/SS-40-Distribution-of-Profit-in-Mudarabah-Based-Investment-Accounts.pdf)):

- **4/1:** distribution is "in terms of ratios, and not at all by specifying a lump sum amount or a percentage of the capital for any party".
- **2/2/2:** the institution "should not assume the commitment to pay any fixed or variable increment on the principal amounts" of current accounts, "because such payment constitutes usurious interest". It "is not committed to guarantee investment accounts".

**Guarantees in offer documents:**

- **SS 17, Investment Sukuk,** 5/1/8/7: the prospectus "must not include any statement" that the issuer guarantees "a fixed percentage of profit". 5/1/8/6: it must state that each holder "participates in the profit and bears a loss".
- **International Islamic Fiqh Academy, Resolution 30 (5/4), 1988** ([iifa-aifi.org](https://iifa-aifi.org/en/32300.html)): "Neither the prospectus nor the Muqāraḍah bonds should contain a guarantee, from the fund manager, for the capital or a fixed profit or a profit based on a percentage". Also: "The profit and loss account of the project must be published and under the control of shareholders."

### 3.2 An expected rate is allowed, if it is not binding

- **SS 40, 5/2:** "There is no prohibition against setting an expected rate of return which is not considered to be binding if not achieved, even if it is reached through a feasibility study. However, final distribution of profits should be based on realization of profit after actual or constructive liquidation, rather than on such expected rate of return."
- **SS 40, 5/3:** advances before liquidation are allowed. Afterwards "the institution is committed to make necessary additions to, or deductions from, the advanced amounts". The true-up runs both ways.
- **SS 40, 5/6:** if the mudarib gives up part of its own share to the account holders after liquidation, "the institution should disclose that".
- **IIFA Resolution 123 (5/13), 2001, Tenth** ([iifa-aifi.org](https://iifa-aifi.org/en/32844.html)): "It is permissible in Shariah to set up a rate of expected profit and stipulate that if realized profit exceeds that rate, the Muḍārib shall be entitled to a specific share of this increment."
- **SS 47, Rules for Calculating Profit in Financial Transactions** (issued 29 May 2011; [PDF](https://aaoifi.com/wp-content/uploads/2020/08/SS-47-Rules-for-Calculating-Profit-in-Financial-Transactions.pdf)), 7/2: a capital provider may restrict the mudarib to activities where "the expected profit rate" is above a figure, "taking into consideration that it is not permissible to either guarantee the capital, or the profit or both".

### 3.3 A realised profit may be put as a yield on capital

**Bank Negara Malaysia, Mudarabah policy document** (BNM/RH/STD 028-8, 20 April 2015; [PDF](https://www.bnm.gov.my/documents/20124/938039/Mudarabah.pdf/2ea1c2df-b084-1b3b-f640-d7993d1e38ea)). "S" is a binding standard and "G" is guidance.

- **S 16.3:** "A mudarib shall not guarantee any profit."
- **S 16.9:** "The profit shall not be fixed in the form of a certain percentage of the capital."
- **G 16.10:** "Notwithstanding paragraph 16.9, the ex-post performance profit amount (based on the PSR which had been mutually agreed upon between the rabbul mal and the mudarib) may be translated into a fixed percentage yield of the capital."

This is the most direct regulatory text found on the question. The ban on "a percentage of the capital" in SS 13 8/1 and S 16.9 is about how the entitlement is set. It does not stop a result, once known, being expressed as a share of capital.

### 3.4 Say how the figure was worked out

**SS 47:**

- **§9:** "The Institution Must Disclose Its Method of Profit Calculation and allow its clients to inquire about such methods. Likewise, it must disclose such methods when mentioning profit in its advertising campaigns and product marketing brochures in order to prevent any deception."
- **8/2:** institutions "must avoid any methods of profit calculation or distribution that are misleading or deceptive".
- **§10:** a profit may be calculated "on the basis of an annualised percentage" in a financing, "provided that it does so transparently and with full disclosure".

**AAOIFI on annual rates.** No AAOIFI text was found on putting a _mudarabah_ result as an annual rate. The annualised percentage in SS 47 §10 concerns sale-based financing.

### 3.5 Smoothing turns a profit rate into a deposit rate

**IFSB GN-3, Smoothing the Profits Payout to Investment Account Holders** (December 2010; [PDF](https://www.ifsb.org/wp-content/uploads/2023/10/eng_GN-3_Guidance_Note_on_the_Practice_of_Smoothing.pdf)):

- **¶47:** "One economic result of Smoothing through reserves such as PER is, effectively, making the returns on UIAH behave more like those on conventional deposits – that is, a debt instrument."
- **¶52:** "The practice of Smoothing has the effect of blurring a key distinction between the Islamic and the conventional financial sectors. If UIAH are aware of Smoothing practices in the past, which kept the payouts to UIAH roughly in line with the prevailing market rates of interest on conventional deposits, and if they expect the same practices to continue into the future, this implies that they will form expectations of future returns which are based on the same interest rates."
- **¶74:** institutions "should also distinguish between 'distribution rate' and 'profit rate'".

**Other regulators on the same point:**

- **IFSB-9, Conduct of Business** (December 2009; [PDF](https://www.ifsb.org/wp-content/uploads/2023/10/ifsb9.pdf)), ¶58: account holders "need to be made aware that the IIFS as Muḍārib … cannot guarantee that there will be no capital impairment". Its appendix flags a mudarib subsidising the return when profit falls below a benchmark as "in effect, a guarantee of interest".
- **BNM Investment Account policy document** (BNM/RH/PD 028-63, 10 October 2017; [PDF](https://www.bnm.gov.my/documents/20124/938039/IAF+Final_9Oct_5y.pdf/1045e582-fcb6-449c-73d0-2d1a533ccf06)), S 13.5: "The IFI must not implement profit smoothing practices or displaced commercial risk (DCR) techniques."
- **Pakistan does the opposite.** The State Bank now lets banks "forego a part of its Mudarib share as hiba to meet the market expectation in case of lower than expected/market returns" (IFPD Circular 09, 26 November 2024).

### 3.6 What investors are told: history, not projections

- **IFSB-22, Revised Standard on Disclosures** (December 2018; [PDF](https://www.ifsb.org/wp-content/uploads/2023/10/IFSB-22-December-2018_En.pdf)):
  - Table 8 item 17: "Profits earned and profits paid out over the past three to five years (amounts and as a percentage of funds invested)".
  - Item 19: "Average actual rate of return or profit rate on UPSIA by maturity".
  - ¶88: "These disclosures shall contain true, factual and balanced statements, and not projections or estimates of future performance … IIFS shall ensure that IAH are aware of the possibility of full or partial impairment of their capital and profit-rate fluctuations."
  - ¶90: historical returns are shown "compared to general market returns".
- **BNM Investment Account policy document:**
  - **S 24.5:** "The IFI shall not represent or use any terms that indicate the investment account product as principal and/or profit guaranteed or equivalent or similar to an Islamic deposit product. For example the use of the terms such as 'fixed return' or 'fixed income' and 'investment deposit'."
  - **S 25.2(h), past and future performance:**
    - past performance uses actual returns of up to five years, and the IFI "must clearly state that past performance is not indicative of future performance";
    - projections show "best case (where feasible), flat case and worst case scenarios, showing a range of potential gains or losses";
    - future performance "shall not appear as the most prominent feature".
  - **Mandated warnings:**
    - "THIS IS AN INVESTMENT ACCOUNT PRODUCT THAT IS TIED TO THE PERFORMANCE OF THE UNDERLYING ASSETS, AND IS NOT A DEPOSIT PRODUCT."
    - "THE PRINCIPAL AND RETURNS ARE NOT GUARANTEED AND CUSTOMER RISKS EARNING NO RETURNS AT ALL".
  - **The product disclosure example** states a "Gross rate of return = 5.36%" and prorates it by "180/365 Days". A rate a year is the unit even for a six-month account.

---

## 4. Cattle and agri platforms in Bangladesh

All pages were read on 27 September 2026. Archived pages are cited by their capture. `cattle-investment-schemes.md` §1–2 covers each scheme's terms. What follows is only how they state a return.

### 4.1 Nobody publishes a realised percentage

- **biniyog.io.**
  - The Funded Campaigns page loads 290 campaigns with status COMPLETED from its public API.
  - Each card renders the _projected_ ROI as "`x`% return in `n` months" and "annualized". The annual figure is computed as `(roiMin / durationInMonths) * 12`.
  - The API has a `finalizedROI` field. **It is null for all 290.** A completed campaign therefore still shows what was projected, not what was paid.
  - [SECONDARY] Future Startup, 7 May 2026, reports "annualized returns in the range of 15–18% … These returns are not guaranteed" and a 3.75% non-performing rate. The API also marks 16 instalments "DELAYED".
- **DeenAgro** ([deenagro.com](https://deenagro.com/)).
  - Its one completed ("সম্পন্ন") project shows only "প্রত্যাশিত মুনাফা ১৫–২০%" (expected profit 15–20%).
  - Its "স্বচ্ছতা ড্যাশবোর্ড" (transparency dashboard) shows "বণ্টিত লাভ" (profit distributed), but the page's own code computes that figure from the _capital_ of completed projects.
  - The hero line is "১২%+ বার্ষিক রিটার্ন" (12%+ annual return).
- **iFarmer.** Archived pages from 2019–2022 end in "Closed" or "Sold Out". None shows a delivered return. [SECONDARY]: its 2026 app, iharvst, shows "Projected Earnings / Projected Profit" with the note "Data shown above on Active Farms". It renamed a "High Return" category to "Regular" ([Substack, 27 April 2026](https://tanmee.substack.com/p/ifarmer-iharvst-rebrand-bangladesh)).
- **WeGro.** Its public project APIs return no closed projects. Its 2024 home page claimed "৳ 400M+ Return Reimbursed".

### 4.2 Freshie Farm: taka per share, never a percentage

The [Project Borga page](https://www.freshie.farm/project-borga/) was read live and in Internet Archive captures from 2022 to 2026.

- **The current FAQ.** It asks "লাভের গ্যারান্টি কি ? কত % লাভ হতে পারে ?" (What is the profit guarantee? What % profit might there be?). It answers that profit is worked out after every cow is sold and costs are counted, then averaged and shared equally among that batch's shareholders. Then: "**% এর গ্যারান্টি দিলে সেটা সুদ হয়ে যায় – আমরা সুদ দিতে এবং নিতে চাই না ।**" (If a % is guaranteed it becomes interest. We do not want to give or take interest.)
- **In 2022** the page said "আমাদের লাভ দেয়াটা গ্যারান্টিড না, কারন আমরা ব্যাবসা করতে চাই" (our paying a profit is not guaranteed, because we want to do business).
- **Batch results, as the page states them:**

  | Batch | Wording                                                                                                                      | Per share? | My arithmetic, not the site's                        |
  | ----- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------- |
  | 1     | "মেয়াদঃ ৬ মাস / শেয়ার এর পরিমান: ৫৫০০০ / বিনিয়োগকারির লাভঃ ৭২০০" (term 6 months / share 55,000 / investor's profit 7,200) | Yes        | 13.1% over the run                                   |
  | 3     | "মেয়াদঃ ২মাস / ৫০০০০ / ৩৬৪০"                                                                                                | Yes        | 7.3% over the run; 44% a year simple, 52% compounded |
  | 7–11  | "৩৮৩০ টাকা লাভ" … "5170 টাকা লাভ" (Tk 3,830 … 5,170 profit), with the total invested and the head count                      | Not said   | —                                                    |

  **A percentage is never stated.** The figure is a taka sum, after the batch, for a named share.

### 4.3 Annualising by multiplication

- **Investify.fund** ([page](https://www.investify.fund/product/agro-investment-qurbani-2026/)).
  - The figures: "Proj. ROI (4 Months) 8%", "Annualized ROI 24%", "Mudaraba (Profit Sharing)".
  - The page also says "generating a **secure profit** for investors" and "**Secure high returns**".
  - There is no risk statement beside the figure. One sits on the separate legal page.
  - Eid-ul-Adha 2026 has passed, but no outcome is posted.
- **The arithmetic.** 8% over four months is 24% a year only by simple multiplication. Compounded, it is 26%.
- **biniyog.io** does the same for a profit-sharing campaign: "Projected Return on Investment (ROI): 7.5-10% Projected annual ROI: 15-20%". The same page states a loss in the same terms: "if someone invests BDT 100k and the project incurs a net loss of 5%, the investor would get back BDT 95k."

### 4.4 The words that turn a figure into a promise, and how they changed

- **iFarmer.**
  - 2020 FAQ: "Is the return amount fixed? or can that vary? No, it's fixed return we are offering to our funders." ([archive](https://web.archive.org/web/20200809113312/https://ifarmer.asia/farms/cow-farm-lalmonirhat-3))
  - 2021 Shariah farm: "Profit Sharing 15% to 20%" and "From our previous experience, our expectation of the return would be between BDT 6,750 (15%) to BDT 9,000 (20%)".
  - 2022: "Estimated Earning 16.5% - 25.5%", "projected earning", and "munafa" in place of "profit".
- **WeGro.**
  - February 2024 FAQ ([archive](http://web.archive.org/web/20240302id_/https://www.wegro.global/faq/)): "You will be entitled to the project principal amount. The loss is presently supported by WeGro as a marketing cost." Also: "Your investment is 100% insured against any unfortunate events for cattle projects."
  - 2026 FAQ: "investors also bear the associated business risks, including potential losses. WeGro does not guarantee returns or bear investment losses." To "What is the guarantee of the ROI range that it will be met?" the only answer is the farmers' experience.
- **Agriventure** (agriventure.asia, FAQ archived February 2025):
  - "Investors will receive 12% return per unit"
  - "What profit or interest can I expect from a project?"
  - [SECONDARY]: an opinion column alleges about 70 investors ruined and "প্রায় ৫০ কোটি টাকা আত্মসাৎ" (about Tk 50 crore embezzled) ([Digi Bangla, 29 April 2026](https://digibanglatech.news/175564)). This is not corroborated.
- **iGrow** (igrowbd.com): "Fixed 20% return in just 4 months", with "Past performance is not indicative of future results" in the footer.
- **Sukher Khamar Agro Village:** "Potential ROI 15% - 20% Yearly" and "ব্যাংক সঞ্চয়ের চেয়ে ৩ গুণ বেশি রিটার্ন" (three times the return of bank savings).
- **biniyog.io** answers its own question "How is fixed percentage halal?": its campaigns are Murabaha, a sale at a fixed mark-up, not a share of profit. That is the honest form of a fixed figure. It is debt, and it is not a mudarabah.

---

## 5. Regulators and the collapsed schemes in Bangladesh

`bangladesh-pooled-investment.md` §1–2 covers deposit-taking, the platform rule and the crackdown pattern. This section adds what bears on _stating_ a return.

### 5.1 BSEC: the only Bangladeshi rule on stating a past return

The **Bangladesh Securities and Exchange Commission (Mutual Fund) Rules 2025** (Gazette, 12 November 2025; [PDF](<https://sec.gov.bd/storage/laws/59214_16105%20(1).pdf>)) replaced the 2001 Rules (r.106(1)). Advertisements need BSEC's approval (r.45(1)). None may contain a misleading, wrong or untrue statement (r.46).

**Fourth Schedule, "বিজ্ঞাপন নিয়মাবলি" (advertisement rules)**, read from the Gazette's page images. The same items are in the 2001 Rules, checked in Unicode text:

- **Item ১.** "বিজ্ঞাপন হইবে সত্যনিষ্ঠ, ন্যায্য ও স্পষ্ট এবং তাহাতে অসত্য অথবা বিভ্রান্তিকর কোনো বিবৃতি, ধারণা অথবা অনুমান থকিবে না।" (An advertisement shall be truthful, fair and clear, with no untrue or misleading statement, impression or assumption.)
- **Item ২(ক).** An advertisement is misleading if "উহাতে কোনো অতীত কাজকর্মের অসত্য চিত্র প্রদান করা হয় অথবা এমনভাবে উহাকে চিত্রায়িত করা হয় যাহাতে মনে হইবে যে অতীতের কোনো সাফল্য অথবা আয় ভবিষ্যতেও লাভ করা হইবে" (it gives a false picture of past performance, or presents it so that it seems a past success or income will be earned in future too).
- **Item ২(খ).** It is also misleading if it states the profit or gain of a scheme "without" the risk of that scheme.
- **Item ৪.** "বিজ্ঞাপনে এমন কোনো তথ্য থাকিবে না যাহার যথার্থতা নিরূপণ অনির্ভরযোগ্য ও অনুমান নির্ভর হইবে।" (No information whose accuracy cannot reliably be checked, or which rests on assumption.)
- **Item ৭.** An advertised guarantee of a minimum dividend rate must describe what backs it.
- **Item ৮.** "যদি কোনো বর্তমান মিউচ্যুয়াল ফান্ড বিজ্ঞাপনে উহার অতীত কার্যাবলি তুলিয়া ধরে সেক্ষেত্রে লভ্যাংশের হার নিরূপণের পদ্ধতি উল্লেখ করিতে হইবে এবং এই মর্মে বিবৃতি দিতে হইবে যে এইরূপ তথ্য ভবিষ্যৎ ফলাফলের কোনো সূচক নহে এবং তাহা অন্যান্য বিনিয়োগের সহিত তুলনা করিবার ভিত্তি হিসাবে পরিগণিত হইবে না।" (If a fund's advertisement shows its past performance, it must state the method by which the rate was worked out, and must say that such information is no indicator of future results and is not to be taken as a basis for comparison with other investments.)

These rules bind mutual funds, not a farm. They are still the Bangladeshi regulator's own statement of what makes a stated return misleading. No rule on annualising was found in them.

**Other BSEC rules:**

- **Public Issue Rules 2015 and Public Offer of Equity Securities Rules 2025** ([PDF](https://sec.gov.bd/storage/laws/7_2026_08_17_043348.pdf)). Projections are allowed with their rationale. Every prospectus carries "পুঁজিবাজারে বিনিয়োগ ঝুঁকিপূর্ণ। জেনে ও বুঝে বিনিয়োগ করুন।" (Investing in the capital market is risky; invest knowingly and with understanding.)
- **Investment Sukuk Rules 2019** ([PDF](https://sec.gov.bd/storage/laws/Investment_Sukuk_Rules,_2019.pdf)). Schedule B requires the "expected rate of return" among the salient features.
- **Alternative Investment Rules 2015.** They define a "hurdle rate" as "a reference annual rate of return". They require "Returns to investors" in the placement memorandum.
- **BSEC press release, 28 August 2025** ([PDF](https://sec.gov.bd/storage/press_releases/Press_Release_28.08.25.pdf)). It describes the fraud pattern: "বিনিয়োগের পর প্রথমে সামান্য মুনাফা দেখিয়ে বিনিয়োগকারীদের আস্থা অর্জন করা হয় এবং পরবর্তীতে অধিক মুনাফার প্রলোভন দেখিয়ে বড় অঙ্কের বিনিয়োগে প্রলুব্ধ করা হয়ে থাকে।" (After investment, a small profit is shown first to win trust, then a larger investment is drawn in with the lure of more profit.)

### 5.2 Bangladesh Bank's warnings: the words it uses

Taken from its own press releases:

- **9 January 2011** ([PDF](https://www.bb.org.bd/mediaroom/press_release/press/jan092011mlm14.pdf)). "অবাস্তব উচ্চ মুনাফার (কোথাও কোথাও মাসিক ১০% বা তারও বেশি) প্রলোভন দেখিয়ে" (luring with unrealistically high profit, in places 10% a month or more), promoted "ওয়েবসাইটে বিজ্ঞাপন দ্বারা" (by website advertisement).
- **1 April 2012** ([PDF](https://www.bb.org.bd/mediaroom/press_release/press/apr012012146.pdf)). Unlicensed bodies doing "ব্যাংক-ব্যবসার অনুরূপ ব্যবসা" (business similar to banking), "অস্বাভাবিক উচ্চ হারে সুদ ও আকর্ষণীয় মুনাফার লোভ দেখিয়ে" (luring with unusually high interest and attractive profit).
- **26 April 2016** ([PDF](https://www.bb.org.bd/mediaroom/press_release/press/apr272016cn.pdf)). A cooperative "অস্বাভাবিক উচ্চ হারে মুনাফা/সুদ প্রদানের প্রতিশ্রুতি দিয়ে বিভিন্ন ধরনের আমানত হিসেবে" (promising unusually high profit/interest, as various kinds of deposit).
- **DFIM Circular Letter 06, 26 June 2018** ([PDF](https://www.bb.org.bd/mediaroom/circulars/fid/jun262018dfiml06.pdf)). Even licensed finance companies were told to stop "মোবাইল ফোনের মাধ্যমে উচ্চ সুদহারে আমানত সংগ্রহের প্রচেষ্টা" (trying to gather deposits at high rates by mobile phone messages).
- **[SECONDARY]** In February 2023 a Bangladesh Bank spokesman spoke about cloud-kitchen schemes offering "2 percent monthly profits or 24 percent annually". He said: "If someone takes deposits from people, it's banking" (bdnews24).
- **A correction to `bangladesh-pooled-investment.md`.** It cites a Bangladesh Bank warning of 1 August 2026 about platforms "tempting with promises of high profits" (via Desh Rupantor). Bangladesh Bank's full press-release index has no release of that date. The nearest, 30 July 2026 on Crossmarket.ai ([PDF](https://www.bb.org.bd/mediaroom/press_release/press/pr14200_20260730.pdf)), has no profit wording. The quoted words may be the newspaper's.

### 5.3 Consumer and general law

- **Consumer Rights Protection Act 2009.** s.44 punishes false advertisement to deceive buyers "কোন পণ্য বা সেবা বিক্রয়ের উদ্দেশ্যে" (to sell goods or a service). But s.2(22) defines "সেবা" (service) as a closed list: "পরিবহন, টেলিযোগাযোগ, পানি-সরবরাহ, পয়ঃনিষ্কাশন, জ্বালানী, গ্যাস, বিদ্যুৎ, নির্মাণ, আবাসিক হোটেল ও রেস্তোরাঁ এবং স্বাস্থ্য সেবা" ([bdlaws](http://bdlaws.minlaw.gov.bd/act-1014/section-39110.html)). **An investment is not on the list.** No DNCRP action against an investment scheme's advertising was found.
- **Penal Code 1860, s.415 illustration (g).** A person who intends at the time to deliver and later fails "does not cheat, but is liable only to a civil action". A stated figure the farm honestly expected and missed is not cheating. One it knew it could not meet would be.
- **Cooperative Societies Act 2001** (as amended 2013). s.26(১) bars a cooperative from taking deposits from non-members. The 2013 amendment took the words "বা সুদ" (or interest) out of s.34 on distributing profit.

### 5.4 The collapsed schemes: what they promised **[SECONDARY]**

| Scheme                                               | The promise, as reported                                                                                                                                                                                                                                                                                               | The words the authorities used                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nazran Fisheries & Agro                              | "এক লাখ টাকা বিনিয়োগ করলে প্রতি মাসে ৩ হাজার টাকা লাভসহ আসল ফেরত দেওয়া হবে এবং ৩৩ মাসে মূলধন দ্বিগুণ হবে" (Tk 3,000 a month on a lakh, principal back, capital doubled in 33 months). Investors got a "মাসিক ক্যাশব্যাক বহি" (monthly cashback book) ([Bangla Tribune](https://www.banglatribune.com/others/945233)) | CID: "promises of high interest" ([BSS](https://www.bssnews.net/others/384358)); FIR: "অধিক মুনাফার প্রলোভন দেখিয়ে … ভুয়া কৃষি প্রকল্প" (luring with more profit … a fake agricultural project)                                                                                                                      |
| Ehsan Group                                          | "প্রতি এক লাখ টাকা আমানতের বিপরীতে মাসে ২ হাজার টাকা লভ্যাংশ" (Tk 2,000 a month on a lakh; [Prothom Alo, 2023](https://www.prothomalo.com/bangladesh/district/83gz9rqn43)). TBS reported Tk 1,800                                                                                                                      | RAB: "শরিয়ত সম্মত সুদবিহীন বিনিয়োগের বিষয়টি ব্যাপক প্রচারণা করে" (widely advertising Shariah-compliant, interest-free investment); "লাখ টাকার বিনিয়োগে মাসিক মাত্রাতিরিক্ত টাকা প্রাপ্তির প্রলোভন" (the lure of excessive monthly money on a lakh) ([Jagonews24](https://www.jagonews24.com/national/news/698270)) |
| Destiny 2000                                         | ACC charge sheet: "৪৬ শতাংশ হারে মুনাফার লোভ দেখিয়ে" (luring with profit at 46%)                                                                                                                                                                                                                                      | Misappropriation and money laundering; 46 convicted in 2022                                                                                                                                                                                                                                                            |
| Janata savings cooperative, Meherpur (reported 2017) | "মেয়াদী চুক্তি আমানতে (ডিপোজিট) ১৮% – ২৪% হারে মুনাফা" (18–24% on term deposits) ([Jagonews24, 2017](https://www.jagonews24.com/country/news/321397))                                                                                                                                                                 | "ব্যাংক যেখানে সর্বোচ্চ ৫ শতাংশ মুনাফা দেয় সেখানে এসব প্রতিষ্ঠান ১৫ থেকে ২০ শতাংশ মুনাফা প্রদানের প্রতিশ্রুতি দেয়" (where a bank pays at most 5%, these promise 15–20%)                                                                                                                                              |
| Jubok, ITCL/SDS                                      | "উচ্চ সুদের বিনিময়ে আমানত সংগ্রহ" (gathering deposits against high interest)                                                                                                                                                                                                                                          | Bangladesh Bank: "অবৈধ ব্যাংকিং" (illegal banking)                                                                                                                                                                                                                                                                     |

**The pattern the authorities named.**

- The promise was a fixed taka sum a month on each lakh, or a high percentage.
- It was paid on a schedule before any result, with capital back promised.
- It was often sold as halal or interest-free, as a deposit, or set beside a bank's rate.

None of these schemes stated a return after the fact, from accounts, as a share of what was made. None shut down for that.

---

## 6. How other regulators draw the line

These are comparators only. None binds a Bangladeshi farm.

### 6.1 A return for less than a year

- **GIPS 2020** (CFA Institute; [PDF](https://www.gipsstandards.org/wp-content/uploads/2021/03/2020_gips_standards_firms.pdf)):
  - 2.A.12: "Returns for periods of less than one year must not be annualized."
  - 8.A.4 applies the same to advertisements.
  - The Handbook: "The extrapolation of the partial-year return produces a simulated return and does not reflect the performance of actual assets."
- **SEC Form N-1A,** Item 13 Instruction 3(e): "For a period less than a full fiscal year, state the total return for the period and disclose that total return is not annualized".
- **EU PRIIPs** (Delegated Regulation 2017/653 as amended):
  - Annex IV point 45: "For recommended holding periods shorter than one year, performance scenarios in percentage terms shall reflect the projected return over that period, non-annualised."
  - The required narrative: "Market developments in the future are uncertain and cannot be accurately predicted."
- **FINRA Rule 2220** (options only), (d)(3)(H). Annualised rates must rest on at least 60 days of experience, show the formula, and say that "the annualized returns cited might be achieved only if the parameters described can be duplicated and that there is no certainty of doing so".
- **Pakistan, SECP Master Circular 2026,** 2.3.4. Returns under a year are "annualized only for money market, income and aggressive income schemes and their equivalent sharia compliant CIS … whereas absolute for others". The deposit-like funds are annualised and the risk funds are not.

### 6.2 A projection

- **FINRA Rule 2210(d)(1)(F):** communications "may not predict or project performance, imply that past performance will recur or make any exaggerated or unwarranted claim".
  - FAQ D.7: this extends to "target returns to investors".
  - FAQ D.6: "realized historical performance for a completed investment program, whether expressed as IRR or any other return metric, will generally be consistent with" the rule. An IRR for a new programme with no operations "is a projection".
- **SEC Marketing Rule** (17 CFR 275.206(4)-1). "Targeted or projected performance returns" are hypothetical performance. They are allowed only with policies ensuring relevance to the audience, and with enough information to understand "the criteria used and assumptions made" and "the risks and limitations".
- **UK FCA COBS 4.6.**
  - Past performance must cover five years or the whole period offered, in complete 12-month periods. It carries "a prominent warning that the figures refer to the past and that past performance is not a reliable indicator of future results". It may not be the most prominent feature.
  - Future performance must rest on "reasonable assumptions supported by objective data", show "both negative and positive scenarios", and warn that "such forecasts are not a reliable indicator of future performance".
- **Securities Commission Malaysia, advertising guidelines** (revised 2025), 8.08. Where a return is not guaranteed, an advertisement must not say that "the risk of investors not achieving the stated, target or expected rate of returns is low or nil". Appendix 1 H2: the historical period "should not be an odd period … for the sole purpose of capturing a positive period."

### 6.3 Islamic profit-sharing products elsewhere

- **Pakistan, Modaraba Regulations 2021.** Regulation 18 requires the SECP's prior approval for any advertisement of a Certificate of Musharakah. Every such advertisement must state the "expected profit rate to be paid", with a risk disclaimer.
- **Pakistan, SECP's Key Fact Statement.** "For conventional fixed return schemes, disclose the promised return. For Shariah-compliant fix return CIS, expected return shall be disclosed." The regulator draws the Shariah line in the label itself.
- **State Bank of Pakistan, profit and loss distribution instructions** (IBD Circular 03, 2012). The sharing ratio and the weightages are announced at least three working days before each period and are not changed during it. The actual profit distributed in the last two years goes on the website and the branch notice board.

---

## 7. The line

What has read as a promise, and what has not, across all of the above:

| How the return is stated                  | Read as a promise when …                                                                                                                                                                                  | Has not, when …                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A fixed taka sum each month, per lakh** | Always, where found: Nazran and Ehsan paid one, and Bangladesh Bank's 2011 warning names "মাসিক ১০%" (10% a month). It is SS 13's "periodic pre-agreed payment", which "will constitute a debt with Riba" | Never found in a profit-sharing offer that survived                                                                                                                    |
| **One percentage, before the result**     | Called fixed, secure, guaranteed or insured, or paid on a schedule regardless: iFarmer 2020, iGrow, Investify, Destiny's 46%, Agriventure's "profit or interest"                                          | Headed provisional, expected or estimated, trued up both ways, and not binding (SS 40 5/2; EBL; Pakistan's "expected profit rate")                                     |
| **A range, before the result**            | Paired with the farm bearing the loss (WeGro 2024)                                                                                                                                                        | Low and high with the working and a loss case (BNM best/flat/worst; PRIIPs scenarios; biniyog's loss example; OpenFarm's Projection). No enforcement case used a range |
| **A rate a year on a short run**          | Multiplied up from a few months to a year and put first: Investify's 24%; the cloud kitchens' "24 percent annually", which a Bangladesh Bank spokesman called banking [SECONDARY]                         | Not annualised under a year (GIPS; PRIIPs; SEC N-1A). Where it is annualised, the formula is shown with "no certainty" (FINRA 2220)                                    |
| **A realised return, after the result**   | Used to sell the next offer (BSEC Sch. 4 item ২(ক); BSEC's warning about "a small profit shown first"); left showing the projection after completion (biniyog, DeenAgro)                                  | Stated from the accounts with the method: IBBL final rates; Freshie's taka per share; BNM G 16.10; IFSB-22; FINRA FAQ D.6. No case concerns one                        |
| **Beside a bank rate**                    | Used as the lure: Sukher Khamar's "three times bank savings"; the press account of the Meherpur cooperatives, "where a bank pays at most 5%, these promise 15–20%"                                        | Given as context in a bank's own disclosure (IFSB-22 ¶90). BSEC's item ৮ says a past return is "not a basis for comparison with other investments"                     |
| **A figure honoured whatever happens**    | Topped up to the stated rate: IBBL's hiba, AIBL's "no claim if lower", the 4% for the merged banks (IFSB GN-3; IFSB-9 "in effect, a guarantee of interest")                                               | Paid on what was made, a loss included, with any gift from the mudarib disclosed as such (SS 40 5/6)                                                                   |

Two things turn a stated figure into a promise, whatever the label says:

1. **It exists before the result and is paid regardless of it.**
2. **It is expressed like a deposit:** so much a month per lakh, a rate a year, a bank's rate beside it, "fixed" or "secure".

A figure worked from a closed account, stated with its working and with its loss case, has not been treated as a promise by any source found.

---

## What this means for OpenFarm

### Constraints the spec should respect

1. **A settled return is a fact and may be shown.** Show it only after the **Settlement** is approved, and work it from the Settlement's own figures: the Investor's payout against their capital. This is what SS 13 8/7–8/8, BNM G 16.10, IFSB-22 and FINRA FAQ D.6 all allow. It is the kind of fact the **Investor Statement** rule already admits: "weights, gains and days are facts".
2. **Taka first, then the share, then the days.** Freshie Farm, the only cattle scheme that states realised results, states them in taka per share. The share of capital comes next. The Venture's own days sit beside it, so the reader sees the period and not a year.
3. **A loss is stated the same way.** It is a negative share of capital, in the same place and the same size, with the standing footer. BNM requires "both the potential upside return and downside risk of losses" (S 25.2(h)(iii)), and biniyog's loss example states a loss in the same form as a gain.
4. **A rate a year never stands alone.** For a run under a year it is an extrapolation: GIPS calls it "a simulated return". If an Investor is shown one:
   - it sits after the share for the run;
   - it is labelled as that share scaled to a year;
   - its working is shown, as SS 47 §9 and BSEC's item ৮ require;
   - it is not the most prominent figure (FCA; BNM S 25.2(h)(iv)).

   Ticket 05 decides how it is computed, and ticket 09 whether Investors see it at all.

5. **The Projection is never a rate a year.** A projected annual rate joins the two riskiest forms found: a figure before the result, and a short run annualised. PRIIPs requires projections under a year to be non-annualised. FINRA does not allow target returns to retail investors at all. If the Projection is ever shown as a percentage, it should be a **low–high share of capital over the run**. It stays under "an estimate, not a promise" / "আনুমানিক হিসাব, কোনো প্রতিশ্রুতি নয়", and it is never printed. This is consistent with SS 40 5/2 and ADR 0010.
6. **Never make a stated figure binding in practice.** Nothing in OpenFarm should let a Venture's Investors be paid up to a Projection, a previous Venture's return or any rate. IBBL's hiba and AIBL's "no claim" clause show how a provisional figure becomes a floor.
   - The Owner may still give up part of the Farm's own share after a Settlement.
   - If he does, it is recorded and shown as a gift from the Farm's share, not as the Venture's return (SS 40 5/6).
7. **Keep past results off offers.** The **Investor Portal** already shows "never a past Venture's result" on a Venture gathering capital. A settled return belongs only to the Investor's own Venture pages and papers.
   - BSEC's item ২(ক) calls a past income presented as likely to recur misleading.
   - BSEC's 2025 warning describes the fraud that shows "সামান্য মুনাফা" (a small profit) first to draw in more.
8. **Choose the words against the deposit words.**
   - Avoid মুনাফার হার standing alone. It is what every Islamic bank heads its deposit rate with, and Bangladesh Bank writes "সুদ/মুনাফা হার".
   - Avoid "বার্ষিক রিটার্ন" standing alone, and avoid নিশ্চিত, নির্ধারিত, ফিক্সড, নিরাপদ/secure, guaranteed, insured and "capital protected".
   - Never write সুদ or interest.
   - The glossary already avoids "return" and "ROI" for **Margin** and **Projection**. Ticket 04 chooses the word, and these are the constraints it must meet.
9. **Keep the standing footer on every figure.** "কোনো মুনাফার নিশ্চয়তা নেই। ক্ষতি হলে তা মূলধন থেকে যাবে।" / "No return is guaranteed. A loss comes off capital." This matches what BSEC item ২(খ), BNM S 25.2(j) and IFSB-22 ¶88 require beside a stated profit.

### Choices for the grilling

- **Ticket 05, over what time.** "Capital × days" is what Shariah practice already uses to weight money by the time it was in:
  - SS 40 5/1 ("currency unit x time unit");
  - IIFA 123's numar method;
  - Bangladesh Bank's "Total Yearly Product".

  Islamic banks and BNM scale by simple days (rate × days ÷ 365; a monthly payout of rate ÷ 12), not by compounding.

- **Ticket 05, a floor below which no rate a year is shown.** Three thresholds are in use: GIPS never annualises under a year; SECP shows no return at all for a record under six months; FINRA 2220 needs 60 days.
- **Ticket 09, the paper.** A settled share is a fact and could go on the হিসাব নিকাশ. A rate a year is arithmetic on that fact, but GIPS treats it as simulated. Printing it puts an annual rate on a paper a man keeps, and the Investor Statement rule was written against exactly that for projections. The choices:
  - the share only on paper, and the rate a year in the portal;
  - both on paper;
  - neither.
- **Ticket 07, which bank rate, and for whom.**
  - Candidates: an Islamic bank's final mudaraba rate, a Shariah-side figure published yearly (IBBL since 2013), or Bangladesh Bank's "deposit rate (percentage per annum)" chart.
  - Tax: EXIM's and Al-Arafah's tables show the profit before and after the 10% tax.
  - For the Owner's own judgement a bank rate beside the return is ordinary: IFSB-22 ¶90 has banks compare with market returns.
  - For Investors it points the other way. BSEC's item ৮ says a past return is not a basis for comparing investments. Sukher Khamar markets itself as "three times bank savings", and the press explained the pull of the Meherpur cooperatives the same way.

### Take to the lawyer and the Shariah scholar

- **Lawyer.**
  - Does showing Investors a settled return as a rate a year, or a Projection as a percentage, change the deposit analysis in `bangladesh-pooled-investment.md` §1.1? The Finance Company Act 2023 s.2(3) makes a deposit money received "through a receipt containing all terms of repayment on the basis of interest or profit".
  - Should BSEC's advertisement rules (Fourth Schedule) be followed as a standard of care, although they bind only mutual funds?
- **Shariah scholar.**
  - Is a settled Venture's return acceptable put as a share of capital, and as a rate a year? BNM G 16.10 says it may be "translated into a fixed percentage yield of the capital".
  - Can the Projection be shown as a percentage range, as a non-binding expected rate under SS 40 5/2?
  - May a Venture's return be set beside an interest rate, or only beside an Islamic bank's mudaraba rate, or neither? IFSB GN-3 ¶52 warns that expectations anchored to interest rates become interest-like.
  - Is the chosen Bangla word acceptable, given that মুনাফার হার is the banks' deposit word?
  - Is it acceptable for the Owner to give up part of the Farm's share, disclosed?

---

## Unclear / not found

- **No Bangladesh Bank rule on displaying or advertising deposit or profit rates** was found. BRPD 27/2010 is referred to in 2026 as covering display, but the text read has none.
- **No circular setting the 2020 6% deposit rate** was found. The Islamic banks' coverage is known only from the press.
- **Bangladesh Bank's January 2026 decisions on the five merged banks** (no profit, then 4%) are known only from the press.
- **No text of the draft Islamic Banking Act** was found. [SECONDARY]: BSS, 4 July 2026, says it is "in its final stage".
- **No Central Shariah Board for Islamic Banks of Bangladesh guidance** was found: its fatwa and guideline pages are empty.
- **No judgment or regulator statement** was found holding, or rejecting, that a profit-sharing return stated as an annual percentage is interest or a deposit.
- **No regulator comment specifically on cattle or agri investment platforms** was found.
- **The platforms.** WeGro's completed-project returns are not public. The iharvst app FAQ could not be read. Investify has posted no 2026 result.
- **The Bangladesh Bank release of 1 August 2026** cited by `bangladesh-pooled-investment.md` is not in Bangladesh Bank's index (§5.2).
- **Reported promises differ.** Ehsan is reported at Tk 1,800 (TBS) and at Tk 2,000 (Prothom Alo) a month per lakh. A Janata cooperative is reported at 18–24% (Jagonews24, 2017, Meherpur) and a Janata Savings and Lending Co-operative at 18–20% a year (TBS, 2022). Whether they are the same body was not established, nor whether the Meherpur one was prosecuted.
- **Sources not read or not verified.**
  - AAOIFI FAS 27 (Investment Accounts): paywalled.
  - BNM's Framework of Rate of Return (2013): seen only in a third-party copy.
  - Pakistan's Modaraba Rules 1981: blocked.
- **How the BSEC texts were read.** The Mutual Fund Rules 2025 quotes were read from Gazette page images, because the text layer is garbled. The same items were checked in the 2001 Rules' Unicode text.
- **The Internet Archive** was offline for part of the day. Some Bangladesh Bank pages were read in a browser instead.

---

## Sources

**Bangladeshi Islamic banks (read 27 September 2026)**

- IBBL, Profit Rate on Deposits: https://www.islamibankbd.com/profit-rates-on-deposits
- IBBL, provisional rates w.e.f. 01.01.2026: https://www.islamibankbd.com/public/assets/profit-rate-main/1775551629_Provisional%20Profit%20rates%20w.e.f.%2001.01.2026.pdf
- IBBL, final rates for 2024: https://www.islamibankbd.com/public/assets/profit-rate-main/1767676496_Final%20Rates%202024%20for%20website.pdf
- IBBL, Annual Report 2024: https://www.islamibankbd.com/public/assets/annual-report/1761203020_Annual_Report_2024.pdf ; Annual Report 2025: https://www.islamibankbd.com/public/assets/annual-report/1780917670_Annual_Report_2025.pdf
- Al-Arafah Islami Bank, provisional rates 27.09.2026: https://www.aibl.com.bd/wp-content/uploads/2026/09/Deposit-Rate-24.9.2026-v2.pdf ; MTDR terms: https://www.aibl.com.bd/deposit/mudaraba-term-deposit-mtdr/ ; MSD terms: https://www.aibl.com.bd/deposit/mudaraba-savings-deposit-msd/ ; Ahsan scheme: https://www.aibl.com.bd/deposit/mudaraba-ahsan-deposit-scheme/ ; circular of 28.01.2025: https://www.aibl.com.bd/wp-content/uploads/2025/01/Re-Fixation-of-Rate-Installment-Size-Period-of-Scheme-28.01.2025.pdf
- Social Islami Bank: https://www.siblbd.com/profit-rates ; https://www.siblbd.com/assets/downloads/Provisional-Profit-Rate-01-02-2026.pdf
- EXIM Bank: https://www.eximbankbd.com/deposit/Deposit_Rates ; https://www.eximbankbd.com/deposit/Term_Deposit
- Shahjalal Islami Bank: https://sjiblbd.com/profit_rate.php
- Eastern Bank, Islamic banking: https://ebl.com.bd/islamic/profit-distribution
- Bank Asia, Islamic banking: https://www.bankasia-bd.com/islamic/product/Profit-on-Deposit ; https://www.bankasia-bd.com/downloads/IProfit_Rate_November_2024.pdf

**Bangladesh Bank**

- Guidelines for Conducting Islamic Banking (2009): http://web.archive.org/web/20250605151255/https://www.bb.org.bd/aboutus/regulationguideline/islamicbanking/guideislamicbnk.pdf ; BRPD Circular 15/2009: http://web.archive.org/web/20240715144513/https://www.bb.org.bd/mediaroom/circulars/brpd/nov092009brpd15e.pdf ; Appendix III: http://web.archive.org/web/20190605020718/https://www.bb.org.bd/aboutus/regulationguideline/islamicbanking/app3page65to69.pdf , https://www.bb.org.bd/aboutus/regulationguideline/islamicbanking/app3page70to73.pdf , https://www.bb.org.bd/aboutus/regulationguideline/islamicbanking/app3page74to79.pdf
- BRPD Circular 03/2020: http://web.archive.org/web/20240512202158/https://www.bb.org.bd/mediaroom/circulars/brpd/feb242020brpd03.pdf
- BRPD Circular 17/2021: https://web.archive.org/web/20210812171006/https://bb.org.bd/mediaroom/circulars/brpd/aug082021brpd17.pdf
- BRPD Circular 09/2023: http://web.archive.org/web/20230620044848/https://www.bb.org.bd/mediaroom/circulars/brpd/jun192023brpd09.pdf
- BRPD Circular Letter 75/2023: http://web.archive.org/web/20231214183605/https://www.bb.org.bd/mediaroom/circulars/brpd/dec122023brpdl75.pdf
- BRPD Circular 10/2024: http://web.archive.org/web/20240714134149/https://www.bb.org.bd/mediaroom/circulars/brpd/may082024brpd10e.pdf
- IBRPD Circular 01/2025: https://www.bb.org.bd/mediaroom/circulars/ibrpd/sep282025ibrpd01.pdf
- Announced interest rate chart (deposit rate): https://web.archive.org/web/20250512095317/https://www.bb.org.bd/en/index.php/financialactivity/interestdeposit
- DFIM Circular Letter 06/2018: https://www.bb.org.bd/mediaroom/circulars/fid/jun262018dfiml06.pdf
- Press releases: https://www.bb.org.bd/mediaroom/press_release/press/jan092011mlm14.pdf ; https://www.bb.org.bd/mediaroom/press_release/press/apr012012146.pdf ; https://www.bb.org.bd/mediaroom/press_release/press/apr272016cn.pdf ; https://www.bb.org.bd/mediaroom/press_release/press/pr14200_20260730.pdf ; https://www.bb.org.bd/mediaroom/press_release/press/pr14248_20260827.pdf

**BSEC**

- Mutual Fund Rules 2025: https://sec.gov.bd/storage/laws/59214_16105%20(1).pdf (also https://sec.gov.bd/storage/laws/20_2026_08_17_044035.pdf)
- Mutual Fund Rules 2001, updated to 2021: https://sec.gov.bd/storage/laws/Notification_24.05.20223.pdf
- Alternative Investment Rules 2015: https://sec.gov.bd/storage/laws/Notification_24.05.20221.pdf
- Public Issue Rules 2015: https://sec.gov.bd/storage/laws/Notification_04.04.2022.pdf ; Public Offer of Equity Securities Rules 2025: https://sec.gov.bd/storage/laws/7_2026_08_17_043348.pdf
- Investment Sukuk Rules 2019: https://sec.gov.bd/storage/laws/Investment_Sukuk_Rules,_2019.pdf
- Press releases, 28 August and 9 September 2025: https://sec.gov.bd/storage/press_releases/Press_Release_28.08.25.pdf ; https://sec.gov.bd/storage/press_releases/Press_Release-09.09.2025.pdf

**Statutes (bdlaws.minlaw.gov.bd)**

- Consumer Rights Protection Act 2009, ss.2(22), 44: http://bdlaws.minlaw.gov.bd/act-1014/section-39110.html ; http://bdlaws.minlaw.gov.bd/act-1014/section-39152.html
- Penal Code 1860, ss.415, 420: http://bdlaws.minlaw.gov.bd/act-11/section-3291.html ; http://bdlaws.minlaw.gov.bd/act-11/section-3366.html
- Cooperative Societies Act 2001: http://bdlaws.minlaw.gov.bd/act-876.html
- Deposit Protection Ordinance 2025: http://bdlaws.minlaw.gov.bd/act-details-1577.html

**Shariah standards and Islamic-finance regulators**

- AAOIFI SS 13 Mudarabah: https://aaoifi.com/wp-content/uploads/2020/08/SS-13-Mudarabah.pdf
- AAOIFI SS 17 Investment Sukuk: https://aaoifi.com/wp-content/uploads/2020/08/SS-17-Investment-Sukuk.pdf
- AAOIFI SS 40 Distribution of Profit in Mudarabah-Based Investment Accounts: https://aaoifi.com/wp-content/uploads/2020/08/SS-40-Distribution-of-Profit-in-Mudarabah-Based-Investment-Accounts.pdf
- AAOIFI SS 45 Protection of Capital and Investments: https://aaoifi.com/wp-content/uploads/2020/08/SS-45-Protection-of-Capital-and-Investments.pdf
- AAOIFI SS 47 Rules for Calculating Profit in Financial Transactions: https://aaoifi.com/wp-content/uploads/2020/08/SS-47-Rules-for-Calculating-Profit-in-Financial-Transactions.pdf
- International Islamic Fiqh Academy, Resolution 30 (5/4): https://iifa-aifi.org/en/32300.html ; Resolution 123 (5/13): https://iifa-aifi.org/en/32844.html
- Bank Negara Malaysia, Mudarabah policy document (2015): https://www.bnm.gov.my/documents/20124/938039/Mudarabah.pdf/2ea1c2df-b084-1b3b-f640-d7993d1e38ea
- Bank Negara Malaysia, Investment Account policy document (2017): https://www.bnm.gov.my/documents/20124/938039/IAF+Final_9Oct_5y.pdf/1045e582-fcb6-449c-73d0-2d1a533ccf06
- IFSB-9: https://www.ifsb.org/wp-content/uploads/2023/10/ifsb9.pdf ; IFSB-22: https://www.ifsb.org/wp-content/uploads/2023/10/IFSB-22-December-2018_En.pdf ; IFSB GN-3: https://www.ifsb.org/wp-content/uploads/2023/10/eng_GN-3_Guidance_Note_on_the_Practice_of_Smoothing.pdf
- State Bank of Pakistan, profit and loss distribution instructions (IBD Circular 03, 2012): https://www.sbp.org.pk/assets/documents/circulars/ibd/2012/C3-Annex.pdf
- Pakistan, Modaraba Regulations 2021 (Gazette): http://pcp.gov.pk/SiteImage/Downloads/301(21)%20Ex.%20Gaz-II%20SECP.pdf
- SECP Master Circular 2026 (MUFAP copy): https://www.mufap.com.pk/Upload/WebDoc/Regulations/Circular_18_of_2026_-_Master_Circular_for_Mutual_Funds,_CIS_and_Investment_Advisory_Services25269.pdf

**Other comparators**

- GIPS 2020 for Firms: https://www.gipsstandards.org/wp-content/uploads/2021/03/2020_gips_standards_firms.pdf ; GIPS Handbook: https://www.gipsstandards.org/wp-content/uploads/2021/04/gips-standards-handbook-firms.pdf
- SEC Form N-1A: https://www.sec.gov/files/form-n-1a.pdf ; SEC Rule 482 (17 CFR 230.482) and Marketing Rule (17 CFR 275.206(4)-1), eCFR
- FINRA Rules 2210 and 2220, and the Rule 2210 FAQs: https://www.finra.org/rules-guidance/rulebooks/finra-rules/2210 ; https://www.finra.org/rules-guidance/rulebooks/finra-rules/2220
- FCA Handbook COBS 4.6: https://www.handbook.fca.org.uk/handbook/COBS/4/6.html
- EU PRIIPs RTS, Delegated Regulation (EU) 2017/653 as amended by 2021/2268 (EUR-Lex)
- Securities Commission Malaysia, Guidelines on Advertising for Capital Market Products (R1-2025): https://www.sc.com.my/api/documentms/download.ashx?id=eed9034a-03f2-4df3-8b9c-64261bcba687

**Platforms (live on 27 September 2026 unless archived)**

- Freshie Farm, Project Borga: https://www.freshie.farm/project-borga/
- biniyog.io, funded campaigns: https://biniyog.io/funded-campaigns
- WeGro, Cattle Trade – 33: https://www.wegro.global/projects/486 ; FAQ data: https://api.investor.wegro.global/api/faqs ; FAQ archived 2 March 2024: http://web.archive.org/web/20240302id_/https://www.wegro.global/faq/
- Investify.fund, Qurbani 2026: https://www.investify.fund/product/agro-investment-qurbani-2026/
- DeenAgro: https://deenagro.com/
- iFarmer, archived: https://web.archive.org/web/20200809113312/https://ifarmer.asia/farms/cow-farm-lalmonirhat-3 ; https://web.archive.org/web/20221130100236/https://ifarmer.asia/farms/premium-shariah-compliant-cow-farm-2?locale=en
- Agriventure: https://agriventure.asia/ ; iGrow: https://igrowbd.com/

**[SECONDARY]**

- The Daily Star, Islamic banking and the 9–6 rates, 13 March 2020: https://www.thedailystar.net/business/news/the-curious-rise-islamic-banking-bangladesh-1880035
- The Financial Express, ISR module, 6 July 2023: https://today.thefinancialexpress.com.bd/views-opinion/isr-module-in-islamic-banking-1688565507
- BSS, the merged banks' 4%, 29 January 2026: https://www.bssnews.net/bangla/trade/278187 ; Prothom Alo, 10 September 2026: https://www.prothomalo.com/business/bank/0jqr9ziuiz
- Nazran: https://www.banglatribune.com/others/945233 ; https://www.bssnews.net/others/384358
- Ehsan Group: https://www.jagonews24.com/national/news/698270 ; https://www.prothomalo.com/bangladesh/district/83gz9rqn43
- Janata cooperative: https://www.jagonews24.com/country/news/321397
- Digi Bangla opinion column on agri crowdfunding, 29 April 2026: https://digibanglatech.news/175564
- Substack on iharvst, 27 April 2026: https://tanmee.substack.com/p/ifarmer-iharvst-rebrand-bangladesh
- Future Startup on biniyog.io, 7 May 2026: https://futurestartup.com/2026/05/07/the-biniyog-io-story/
