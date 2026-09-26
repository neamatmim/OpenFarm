# What a modern, enterprise-grade investor portal looks like, and how OpenFarm's compares

**Question:** The Owner asked for research "so that we could make a modern, beautiful, user-friendly, enterprise-grade UI" for the **Investor Portal**. What do enterprise design systems and real investor portals do about layout, hierarchy, type, figures and money, charts, tables, papers, empty and loading states, trust, phones, Bangla and accessibility? How does OpenFarm's portal compare, and what should change?

**Researched:** 26 September 2026. Code read at `6b8c739` on main, after the three design passes (`f2e6dd6`, `a53be90`, `176e611`).

**Sources.** The primary sources are:

- the design systems' own docs: IBM Carbon, Atlassian, Shopify Polaris (now on shopify.dev), GOV.UK, Apple HIG, Material, Fluent 2, Salesforce SLDS v1 and shadcn/ui;
- Nielsen Norman Group articles;
- the W3C text of WCAG 2.2;
- Unicode CLDR data (release 48);
- each investor product's own help centre or product pages.

Anything else is marked **[SECONDARY]**. Some pages refused automated fetching (carta.com, livestockwealth.com, schwab.com) and were read in a browser. Where only a search result's summary was seen, it says **[snippet only]**. NN/g quotes came through a summarising fetch; the two NN/g quotes this note leans on hardest (skeleton screens) were fetched again and checked. The users this is weighed for are the Investors CONTEXT.md describes: at most twenty, all in Bangladesh, many on phones, some reading Bangla, and not finance professionals. They are not institutional LPs.

**Out of scope, because they are not design calls.** Three things are left to others:

- **Showing the Ventures raising capital more prominently** is a question for the Owner and the lawyer. ADR 0007 and ADR 0008 govern it, and the portal does not answer it.
- **Showing projections** is ruled out. CONTEXT.md forbids them, however common they are elsewhere.
- **Taking payment** in the portal was not approved (ADR 0008).

---

## Summary

**The principles that matter most for these Investors:**

1. **One figure first, largest.** Put the most important figure at the top, biggest and highest in contrast, and keep the rest few ([Carbon dashboards](https://carbondesignsystem.com/data-visualization/dashboards/); [Polaris number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number)). Real portals lead with what went in, what came back and what is held now (Carta, AngelList, Fundrise).
2. **Say when a figure is from.** A metric should show "the time when the metric was actually measured" ([SLDS metric display](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/)). Material asks charts to "supply information on data recency" ([M3 blog](https://m3.material.io/blog/data-visualization-accessibility)). AngelList states its valuation lag outright.
3. **Money plain and whole.** Use digits, never abbreviations, a real minus sign, tabular figures, right-aligned columns and no ".00" ([GOV.UK style](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/); [GOV.UK table](https://design-system.service.gov.uk/components/table/); [Polaris grammar](https://shopify.dev/docs/apps/design/content/grammar-and-mechanics)).
4. **On a phone a table becomes a list.** Polaris tables render "as lists on small screens" ([Polaris table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table)). SLDS tables "collapse into tile lists" ([SLDS displaying data](https://v1.lightningdesignsystem.com/guidelines/displaying-data/)).
5. **Charts only when they say something a number cannot.** When one is used, prefer bars and lines, never colour alone, and pair it with a text summary ([Apple HIG charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data); [NN/g chart types](https://www.nngroup.com/articles/choosing-chart-types/)).
6. **Trust comes from care, disclosure and current content** ([NN/g credibility](https://www.nngroup.com/articles/trustworthy-design/)). Farm-investment apps show the animals through the operator's own photos and updates (iharvst, Fundrise, CrowdFarming).

**Verdict.** The portal already does most of what the sources ask, at desktop width:

- the capital held is the first and largest figure;
- paid in, paid out and held now are the headline set, as fund portals have them;
- money is whole taka, tabular, right-aligned, and has its minus in front;
- colour is never alone;
- empty states say why;
- failures offer to try again;
- whom to call is on every page;
- Bangla gets its own digits, lakh grouping and larger type.

It does not need a redesign. The gaps are in two places:

- **The phone.** It drops the explanatory line under every figure, and its money ledger scrolls sideways.
- **Dating its figures.** It never says when the animals were last weighed or when the page's figures were read.

The top three changes fix those. The rest is polish, plus a few questions that are the Owner's to answer.

---

## 1. Home (the portfolio)

**What the sources say.**

- Carbon's "presentation dashboard" shows "the current status of key performance indicators". It puts "the most important data" at "the highest contrast" and "largest area", and says to "limit the number of metrics" ([Carbon](https://carbondesignsystem.com/data-visualization/dashboards/)). No system gives a number.
- Polaris: "Use a larger fontSize for the figure a merchant should read first … and keep supporting figures at the base size". Also: "A tone on every figure makes none of them stand out" ([Polaris number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number)).
- NN/g: a dashboard should "provide information that can be consumed fast, with a minimum of interaction" ([NN/g dashboards](https://www.nngroup.com/articles/dashboards-preattentive/)).
- Real portals lead with money in and money out, then value:
  - Carta shows commitment, contributed and net asset balance, and TVPI/DPI/IRR where access allows ([Carta fund admin](https://carta.com/fund-management/fund-administration/); [Carta release note](https://releasenotes.carta.com/new-navigation-for-limited-partners-on-the-lp-portal-Rk74Y)).
  - AngelList shows net value split into realized and unrealized ([AngelList help](https://help.angellist.com/hc/en-us/articles/32869857735437-How-can-I-see-the-valuation-of-my-investments)).
  - Fundrise shows account value, net contribution and net return, then allocation by fund ([Fundrise update 1009](https://fundrise.com/investor-update/1009/view)).
- Agri apps lead instead with _projected_ profit: iharvst **[SECONDARY]** ([review](https://tanmee.substack.com/p/ifarmer-iharvst-rebrand-bangladesh)), WeGro's "Profit Simulation" ([WeGro](https://www.wegro.global/)), and Livestock Wealth's fixed payout figures ([Livestock Wealth](https://livestockwealth.com/investments/pregnant-cow/)). OpenFarm forbids this, rightly (CONTEXT.md, **Investor Statement**). Notably, Livestock Wealth's own FAQ page lists "The FSCA takes regulatory action against Livestock Wealth" ([FAQ](https://livestockwealth.com/frequently-asked-questions/)).

**What OpenFarm does.**

- **Capital account.** The first thing on the page is "Your capital held now", at `text-3xl md:text-4xl`. Under it is a paid-in-of-promised bar, as a fund shows called against committed. Beside it are paid out, profit share, Units and Ventures running (`apps/web/src/components/portal/capital-account.tsx:106-162`).
- **Allocation by Venture.** This appears only once there are two Ventures to compare (`capital-account.tsx:170-223`).
- **Venture cards.** Each card shows the stage, capital, Units, split and sale window (`pages/home.tsx:33-104`).
- **Requests and open Ventures.** Their Requests to Join follow, then the Ventures raising capital, and the latter only when there are any (`pages/home.tsx:156-157`; `open-ventures.tsx:91-118`).

**Gap.** Small. On a Venture card the label says "Sale window" but shows only the window's first day (`pages/home.tsx:93-98`). Every other place shows the range (`pages/venture.tsx:349-354`). SLDS: "User name, date, and number fields are especially ambiguous when shown without a label" ([SLDS](https://v1.lightningdesignsystem.com/guidelines/displaying-data/)).

## 2. A Venture's page

**What the sources say.**

- Portals give each investment its own page, reached from the list, holding its own papers: AngelList's per-investment page with "Final Investment Documents" ([AngelList](https://help.angellist.com/hc/en-us/articles/32869638905741-Where-do-I-find-my-signed-investment-documents)), Carta's per-fund sidebar, and iharvst's "My Farms".
- A KPI tile must show its unit and when it was measured ([SLDS metric display](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/)).
- Apple: "don't require interaction to reveal critical information" ([Apple HIG charts](https://developer.apple.com/design/human-interface-guidelines/charts)).
- iharvst investors "Track farm progress via regular updates—text, photos, and satellite-based insights" ([iharvst](https://www.ifarmer.asia/product-iharvst)). Fundrise posts project photos and video in a newsfeed ([Fundrise update 679](https://fundrise.com/investor-update/679/view)).

**What OpenFarm does.**

- **Top of the page.** A stage track, then four figures: capital with Units and share, the split, then either animals and days to the window or, once settled, profit share and payout (`pages/venture.tsx:63-130`).
- **How to pay.** Shown while capital is owed (`how-to-pay.tsx`).
- **Three tabs.** Animals, Spending and Papers, each with the key dates beside it (`pages/venture.tsx:416-493`).
- **Herd tab.** It shows intake, latest weight and daily gain as averages and per animal (`pages/venture.tsx:136-244`).
- **An empty herd says why** (`pages/venture.tsx:142-161`).
- **The description is honest:** "Days are counted and weights are read; nothing here is a forecast."

**Gaps.**

- **"Now" has no date.** The latest weight and the daily gain carry no date. The server has each weigh-in's `weighedAt` (`packages/api/src/venture-herd-store.ts:141-145`), but `theirVentureToday` passes no date to the page (`packages/api/src/portal-reads.ts:164-178`). A weight read five weeks ago reads as today's. That is the kind of unintended impression the "no projection" rule exists to prevent.
- **No photographs on the page.** The progress statement already carries photographs of the Venture's animals (`packages/api/src/investor-statement-store.ts:339`), but the page shows none. Photos are how every livestock platform found makes the animal real to an owner.
- **On a phone, every figure loses its explanation.** See section 9.

## 3. Money and figures

**What the sources say.**

- **GOV.UK style** ([A–Z](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)):
  - "Do not use decimals unless pence are included".
  - "Use a minus sign for negative numbers".
  - "Do not abbreviate million to m".
- **Polaris** ([grammar](https://shopify.dev/docs/apps/design/content/grammar-and-mechanics)): "avoid shortening numbers", and "Include a space between the number and the unit".
- **Tabular figures** for numbers compared: [GOV.UK font overrides](https://design-system.service.gov.uk/styles/font-override-classes/) and [Polaris number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number).
- **Right-align** columns of numbers: [GOV.UK table](https://design-system.service.gov.uk/components/table/), [Polaris table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) and [shadcn data table](https://ui.shadcn.com/docs/data-table).
- **Atlassian:** use "'of' rather than a forward slash" ([Atlassian](https://atlassian.design/foundations/content/language-and-grammar)).
- **NN/g:** digits, not words, and for very large numbers "numerals for the significant digits and … the magnitude as a word" ([NN/g](https://www.nngroup.com/articles/web-writing-show-numbers-as-numerals/)).
- **Colour:** tone only where the figure carries a status (Polaris). Atlassian notes red/amber/green "may be hard for users with color deficiencies to tell apart" ([Atlassian dataviz colour](https://atlassian.design/foundations/color/data-visualization-color)).

**What OpenFarm does.**

- **Every sum is whole taka.** "The paisa on a sum are noise", and the minus goes before the ৳ (`apps/web/src/lib/taka.ts`).
- **Figures are tabular and money columns are right-aligned.** See, for example, `investors/investor-agreements.tsx:390-394` and `pages/venture.tsx:223-235`.
- **Paid in against promised** is said as "{paid} of {promised} promised, paid in · {percent}%", with "of", as Atlassian asks.
- **A loss is marked twice:** in the warning tone and with its minus (`capital-account.tsx:148`, `pages/venture.tsx:98`).
- **The Money page** opens with three totals (paid in, paid out, held now) over a ledger with column totals (`pages/money.tsx:18-43`; `investor-agreements.tsx:400-412`). This matches the fund-portal pattern.

**Gap.** English uses British grouping: `en-GB` gives 12,345,678 (`packages/i18n/src/format.ts:3`). See section 10. Otherwise the portal already does all of the above, and no change is recommended.

## 4. Charts

**What the sources say.**

- **Most data does not need a chart.** "Not every collection of data needs to be displayed in a chart … consider … a list or table" ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/charting-data)).
- **Keep to the basics.** NN/g recommends "bar charts, line charts, or scatter plots", and says pie and donut charts "should be avoided most of the time" ([chart types](https://www.nngroup.com/articles/choosing-chart-types/); [dashboards](https://www.nngroup.com/articles/dashboards-preattentive/)).
- **Axes and gaps.** Carbon: bars start at zero, and "Never interpolate between periods when data is unavailable" ([Carbon axes](https://carbondesignsystem.com/data-visualization/axes-and-labels/)).
- **Colour.** Atlassian: "Use a single color as the default … Avoid using more than 5-6 colors" ([Atlassian](https://atlassian.design/foundations/color/data-visualization-color)).
- **A text alternative.** SLDS: an inline chart "will need an accessible alternative like a text-based summary or a table" ([SLDS](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/)). Apple: a headline sentence over the chart.
- **shadcn/ui's chart** is Recharts, coloured by the same `--chart-1…5` variables this repo already defines. Its `accessibilityLayer` adds keyboard and screen-reader support ([shadcn chart](https://ui.shadcn.com/docs/components/chart)).

**What OpenFarm does.** Its only graphics are three bars, all drawn by length (the attribute NN/g says is read fastest), all hidden from screen readers, and each said in words beside it:

- the stage meter (`stage-meter.tsx`);
- the paid-in bar (`capital-account.tsx:60-98`);
- the allocation bar (`capital-account.tsx:170-223`).

There is no chart library in the repo.

**Gap.** Weight over time is the one series an Investor would read better as a line than as three averages: it is facts, and it runs over time. It is optional. If it is drawn, it has to follow the rules above. It must also not extend a trend line or show a target weight, because either reads as a forecast. Whether a target weight may appear is the Owner's call (CONTEXT.md, **Investor Statement**: "a future price on a paper a man keeps reads as a promise").

## 5. Papers

**What the sources say.**

- Portals keep formal, dated papers in one place, as well as under each investment:
  - AngelList has a "Taxes and Documents" tab, and hides the reports section when there is none ([AngelList](https://help.angellist.com/hc/en-us/articles/32869705627789-Where-do-I-find-my-tax-documents-and-financial-reports)).
  - Allvue delivers capital account statements and notices ([Allvue](https://www.allvuesystems.com/solutions/investor-portal/)).
  - iharvst issues an ownership certificate 15–16 days after the invoice ([iharvst](https://www.ifarmer.asia/product-iharvst)).
- **PDF by printing.** Fundrise statements are saved as PDF through the browser's print dialog ([Fundrise help](https://fundrise.com/help/articles/360032528252-Where-can-I-find-my-account-statements-)).

**What OpenFarm does.** It has a Papers page, and a Papers tab on each Venture (`pages/papers.tsx`, `their-papers.tsx`, `portal-papers.tsx:55-163`):

- Each paper is named, says what it is for, and has an Open button.
- All three papers are always listed. One not available yet is dim and says when it will be.
- A paper opens in a dialog with Print (`components/paper.tsx:93-103`), which is also how it becomes a PDF.
- Each opening is an Export in the trail.

**Gap.** None worth a change. Listing all three and dimming the ones not yet available is clearer than hiding them.

## 6. Activity and notices

**What the sources say.**

- **New papers.** Carta tells an LP of a new paper by email, either at once or in a daily digest. Sensitive papers stay behind sign-in with a "Log in to view" link ([Carta](https://support.carta.com/kb/guide/en/how-to-share-documents-with-investors-p4gMLTAANi/Steps/3725322)). Allvue sends an email carrying a secure link **[snippet only]**.
- **Progress updates.** Fundrise and iharvst post updates.
- **Status.** NN/g's first heuristic: "keep users informed about what is going on" ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).

**What OpenFarm does.**

- The portal is pull-only; nothing is sent to an Investor.
- What happened is on the pages: payouts in the Money ledger, a Request's answer on Home (`requests-to-join.tsx:378`), and the key dates on each Venture.

**Gap.** There is no "what changed since you were last in", and no message when a payout is recorded or a Request is answered. Sending messages is **the Owner's decision, not a design call**, for three reasons:

- It costs money if it is SMS.
- An outbound message from "the farm" is exactly what the portal's own warning teaches Investors to distrust (`how-to-pay.tsx:24-58`).
- It was never part of ADR 0007.

## 7. Account, security and trust

**What the sources say.**

- **Credibility.** NN/g names design quality, up-front disclosure, comprehensive and current content, and connection to the rest of the web. It warns that "Typos, broken links, and other mistakes quickly degrade credibility" ([NN/g](https://www.nngroup.com/articles/trustworthy-design/)).
- **Two-factor sign-in** is standard in fund portals:
  - Carta prompts it at registration, and **[snippet only]** it has been mandatory since 2022 ([Carta](https://support.carta.com/kb/guide/en/how-to-set-up-two-factor-authentication-2fa-TEDw9Dkz2V/Steps/3716552)).
  - Juniper Square offers it ([Juniper Square](https://www.junipersquare.com/security-compliance)).
  - Addepar lets a firm make it mandatory ([Addepar](https://addepar.com/blog/inside-addepar-may-2023)).
- **Preview before publishing.** Juniper Square lets the GP "preview the portal as any investor" before publishing ([Juniper Square](https://www.junipersquare.com/platform/portal)).
- **Accessible authentication.** WCAG 3.3.8 recognises "support for password entry by password managers … and copy and paste" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#accessible-authentication-minimum)).

**What OpenFarm does.**

- **Disclosure on every page.** Every page carries the notice, the «আপনার তথ্য» link and whom to call (`portal-door.tsx:29-40`; `portal-shell.tsx:415-424`).
- **The Account page** shows their record with the NID and bank account masked, their Nominees, and the farm's name, phone and address. It lets them change their password and see where they are signed in, and sign out everywhere else (`pages/account.tsx:87-333`).
- **Sign-in.** A sign-in lasts a working day, and the page says why it ended (`login.tsx:75-79`).
- **The payment warning** is in both languages (`how-to-pay.tsx:30-58`).
- **The Owner's Portal Preview** is Juniper Square's preview.
- **Password managers and paste work** (the exposure review, 1.3).

**Gap.** No second factor. That is **the Owner's decision**: an SMS code costs money and needs a provider, and ASVS level 1, the baseline of the exposure review, does not require one. Nothing else is missing.

## 8. Empty, loading and error states

**What the sources say.**

- **Empty.** NN/g: "Do not default to totally empty states" ([NN/g](https://www.nngroup.com/articles/empty-state-interface-design/)). Polaris: "Say why it's empty" ([Polaris](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state)). Carbon: an empty table replaces the table and its headers, in plain words ([Carbon](https://carbondesignsystem.com/patterns/empty-states-pattern/)).
- **Loading.** A skeleton "mimics the layout of the page". NN/g does "not recommend" one that shows only the frame "without a content wireframe" ([NN/g](https://www.nngroup.com/articles/skeleton-screens/), checked). Atlassian: "Match the size and shape of the expected content so the page does not jump" ([Atlassian](https://atlassian.design/components/skeleton/usage)).
- **Errors.** Use plain words, no codes, and say what to do next ([NN/g](https://www.nngroup.com/articles/error-message-guidelines/); [GOV.UK](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/)).

**What OpenFarm does.**

- **Empty states say why:** the herd, the papers and the money ledger (`pages/venture.tsx:142-161`; `their-papers.tsx:20-22`; `investor-agreements.tsx:349-350`). Open Ventures are simply absent from Home when there are none.
- **`Loaded` handles failure:** a failure offers Retry, and a failed refresh keeps the figures with a warning (`components/page.tsx:390-433`).
- **Offline, the page says so** rather than show old figures (`portal-shell.tsx:402-414`).
- **Refusals are in the Investor's words** (`portal-papers.tsx:41-47`).

**Gap.** Each page's skeleton is one grey block (`pages/home.tsx:152`, `pages/venture.tsx:508`, `pages/money.tsx:72`, `pages/papers.tsx:20`, `pages/open-ventures.tsx:21`). The page then jumps into a different shape.

## 9. Phones

**What the sources say.**

- **Tables become lists.** Polaris tables render "as lists on small screens", and their headers should "make sense when displayed as stacked key-value pairs" ([Polaris](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table)). SLDS tables "collapse into tile lists" ([SLDS](https://v1.lightningdesignsystem.com/guidelines/displaying-data/)). GOV.UK: "aim to have less data in your tables" ([GOV.UK](https://design-system.service.gov.uk/components/table/)).
- **If a table must scroll sideways,** lock the first column and show that it scrolls ([NN/g mobile tables](https://www.nngroup.com/articles/mobile-tables/)).
- **Reflow.** WCAG 1.4.10 exempts data tables from reflow, so this is about usability, not conformance ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
- **Tab bars** suit "relatively few navigation options", and no more than 5 ([NN/g](https://www.nngroup.com/articles/mobile-navigation-patterns/)).
- **Touch targets:** "at least 1cm × 1cm" ([NN/g](https://www.nngroup.com/articles/touch-target-size/)).

**What OpenFarm does.**

- **Navigation.** A bottom bar holds four places plus More (`portal-shell.tsx:67-95`). Default buttons are 44 px tall on a phone and small ones 36 px (`packages/ui/src/components/button.tsx:25-27`).
- **Figures lose their explanation below `md`.** `SummaryFigures` draws one compact card there and drops every figure's `hint` (`apps/web/src/components/page-kit.tsx:67-90`, against the tiles at `:91-110`). On a Venture's page that removes:
  - "A count of days, not a promise";
  - "Paid on {day}" or "Not paid yet";
  - "Farm takes {n}%";
  - "{n} sold · {n} lost";
  - the Units and share.

  On the Money page it removes "sent back to you". On a phone, the only place "not a promise" appears is gone.

- **The money ledger is at least 44rem (704 px) wide** (`investors/investor-agreements.tsx:353`). On a 360 px phone it scrolls sideways through six columns, with nothing locked.
- **The herd table is at least 28rem wide** (`pages/venture.tsx:194`).

**Gap.** Those three. They are the most important findings in this note, because most Investors read on a phone.

## 10. Bangla and localisation

**What the sources say.**

- **Bangla (CLDR bn).**
  - Bengali digits by default: `defaultNumberingSystem` is `beng`.
  - Lakh grouping: the decimal pattern is `#,##,##0.###`.
  - The currency pattern is `#,##,##0.00¤`, so ৳ goes **after** the number.
  - The compact forms are `0 হাজার`, `0 লাখ` and `0 কোটি`.

  ([bn.xml](https://github.com/unicode-org/cldr/blob/release-48/common/main/bn.xml))

- **English in Bangladesh.** CLDR has **no `en_BD`**; `en-BD` falls back to `en`, which uses Western grouping. `en_IN` has lakh grouping (`#,##,##0.###`) ([en_IN.xml](https://github.com/unicode-org/cldr/blob/release-48/common/main/en_IN.xml)).
- **Bangladesh Bank's own English pages** write "Tk. 5,00,000" and "1,00,000 (one lakh) taka" ([Bangladesh Bank](https://www.bb.org.bd/en/index.php/financialactivity/paysystems)).
- **No official Bangladeshi style guide** on ৳ or "Tk", or on where either goes, was found.
- **Language of parts.** WCAG 3.1.2 asks that the language of each passage be programmatically determined ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#language-of-parts)).
- **Text spacing.** WCAG 1.4.12 lets scripts that do not use a property conform without it, and encourages "locally available guidance" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#text-spacing)).

**What OpenFarm does.**

- **Bangla figures.** Bangla uses `bn-BD`: Bengali digits and lakh grouping (`format.ts:3-11`; the test at `i18n.test.ts:29`).
- **Bangla type.** Its type is larger (body 17 px, never under 14 px), in both languages on a shared line height, and letter-spacing is removed in Bangla (`packages/ui/src/styles/globals.css:242-269`, `:311-313`).
- **Language marked where it changes.** The payment warning's second language carries `lang` (`how-to-pay.tsx:54`), and «আপনার তথ্য» is marked `lang="bn"` (`pages/your-data.tsx:19`).
- **The ৳ goes before the figure** in both languages (`taka.ts`). That departs from CLDR bn and follows Bangladesh Bank's "Tk." usage. It is consistent, and the minus sits in front of it.

**Gaps.**

- **English grouping.** English figures group the British way, 12,345,678. Bangladeshi readers of English, and Bangladesh Bank's own English pages, write 1,23,45,678. Switching English to lakh grouping is a one-line change (`format.ts:3` to `en-IN` for numbers), but it would change how every paper prints. Papers are meant to "read the same every time" (`components/paper.tsx:30`). So it is **the Owner's decision**.
- **No compact forms.** Nothing uses `লাখ` or `কোটি`. Sums in the portal are at most a few lakh, so none is needed.

## 11. Accessibility

WCAG 2.2 AA, as the portal stands. Contrasts were computed from the `oklch` tokens in `globals.css`.

| Criterion                       | Portal                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.3 Contrast                  | Muted text is 7.1:1 on the card and 6.6:1 on the ground, and primary is 9.7:1. Passes.                                                                                                                                                                                                                                                                   |
| 1.4.1 Use of colour             | Passes. Stages, allocation, badges and losses all carry words and icons as well as colour (`globals.css:76`, `page.tsx` `StatusBadge`).                                                                                                                                                                                                                  |
| 1.4.11 Non-text contrast        | `--chart-3` is 2.5:1 on white (`globals.css:110`), and `--chart-2` is 3.5:1. The allocation bar is `aria-hidden`, and its names, sums and percentages are in text, so nothing fails today. A real chart would need 3:1.                                                                                                                                  |
| 2.5.8 Target size               | Passes. The smallest portal buttons are 32 px on a desk and 36 px on a phone, against a 24 px minimum.                                                                                                                                                                                                                                                   |
| 2.4.11 Focus not obscured       | **Not verified.** The top bar is sticky, 56 px tall (`portal-shell.tsx:377-396`), and the phone's bottom bar is fixed. No `scroll-padding` is set anywhere in `apps/web/src`. W3C names this very case (F110) and gives scroll padding as the fix ([Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)). |
| 3.2.6 Consistent help           | Passes. The farm's phone is in the same footer on every page.                                                                                                                                                                                                                                                                                            |
| 3.3.8 Accessible authentication | Passes. Paste and password managers work.                                                                                                                                                                                                                                                                                                                |
| 1.3.1 Tables                    | Passes. Tables are real `<table>` elements with `scope="col"` (`pages/venture.tsx:197-213`).                                                                                                                                                                                                                                                             |

## 12. Visual style: "beautiful" within the enterprise look

**What the sources say.**

- **Hierarchy.** Carbon and Polaris make hierarchy by size and contrast, not decoration.
- **Case.** Carbon ([writing style](https://carbondesignsystem.com/guidelines/content/writing-style/)) and Fluent ([content design](https://fluent2.microsoft.design/content-design)) ask for sentence case.
- **A metric style.** Atlassian has a dedicated "metric" type style for currency and totals, "not for longer statements" or chart titles ([Atlassian](https://atlassian.design/foundations/typography/applying-typography)).
- **Borders.** GOV.UK keeps row borders because they "help many users find and read information that's laid out in rows, especially users who zoom" ([summary list](https://design-system.service.gov.uk/components/summary-list/)).
- **Credibility** comes first from looking "legitimate and professional" (NN/g).

**What OpenFarm does.**

- Surfaces are flat, with hairlines (`--surface-shadow` is zero).
- The ground is neutral, the brand evergreen and the radius 0.5rem.
- Case is sentence case, with capitals only on the sidebar's group labels (`globals.css:64-72`, `:114-116`, `:282-290`).
- One figure is large on Home, and figures are tabular throughout.
- The Section pattern sits on the `surface` utility.

This is what the sources describe. Nothing here asks for shadows, gradients or illustration.

**Gaps.** Two are cosmetic:

- Two surfaces are written out by hand rather than with `surface`: the phone figure card (`page-kit.tsx:69`) and `Section` (`page.tsx:146`).
- The Venture page's four figures are all the same size, so none reads first.

The Owner's word "beautiful" is best met by finishing the phone view and adding the animals' photographs, not by new styling.

---

## Recommendations

Each item names its source and the files it would touch. None is something the portal already does.

### Must

1. **Keep each figure's explanation on a phone.** Give the compact card in `SummaryFigures` the same `hint` line the tiles have, in muted `text-xs`.
   - **Why:** most Investors read on phones. The dropped lines include "A count of days, not a promise" and "Not paid yet". A figure needs its meaning beside it ([SLDS metric display](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/); [NN/g mobile first is not mobile only](https://www.nngroup.com/articles/mobile-first-not-mobile-only/)).
   - **Files:** `apps/web/src/components/page-kit.tsx:67-90`. Twenty-two files use `SummaryFigures`, so the farm's own pages change too. Either open the busiest in the browser, or add an opt-in prop and use it on the portal only.
2. **Make the money ledger a list on a phone.** Below `md`, draw each movement as a row: date and what it was on the left, the signed amount on the right, and the Venture and reference under them. Keep the table at `md` and up. Keep the totals as a closing row.
   - **Why:** [Polaris table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table); [SLDS displaying data](https://v1.lightningdesignsystem.com/guidelines/displaying-data/).
   - **Files:** `apps/web/src/components/investors/investor-agreements.tsx:318-418`, the portal variant only (`inThePortal`), since the Owner's page is read on a desk.
3. **Say when the figures are from.**
   - Under the herd averages: "Last weighed {day}". Per animal: the day of her latest weight.
   - Under each page header on Home and a Venture: "Figures as at {time}", from the query's `dataUpdatedAt`, in the farm's time zone.
   - **Why:** [SLDS](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/): "the time when the metric was actually measured"; [M3](https://m3.material.io/blog/data-visualization-accessibility): "data recency"; [NN/g credibility](https://www.nngroup.com/articles/trustworthy-design/): current content.
   - **Files:**
     - `packages/api/src/portal-reads.ts:164-178`: add the latest `weighedAt`, herd-wide and per animal;
     - `packages/api/src/venture-herd-store.ts:141-170`: carry it out of `fatteningOf`'s input;
     - `apps/web/src/components/portal/pages/venture.tsx:136-244`;
     - `pages/home.tsx`;
     - `packages/i18n/src/messages/{en,bn}.ts`.
   - **Also:** the same fields reach the Portal Preview, whose answers _are_ kept on the Owner's device (`lib/query-cache.ts:100-107` keeps everything not under `portal`). Default the new fields for an old kept answer.

### Should

4. **Make the herd table a list on a phone.** Below `sm`, one row per animal: the tag, then "now" and "a day" on the right, with intake under them.
   - **Why:** [Polaris](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table); [GOV.UK table](https://design-system.service.gov.uk/components/table/).
   - **Files:** `pages/venture.tsx:192-241`.
5. **Show the animals' photographs on the Venture page.** Use a small strip of the standing animals' latest photographs, each captioned with its tag and the day it was taken. These are the same photographs the progress statement already shows the Investor, so nothing new is disclosed.
   - **Why:** [iharvst](https://www.ifarmer.asia/product-iharvst) ("text, photos"); [Fundrise](https://fundrise.com/investor-update/679/view); [NN/g credibility](https://www.nngroup.com/articles/trustworthy-design/).
   - **Files:** `packages/api/src/portal-reads.ts` (add photo references to `theirVentureToday`, or a separate read, so the page's answer stays small); `packages/api/src/investor-statement-store.ts:339` (reuse its query); `pages/venture.tsx` (the Animals tab).
   - **Owner's call:** whether every animal's photograph shows, or only chosen ones.
6. **Make skeletons the shape of the page.** Each portal page's skeleton should be its own grid in grey: the hero and four lines on Home, the tiles and a tab on a Venture, and so on.
   - **Why:** [NN/g skeleton screens](https://www.nngroup.com/articles/skeleton-screens/); [Atlassian skeleton](https://atlassian.design/components/skeleton/usage); [Carbon loading](https://carbondesignsystem.com/patterns/loading-pattern/).
   - **Files:** `pages/home.tsx:152`, `pages/venture.tsx:508`, `pages/money.tsx:72`, `pages/papers.tsx:20`, `pages/open-ventures.tsx:21`, `pages/open-venture.tsx:108`, `pages/account.tsx:351`.
7. **Keep a focused control out from under the bars.** Set `scroll-padding-top` to the header's height, plus the Preview band's where it shows, and `scroll-padding-bottom` to the bottom bar's on a phone. Check it with Tab in the browser before and after.
   - **Why:** [WCAG 2.4.11, F110](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
   - **Files:** `packages/ui/src/styles/globals.css` (base layer), or the portal shell's root.
8. **Show the whole window on the Venture card:** "{start} – {end}", as the Venture page does. Or relabel it "Sale window opens".
   - **Why:** [SLDS displaying data](https://v1.lightningdesignsystem.com/guidelines/displaying-data/); [GOV.UK style](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/) on ranges.
   - **Files:** `pages/home.tsx:93-98`.

### Could

9. **A weight-over-time line for the herd average,** with these limits:
   - weighings only;
   - no line drawn across a gap;
   - no trend extended;
   - a one-line summary above it, and the table as its alternative.

   - **Why:** [NN/g chart types](https://www.nngroup.com/articles/choosing-chart-types/); [Carbon axes](https://carbondesignsystem.com/data-visualization/axes-and-labels/); [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/charting-data); [SLDS](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/).
   - **How:** use shadcn/ui's Chart (Recharts) with `accessibilityLayer` ([shadcn](https://ui.shadcn.com/docs/components/chart)). That is a new dependency, so hand-check the lockfile.
   - **Owner's call:** a target-weight line would read as a promise.
   - **Files:** a new `components/portal/weight-line.tsx`; `packages/ui` (the chart component); `portal-reads.ts` (the weigh-in series).
10. **Darken `--chart-3`** to at least 3:1 on white before any real chart uses it.
    - **Why:** [WCAG 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast).
    - **Files:** `packages/ui/src/styles/globals.css:110`.
11. **One lead figure on the Venture page:** set "Your capital" larger than the other three, as Home does.
    - **Why:** [Polaris number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number); [Carbon](https://carbondesignsystem.com/data-visualization/dashboards/).
    - **Files:** `pages/venture.tsx:446-447`, perhaps with a `lead` flag on `Figure` in `page-kit.tsx`.
12. **Use the `surface` utility** for the phone figure card and for `Section`, as the kit's own rule says.
    - **Files:** `page-kit.tsx:69`, `page.tsx:146`.

### For the Owner or the lawyer, not a designer

- **Where the Ventures raising capital sit.** They are reached from Home only, not from the sidebar or the bottom bar. Moving them up is a question under ADR 0007 and ADR 0008, and this note does not recommend it.
- **Projected profit, expected return, target weight.** Agri apps lead with these. OpenFarm's rule forbids them (CONTEXT.md, **Investor Statement**), and this note does not recommend them.
- **English lakh grouping** (section 10). It changes every printed paper.
- **Messages to Investors** when a payout is recorded or a Request answered (section 6).
- **A second sign-in factor** (section 7).

## Open questions

1. Does the Owner want English figures grouped in lakh and crore (1,23,45,678), as Bangladesh Bank writes them? If so, from which date do papers print that way?
2. May the Venture page show every standing animal's latest photograph, or only ones the Owner picks?
3. Should the portal send anything at all? SMS or email on a payout, or on a Request's answer, set against the warning that the farm never asks them anything by message.
4. Is a second factor worth its cost for twenty people? It is not required at ASVS level 1.
5. ৳ before the figure in Bangla departs from CLDR bn (`১,২৩,৪৫,৬৭৮৳`). No official Bangladeshi guidance was found either way. Keep it as it is, as this note assumes?

## What could not be confirmed

- **How many headline figures.** No design system gives a number. They only say "limit".
- **"Show when data was last updated".** NN/g never says it outright. The recommendation rests on SLDS and Material, with NN/g's "current content" as support.
- **Livestock Wealth's per-cow updates.** Weekly weight and location updates appear only in search summaries. The relevant page is now 404.
- **Juniper Square's K-1 notice, Allvue's read receipts, and Carta's mandatory 2FA** were seen only in search summaries.
- **Bangla or accessibility features** in any global portal: none found. Only DeenAgro and WeGro are in Bangla.
- **Nothing was tried in a browser for this note.** The phone findings are read from the code: breakpoints, `min-w`, and the missing `hint`. Confirm them on a 360 px screen before building.

## Sources

**Design systems**

- IBM Carbon: [Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) · [Axes and labels](https://carbondesignsystem.com/data-visualization/axes-and-labels/) · [Colour palettes](https://carbondesignsystem.com/data-visualization/color-palettes/) · [Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) · [Loading](https://carbondesignsystem.com/patterns/loading-pattern/) · [Data table usage](https://carbondesignsystem.com/components/data-table/usage/) · [Writing style](https://carbondesignsystem.com/guidelines/content/writing-style/)
- Atlassian: [Applying typography](https://atlassian.design/foundations/typography/applying-typography) · [Language and grammar](https://atlassian.design/foundations/content/language-and-grammar) · [Date and time](https://atlassian.design/foundations/content/date-time) · [Data visualisation colour](https://atlassian.design/foundations/color/data-visualization-color) · [Empty state](https://atlassian.design/components/empty-state/usage) · [Skeleton](https://atlassian.design/components/skeleton/usage) · [Spinner](https://atlassian.design/components/spinner/usage)
- Shopify Polaris (shopify.dev): [Table](https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table) · [Number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number) · [Grammar and mechanics](https://shopify.dev/docs/apps/design/content/grammar-and-mechanics) · [Empty state](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state) · [Spinner](https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/spinner) · [App home page](https://shopify.dev/docs/apps/design/user-experience/app-home-page)
- GOV.UK: [Table](https://design-system.service.gov.uk/components/table/) · [Summary list](https://design-system.service.gov.uk/components/summary-list/) · [Font override classes](https://design-system.service.gov.uk/styles/font-override-classes/) · [Panel](https://design-system.service.gov.uk/components/panel/) · [Problem with the service pages](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/) · [A to Z style guide](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)
- Apple HIG: [Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data) · [Charts](https://developer.apple.com/design/human-interface-guidelines/charts) · [Loading](https://developer.apple.com/design/human-interface-guidelines/loading)
- Material: [M3 data visualisation accessibility (blog, 2022)](https://m3.material.io/blog/data-visualization-accessibility) · [M2 data visualisation](https://m2.material.io/design/communication/data-visualization.html)
- Fluent 2: [Skeleton](https://fluent2.microsoft.design/components/web/react/core/skeleton/usage) · [Spinner](https://fluent2.microsoft.design/components/web/react/core/spinner/usage) · [Content design](https://fluent2.microsoft.design/content-design)
- Salesforce SLDS v1: [Metric display](https://v1.lightningdesignsystem.com/guidelines/data-visualization/metric-display/) · [Charts](https://v1.lightningdesignsystem.com/guidelines/data-visualization/charts/) · [Displaying data](https://v1.lightningdesignsystem.com/guidelines/displaying-data/) · [Loading](https://v1.lightningdesignsystem.com/guidelines/loading/) · [Empty state](https://v1.lightningdesignsystem.com/guidelines/empty-state/)
- shadcn/ui: [Chart](https://ui.shadcn.com/docs/components/chart) · [Empty](https://ui.shadcn.com/docs/components/empty) · [Skeleton](https://ui.shadcn.com/docs/components/skeleton) · [Data table](https://ui.shadcn.com/docs/data-table)

**Nielsen Norman Group**

- [Dashboards: preattentive attributes (2017)](https://www.nngroup.com/articles/dashboards-preattentive/) · [Data tables: four major user tasks (2022)](https://www.nngroup.com/articles/data-tables/) · [Mobile tables (2017)](https://www.nngroup.com/articles/mobile-tables/) · [Numbers as numerals (2007)](https://www.nngroup.com/articles/web-writing-show-numbers-as-numerals/) · [Trustworthiness: 4 credibility factors (2016)](https://www.nngroup.com/articles/trustworthy-design/) · [Empty states in complex applications (2021)](https://www.nngroup.com/articles/empty-state-interface-design/) · [Skeleton screens 101 (2023)](https://www.nngroup.com/articles/skeleton-screens/) · [Response times (1993/2014)](https://www.nngroup.com/articles/response-times-3-important-limits/) · [Error-message guidelines (2023)](https://www.nngroup.com/articles/error-message-guidelines/) · [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Touch targets (2019)](https://www.nngroup.com/articles/touch-target-size/) · [Mobile navigation patterns (2015)](https://www.nngroup.com/articles/mobile-navigation-patterns/) · [Mobile first is not mobile only (2016)](https://www.nngroup.com/articles/mobile-first-not-mobile-only/) · [Choosing chart types (2022)](https://www.nngroup.com/articles/choosing-chart-types/) · [Lower-literacy users (2005)](https://www.nngroup.com/articles/writing-for-lower-literacy-users/)

**W3C**

- [WCAG 2.2 (12 December 2024)](https://www.w3.org/TR/WCAG22/) · Understanding: [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) · [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) · [Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [Consistent help](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)

**Unicode and ECMA**

- CLDR 48: [bn.xml](https://github.com/unicode-org/cldr/blob/release-48/common/main/bn.xml) · [en_IN.xml](https://github.com/unicode-org/cldr/blob/release-48/common/main/en_IN.xml) · [numberingSystems.xml](https://github.com/unicode-org/cldr/blob/main/common/supplemental/numberingSystems.xml) · [supplementalData.xml](https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml) · [UTS #35 Numbers](https://www.unicode.org/reports/tr35/tr35-numbers.html) · [bn chart](https://www.unicode.org/cldr/charts/48/summary/bn.html)
- [ECMA-402](https://tc39.es/ecma402/) · [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat) (reference for the JS API)
- [Bangladesh Bank, payment systems](https://www.bb.org.bd/en/index.php/financialactivity/paysystems) (usage, not a style guide)

**Investor products**

- Carta: [Fund administration](https://carta.com/fund-management/fund-administration/) · [LP navigation release note](https://releasenotes.carta.com/new-navigation-for-limited-partners-on-the-lp-portal-Rk74Y) · [Sharing documents](https://support.carta.com/kb/guide/en/how-to-share-documents-with-investors-p4gMLTAANi/Steps/3725322) · [2FA](https://support.carta.com/kb/guide/en/how-to-set-up-two-factor-authentication-2fa-TEDw9Dkz2V/Steps/3716552) · [LP FAQ](https://support.carta.com/kb/guide/en/frequently-asked-questions-for-limited-partners-lps-AXmX8ZAUNM/Steps/3828086)
- AngelList: [Valuations](https://help.angellist.com/hc/en-us/articles/32869857735437-How-can-I-see-the-valuation-of-my-investments) · [Signed documents](https://help.angellist.com/hc/en-us/articles/32869638905741-Where-do-I-find-my-signed-investment-documents) · [Tax documents](https://help.angellist.com/hc/en-us/articles/32869705627789-Where-do-I-find-my-tax-documents-and-financial-reports)
- Juniper Square: [Investor portal](https://www.junipersquare.com/platform/portal) · [Security](https://www.junipersquare.com/security-compliance)
- Addepar: [Inside Addepar, May 2023](https://addepar.com/blog/inside-addepar-may-2023)
- Allvue: [Investor portal](https://www.allvuesystems.com/solutions/investor-portal/) · [Investor experience](https://www.allvuesystems.com/resources/allvue-in-action-enhancing-your-investor-experience/)
- Fundrise: [Investor update 1009](https://fundrise.com/investor-update/1009/view) · [Investor update 679](https://fundrise.com/investor-update/679/view) · [Statements help](https://fundrise.com/help/articles/360032528252-Where-can-I-find-my-account-statements-)
- iFarmer / iharvst: [iharvst](https://www.ifarmer.asia/product-iharvst) · [iFarmer](https://www.ifarmer.asia/) · [App Store listing](https://apps.apple.com/us/app/ifarmer-asia/id1517599779) · [iharvst redesign review](https://tanmee.substack.com/p/ifarmer-iharvst-rebrand-bangladesh) **[SECONDARY]**
- [WeGro](https://www.wegro.global/) · [DeenAgro](https://deenagro.com/)
- Livestock Wealth: [How it works](https://livestockwealth.com/how-it-works/) · [FAQ](https://livestockwealth.com/frequently-asked-questions/) · [Pregnant cow](https://livestockwealth.com/investments/pregnant-cow/)
- [CrowdFarming: how to adopt](https://support.crowdfarming.com/l/en/article/itoh9v24x8-how-to-adopt-everything-you-need-to-know)
