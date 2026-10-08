# Why does the English UI feel off next to enterprise products?

**Question:** The Owner says the English screens "feel off — maybe the font, font size, casing" beside enterprise products. What do Inter's own documents and the enterprise design systems say about Inter's features, its tracking, line heights, body and title sizes, and the capitalization of product nouns? How does OpenFarm compare, and what should change?

**Researched:** 4 October 2026. Code read at `46b776dc` on main.

**Sources.**

- **Inter.** Read from three places: rsms.me/inter (the v4.1 site); the archived v3 site at d.rsms.me, where the dynamic-metrics page now lives; and the GitHub release notes.
- **The font OpenFarm actually ships.** The woff2 files in `packages/ui/node_modules/@fontsource-variable/inter` were opened with fontTools 4.66, and so was Inter's own CDN build for comparison.
- **The design systems.** Their token values were read from source, so every figure below is **[from code]** unless it says otherwise:
  - Carbon: `carbon-design-system/carbon` `packages/type/src/styles.ts`
  - Fluent 2: `microsoft/fluentui` `packages/tokens/src/global/{fonts,typographyStyles}.ts`
  - Material 3: `material-components/material-web` `tokens/versions/v0_192/_md-sys-typescale.scss`
  - Polaris: `Shopify/polaris` `polaris-tokens/src/themes/base/{font,text}.ts`
  - Atlassian: `@atlaskit/tokens` 20.2.0 `atlassian-typography.js` and `@atlaskit/page-header` 13.3.4
  - Elastic EUI: `elastic/eui` Borealis theme
  - Grafana: `grafana/grafana` `createTypography.ts`
  - Tailwind: 4.3.3 `theme.css` as installed
- **Apple HIG.** Read from its JSON data, `developer.apple.com/tutorials/data/design/human-interface-guidelines/{typography,writing}.json`.
- **Writing guides.** Each was read verbatim from its source:
  - Microsoft Style Guide: `MicrosoftDocs/microsoft-style-guide`, `capitalization.md` and `grammar/nouns-pronouns.md`
  - Google developer documentation style guide: `developers.google.com/style/capitalization` and `/product-names`
  - Polaris content: `polaris.shopify.com/content/content/{grammar-and-mechanics,naming}.mdx`
  - Atlassian: `atlassian.design/foundations/content/language-and-grammar`
- **String counts** were run over the 4,487 string values of `packages/i18n/src/messages/en.ts`.

**The recommendations are this note's, not the sources'.** Nothing here changes wording the advisers approved for the Investor papers or the portal (see section 4).

---

## The answer, up front

Three things make the English read as "off". In order of how much a reader notices them:

1. **Casing.** About 500 English strings (11%) capitalize a common noun mid-sentence or mid-label: "Open a Venture", "Draw a Float", "by her Tag Number", "the farm's Owner".
   - Every writing guide read says to lowercase these.
   - The app is not even consistent with itself. "Pen" appears 50 times and "pen" 96; "Farm" 54 and "farm" 311; "Version" 16 and "version" 24.
2. **Line heights.** English line heights run 2–4px taller than every system read: 12/20, 16/26, 20/30, 24/36.
   - The 14/22 of most text is within range, since Grafana uses exactly 14/22.
   - The worst outliers are 12px hints and labels (+25%) and titles (+12–28%).
   - Tighter shared values still hold Bangla; see section 3.
3. **Tracking.** Headings use Tailwind's `tracking-tight` (−0.025em), which at 16px is more than twice the −0.011em Inter's own formula gives.
   - The font loaded has no display optical size, so titles are set in the text design squeezed by hand.

One thing that looked like a cause is not one: **`font-feature-settings: "cv11", "ss01"` does nothing.** The Inter that fontsource ships, a Google Fonts build, has neither feature. The app has always drawn plain Inter. The 14px body, the 24px page title and the 16px section titles are all within the systems' range.

---

## 1. Inter's OpenType features

**What the sources say.**

- **In full Inter 4.1, `cv11` is "Single-story a" and `ss01` is "Open digits".** These are the feature names inside Inter's own CDN build (`rsms.me/inter/font-files/InterVariable.woff2`, "Version 4.001;git-9221beed3", read with fontTools). The site's feature list gives the same names ([rsms.me/inter](https://rsms.me/inter/), "Features" and the full feature index).
  - That build has `aalt calt case ccmp cv01–cv14 dlig dnom frac locl numr ordn pnum salt sinf ss01–ss08 subs sups tnum zero`, and `cpsp` in GPOS.
  - Some of those, by their names in the font: `cv05` "Lower-case L with tail", `cv01` "Alternate one", `ss02` "Disambiguation", `ss03` "Round quotes & commas", `case` "Case-Sensitive Forms".
- **What OpenFarm ships has none of them.** `@fontsource-variable/inter` 5.3.0 says it comes from `github.com/google/fonts` (`metadata.json`, `"source"`). Its `inter-latin-wght-normal.woff2`, "Version 4.001;git-66647c0bb", carries only these features:
  - GSUB: `calt ccmp dnom frac locl numr pnum tnum`
  - GPOS: `kern mark mkmk`

  There are no `cv*`, `ss*`, `case` or `zero`. The other subsets have even fewer; Cyrillic-ext and Greek have only `pnum tnum`. The glyph set has no single-story "a" for a feature to reach either: 518 glyphs, with no `a.*` alternates. **[measured with fontTools]**

- **Inter's site does not recommend a UI feature set.** Its only usage CSS is `font-feature-settings: 'liga' 1, 'calt' 1; /* fix for Chrome */` ([rsms.me/inter](https://rsms.me/inter/), "Usage"). Its FAQ sends readers to `font-feature-settings` and the OpenType Feature Freezer, but names no set.
- **What design systems built on Inter turn on:**
  - **Polaris** sets the family to `'Inter', -apple-system, …` (`font.ts`, `font-family-sans`). No `font-feature-settings` was found in the Polaris repo. It uses the variable weights 450, 550 and 650.
  - **Elastic EUI** (Borealis) uses `featureSettings: "'calt' 1, 'kern' 1, 'liga' 1"`, and adds `'tnum' 1` for number formats and the data grid (`eui-theme-borealis/src/variables/_typography.ts`; `global_styling/mixins/_typography.ts` `euiNumberFormat`; `datagrid/data_grid.styles.ts:339`).
  - **Grafana** uses `'Inter', 'Helvetica', 'Arial'`, and `fontFeatureSettings: '"tnum"'` only when a Text is `tabular` (`grafana-ui/src/components/Text/Text.tsx:106`).
  - **GitLab Pajamas.** GitLab Sans is "based on Inter" ([type fundamentals](https://design.gitlab.com/product-foundations/type-fundamentals)), with one change: "Use the cv05 disambiguation set (different lowercase `l` by default)" ([gitlab-org/frontend/fonts README](https://gitlab.com/gitlab-org/frontend/fonts)).
  - **Linear** sets `--font-settings: "cv01", "ss03"` (alternate one, round quotes) and `--font-variations: "opsz" auto` on "Inter Variable". **[from linear.app's production CSS. It has no published design system.]**
  - **Twilio Paste** uses `'Inter var experimental', 'Inter var'`. No feature settings were found in its repo.
  - **Supabase**'s design-system `globals.css` has its `font-feature-settings` line commented out.
- **None of these systems turns on `cv11` or `ss01`.** GitLab turns on `cv05`, and Linear turns on `cv01` and `ss03`. The features they do use for numbers are `tnum` and `calt`.

**What OpenFarm does.**

- It imports `@fontsource-variable/inter`, whose default `index.css` is the wght-only file (`packages/ui/src/styles/globals.css:2`).
- `body { font-feature-settings: "cv11", "ss01"; }` (`globals.css:292`) names two features the font does not have, so it renders nothing.
- Figures use `tabular-nums` (for example `apps/web/src/components/data-table.tsx:427` and `components/page.tsx:342`). That works, because the shipped font has `tnum`.
- The same declaration reaches Noto Sans Bengali, which has neither feature either. Its subsets carry only shaping features (`abvs akhn blwf … rphf vatu`), so Bangla is untouched.

**Applies here as:**

- **Delete `font-feature-settings: "cv11", "ss01"`** (`globals.css:292`). Nothing on screen changes. It removes a setting that would suddenly turn on a single-story "a" and open digits if the font were ever swapped for the full Inter, and no enterprise system on Inter does that.
- **Keep `tabular-nums` for figures.** It is EUI's and Grafana's practice, and it works with the shipped font.
- **Disambiguation is optional.** If Tag Numbers such as "D-0001" or "I-1011" are ever misread, GitLab's `cv05` (an `l` with a tail) is the precedent. Turning it on needs a full Inter build, such as rsms.me's own files or a `pyftsubset --layout-features+=cv05` subset. The Google build cannot do it.

## 2. Tracking (letter-spacing) and optical size

**What the sources say.**

- **Inter's dynamic-metrics formula.** The v4 site no longer has the page; `rsms.me/inter/dynmetrics/` is a 404 that links the archived copy. The archived v3 page says:

  > tracking = a + b × e^(c × z); a = −0.0223, b = 0.185, c = −0.1745, z = font size

  It also gives "line height = 1.4 × z" ([d.rsms.me/inter-website/v3/dynmetrics](https://d.rsms.me/inter-website/v3/dynmetrics/)). The page's source dates the constants "2019-02-07".

- **The formula's values at OpenFarm's sizes** (computed):

| Size | Tracking (em) | Tracking (px) | Its line height (1.4×) |
| ---- | ------------- | ------------- | ---------------------- |
| 12px | +0.0005       | 0.00          | 16.8                   |
| 14px | −0.0062       | −0.09         | 19.6                   |
| 16px | −0.0110       | −0.18         | 22.4                   |
| 18px | −0.0143       | −0.26         | 25.2                   |
| 20px | −0.0167       | −0.33         | 28.0                   |
| 24px | −0.0195       | −0.47         | 33.6                   |
| 30px | −0.0213       | −0.64         | 42.0                   |

- **Inter 4 added an optical-size axis.** The 4.0 release notes say: "Six additional 'Display' designs, assigned to an `opsz` variable-font axis" ([v4.0 release](https://github.com/rsms/inter/releases/tag/v4.0)). The site gives the axis as `opsz [14–32]`, with an x-height of 1118 units at opsz 14 and 1056 at opsz 32 ([rsms.me/inter](https://rsms.me/inter/), FAQ "technical details").
  - Inter's documents were not found saying whether opsz replaces dynamic metrics (**not confirmed**).
  - Measured instead, at wght 600 on a sample line ("Venture overview Animals 1,234"): the opsz-24 design is **−0.020em a character** narrower than the opsz-14 text design, and opsz 32 is −0.036em. **[measured with fontTools `instancer`]**
  - So at 24px the display design already narrows a line by about Inter's own −0.0195em.
- **CSS picks the size by itself.** `font-optical-sizing` has an initial value of `auto`, and "User agents are expected to supply a value for the 'opsz' axis which is close to the used value for font-size" ([CSS Fonts 4 §8.1](https://www.w3.org/TR/css-fonts-4/#font-optical-sizing-def)).
- **The fontsource package has opsz, but not by default.**
  - `metadata.json` lists `opsz 14–32` and the README says "Axes: `[opsz,wght]`".
  - But `import "@fontsource-variable/inter"` "Defaults to wght axis" (README). The opsz faces are in `opsz.css`.
  - The wght-only file is exactly the opsz-14 text design: equal advance widths, measured.
  - The Latin opsz file is 72,920 bytes, against 48,256 bytes for wght-only.
- **What the systems do for title tracking:**
  - Polaris: −0.2px at 20 and 24, −0.3px at 30, −0.54px at 36, and 0 at 14 and below (`font.ts` `font-letter-spacing-*`; `text.ts`).
  - EUI: titles −0.2px.
  - Carbon: 0 for headings 16px and up, and +0.16px at 14 (`styles.ts`).
  - Atlassian's page title: `letter-spacing: normal` (`title.compiled.css`).
  - Tailwind: `tracking-tight` is −0.025em at any size (`theme.css:385`).

**What OpenFarm does.**

- `tracking-tight` (−0.025em) is used 41 times, on Inter text in the text design:
  - the section title, 16px: −0.40px, against Inter's −0.18px (`components/page.tsx:56`, `SECTION_TITLE`);
  - the page title, 20 or 24px: −0.60px at 24, against −0.47px (`page.tsx:141`);
  - figures, 24–36px (`page.tsx:342`, `components/page-kit.tsx:163`);
  - the card title (`packages/ui/src/components/card.tsx:40`).
- The overline is `tracking-wider` (0.05em) at 12px (`page.tsx:136`). The sidebar group label is 0.06em (`globals.css:304-307`).
- Bangla turns all tracking off (`globals.css:283-286`, `:328-330`). That is right for a joined script, and stays.

**Applies here as:**

- **Preferred: give titles the display design and stop squeezing by hand.**
  - Import `@fontsource-variable/inter/opsz.css` in place of the default (`globals.css:2`). That costs about 25 KB more for Latin.
  - Remove `tracking-tight` from `SECTION_TITLE`, the page title, the figures and the card title.
  - The browser's `font-optical-sizing: auto` then sets 24px titles at opsz 24, which is about as tight as Inter's formula, and leaves 12–14px text on the text design (opsz clamps at 14).
  - Check page titles and figure tiles at 1280px. They get about 4–5% narrower.
- **Otherwise, set tracking per size from Inter's formula.** Tailwind v4 emits a size's own `--text-*--letter-spacing` as `letter-spacing: var(--tw-tracking, …)` (checked in `tailwindcss@4.3.3/dist/lib.js`). Declare the values in `@theme`:

  ```css
  --text-base--letter-spacing: -0.011em; /* 16px */
  --text-lg--letter-spacing: -0.014em; /* 18px */
  --text-xl--letter-spacing: -0.017em; /* 20px */
  --text-2xl--letter-spacing: -0.02em; /* 24px */
  --text-3xl--letter-spacing: -0.021em; /* 30px */
  --text-4xl--letter-spacing: -0.022em; /* 36px */
  ```

  - Set the same variables to `normal` under `html:lang(bn)`. Today's `[class*="tracking-"]` guard (`globals.css:328`) would not catch a size's own tracking.
  - Then drop `tracking-tight`. Leave `text-xs` and `text-sm` at 0: the formula gives −0.09px at 14px, below what a screen shows.

- **Keep the overline's capitals and their spacing.** The 0.05–0.06em sits between Carbon's 12px label (0.32px, about 0.027em) and Material's label-small (0.5px at 11px, about 0.045em).

## 3. Line heights

**What the sources say.** Each cell is font size/line height in px.

- **Carbon** (`styles.ts`). Its productive set has no 24 (heading-03 is 20, heading-04 is 28), and its 28/36 is shown.
- **Fluent** (`@fluentui/tokens`). The design site's table shows Subtitle 1 as 20/26 ([fluent2.microsoft.design/typography](https://fluent2.microsoft.design/typography)), but the token is `lineHeightBase500: '28px'`. The code is used here.
- **Material** has no 20 style; title-large 22/28 is shown.
- **Polaris.** body-lg and heading-md are 14/20, while the default body, body-md, is 13/20. It has no 16 style.
- **Atlassian.** heading-small is 16/20 and body-large is 16/24.
- **EUI.** Its line heights come from `euiLineHeightFromBaseline`, ×1.5 rounded down to 4px, ×1.25 above 16px.
- **Grafana.** h5 is 16/22, and its 20 column shows md 18/22.
- **macOS** has no 14, 16 or 24 style. Its built-in styles are Callout 12/15, Body 13/16, Title 3 15/20, Title 2 17/22, Title 1 22/26 and Large Title 26/32 ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography), "macOS built-in text styles"). Its nearest style is shown in each cell.
- **Tailwind** is `theme.css:347-360`.

| Size   | Carbon      | Fluent 2 | Material 3 | Polaris | Atlassian    | EUI   | Grafana | macOS HIG | Tailwind v4  | **OpenFarm** |
| ------ | ----------- | -------- | ---------- | ------- | ------------ | ----- | ------- | --------- | ------------ | ------------ |
| 12     | 12/16       | 12/16    | 12/16      | 12/16   | 12/16        | 12/16 | 12/18   | 12/15     | 12/16        | **12/20**    |
| 14     | 14/18–20    | 14/20    | 14/20      | 14/20   | 14/20        | 14/20 | 14/22   | 13/16     | 14/20        | **14/22**    |
| 16     | 16/22–24    | 16/22    | 16/24      | —       | 16/20–24     | 16/24 | 16/22   | 15/20     | 16/24        | **16/26**    |
| 20     | 20/28       | 20/28    | 22/28      | 20/24   | 20/24        | 20/24 | 18/22   | 17/22     | 20/28        | **20/30**    |
| 24     | 28/36       | 24/32    | 24/32      | 24/32   | 24/28        | 24/28 | 24/28   | 22/26     | 24/32        | **24/36**    |
| 18, 30 | 32/40 (h05) | —        | —          | 30/40   | 28/32 (h-xl) | 30/36 | 28/32   | —         | 18/28, 30/36 | 18/28, 30/42 |

**What OpenFarm does.**

- **One line height per size in rem, shared by both languages** (`globals.css:259-268`):
  - `text-xs` 20, `sm` 22, `base` 26, `lg` 28, `xl` 30, `2xl` 36, `3xl` 42, `4xl` 50
  - Bangla enlarges only the letters: 14, 15, 17, 19, 21, 26, 32, 38px (`globals.css:272-282`).
- The reason is in the code: a ratio "is what made every page jump by a few pixels a line when the language changed" (`globals.css:255-258`). `apps/web/src/i18n/one-line-height.test.ts` keeps ratio utilities out.
- `text-xs` carries 346 uses and `text-sm` 574 (counted over `apps/web/src` and `packages/ui/src`). The 12/20 hint, label and figure caption is the most-seen outlier.

**How loose it is.** These figures are against the most common value in the row:

| Size | Most common | Systems' range | OpenFarm | Over the most common |
| ---- | ----------- | -------------- | -------- | -------------------- |
| 12   | 16          | 15–18          | 20       | +4px (+25%)          |
| 14   | 20          | 16–22          | 22       | +2px (+10%)          |
| 16   | 24          | 20–24          | 26       | +2px (+8%)           |
| 20   | 28          | 22–28          | 30       | +2px (+7%)           |
| 24   | 32          | 26–36          | 36       | +4px (+12%)          |

At 20px the excess is +6px (+25%) against Polaris, Atlassian and EUI's 24. At 24px it is +8px (+28%) against Atlassian, EUI and Grafana's 28. So the hint text and the titles read most "airy".

**How low a shared value can go for Bangla.** Measured from `noto-sans-bengali-bengali-wght-normal.woff2`, 1000 units to the em, with fontTools bounds:

- **Ink extents.**
  - Top: `ি` reaches +0.896em, `ী` +0.907 and `ৌ` +0.912.
  - Bottom: `ু` reaches −0.228em, `ৃ` −0.271, and the conjunct ল্গু −0.351.
  - So everyday lines need 1.18em between baselines to keep ink from touching, and lines with a conjunct carrying a below mark need 1.26em.
  - The overridden content box is 1.305em (`ascent-override: 101%`, `descent-override: 29.5%`, `globals.css:24-25`).
- **No source gives a comfortable Bangla line height.** W3C's Bengali layout requirements leave "Baselines, line height" as an open question ([beng-lreq §8.4](https://www.w3.org/TR/beng-lreq/)). Material 2's "tall scripts" page could not be read.

| Token  | Now | Proposed (shared) | English | Bangla size | Bangla ratio | Bangla ink, everyday / conjunct |
| ------ | --- | ----------------- | ------- | ----------- | ------------ | ------------------------------- |
| `xs`   | 20  | **18** (1.125rem) | 1.50    | 14          | 1.29         | 16.6 / 17.6                     |
| `sm`   | 22  | **22** (keep)     | 1.57    | 15          | 1.47         | 17.7 / 18.9                     |
| `base` | 26  | **24** (1.5rem)   | 1.50    | 17          | 1.41         | 20.1 / 21.4                     |
| `lg`   | 28  | **26** (1.625rem) | 1.44    | 19          | 1.37         | 22.5 / 23.9                     |
| `xl`   | 30  | **28** (1.75rem)  | 1.40    | 21          | 1.33         | 24.8 / 26.5                     |
| `2xl`  | 36  | **34** (2.125rem) | 1.42    | 26          | 1.31         | 30.8 / 32.8                     |
| `3xl`  | 42  | **40** (2.5rem)   | 1.33    | 32          | 1.25         | 37.9 / 40.3                     |

- **On every proposed row, no two lines' ink meets on an everyday line.**
- **`sm` stays at 22.**
  - 14/22 is Grafana's exact body. The table rows (`p-2` plus the line, about 38px) and every 14px paragraph keep their height.
  - 20 would leave Bangla 15px lines only 1.1px clear where a conjunct sits under an `ৌ`. Only a look at two-line Bangla in the browser can settle that.
- **`2xl` at 34, not 32.** At 32, a two-line Bangla page title could touch on a conjunct line.

**The trade-off of giving English its own values.** English could take the standard 16, 20, 24, 28, 28, 32 and 36, with Bangla keeping today's.

- Every line would then be 2–6px shorter in English, so a page would move when the language changes.
- That is the jump the shared scale was made to stop (`globals.css:255-258`).

The shared, tightened scale gets English to within 2px of the systems everywhere but `sm`, and keeps the no-jump rule. This note recommends it.

## 4. Capitalizing product and domain nouns

**What the sources say.**

- **Microsoft.**
  - "Microsoft style uses sentence-style capitalization. That means everything is lowercase except the first word and proper nouns" (`capitalization.md`).
  - "If there's more than one of a thing, it's a common noun… Most technology concepts, product categories, devices, and features are common nouns, not proper nouns… Default to lowercase unless there's a compelling reason to capitalize the term" (`grammar/nouns-pronouns.md`, "Capitalization and proper nouns").
  - Titles of people are capitalized only as part of a name: "There's only one _Latasha Sharp, Chief Operating Officer_".
- **Google.**
  - "Don't use unnecessary capitalization". "Don't rely on a difference in capitalization to convey meaning. For example, although people who are familiar with Kubernetes probably understand that a capitalized Pod is a Kubernetes unit, and a lowercase pod is any other kind of pod, that distinction is likely lost on many casual readers" ([Capitalization](https://developers.google.com/style/capitalization)).
  - "Use lowercase for glossary and index terms unless the term is a proper noun" (same page, "Capitalization in glossaries and indexes").
  - "In general, feature names are lowercase… don't capitalize it unless the name is officially capitalized" ([Product names](https://developers.google.com/style/product-names), "Feature names").
  - The same page does allow a community's own capitals in its context: "A Job creates one or more Pods".
- **Polaris.**
  - Use sentence case for headings, buttons and card titles: "Create purchase order", not "Create Purchase Order".
  - "Use lowercase for: Features or product terms not unique to Shopify; Job titles without a name associated with them": "blogs, navigation, admin, page", and "The content strategist designed this" (`grammar-and-mechanics.mdx`, "Capitalization").
  - "Avoid capitalizing descriptive feature names." A default feature, such as "fraud analysis", stays lowercase, and only a branded, opt-in product, such as "Shopify Capital", is capitalized (`naming.mdx`).
  - A page's name may be capitalized in steps: "Go to the Products page".
- **Atlassian.** "Use sentence case in all titles, headings, menu items, labels, and buttons. Capitalize proper nouns…": "Create work item", not "Create Work Item". Its example "Ask your admin to add you" lowercases the role ([Language and grammar](https://atlassian.design/foundations/content/language-and-grammar), "Capitalization").
- **Apple.** "Adopt capitalization rules that align with your app's style, then apply them consistently… Choose a style for each UI element type and use it consistently" ([HIG Writing](https://developer.apple.com/design/human-interface-guidelines/writing)).

**What OpenFarm does.**

- The glossary capitalizes its terms (`CONTEXT.md`), and en.ts carries them into the UI. These counts are approximate: a regex over the string values, where "mid" means after a lowercase word or punctuation.

| Term       | Capitalized (mid-sentence) | Lowercase | Kind of noun                                         |
| ---------- | -------------------------- | --------- | ---------------------------------------------------- |
| Venture    | 231 (188)                  | 30        | common: there are many                               |
| Investor   | 122 (97)                   | 14        | common: a role, many people                          |
| Unit       | 90 (28)                    | 44        | common                                               |
| Agreement  | 69 (57)                    | 15        | common in the UI; a defined term in the papers       |
| Farm       | 54 (37)                    | 311       | common, and the lowercase spelling already dominates |
| Pen        | 50 (33)                    | 96        | common, used both ways                               |
| Vet        | 46 (36)                    | 13        | job title without a name                             |
| Owner      | 41 (39)                    | 2         | job title without a name                             |
| Manager    | 25 (23)                    | 2         | job title without a name                             |
| Ration     | 19 (9)                     | 43        | common                                               |
| Season     | 18 (15)                    | 0         | common                                               |
| Version    | 16 (5)                     | 24        | common                                               |
| Lot        | 16 (10)                    | 14        | common                                               |
| Playbook   | 14 (7)                     | 0         | a unique, named collection                           |
| Float      | 11 (10)                    | 6         | common                                               |
| Tag Number | 10 (7)                     | 2         | common: every animal has one                         |
| Step       | 7 (0)                      | 18        | common                                               |
| Shed Phone | 5 (2)                      | 1         | a named mode of the app                              |

- **494 of 4,487 strings** have at least one capitalized term mid-sentence.
- **65 short labels** capitalize a noun after a lowercase word: "Open a Venture", "Draw a Float", "Count the Float home", "Sign an Agreement", "How Investors pay", "Each Unit is paid".
- **Where they are.** 124 of the 494 are in Investor-facing or paper namespaces (`portal.*`, `agreeInApp.*`, `statements.*`, `projection.*`, `templates.*` and the like). The other 380 are staff screens: `ventures.*` 88, `refusal.*` 57, `returns.*` 22 and `params.*` 21.
- **The app is inconsistent with itself.** "Pen" and "pen", "Version" and "version", and "Farm" and "farm" all appear with no rule between them. For example, `plan.version` "Version {version}, {day}" sits beside `plan.measuredAgainst` "…baseline, version {version}."

**Applies here as:** English UI strings use sentence case, with **common nouns lowercase**, as every guide says.

- **Lowercase:**
  - The things the farm has many of: venture, investor, unit, pen, ration, season, lot, float, version, step, side, tag number, farm.
  - Roles without a name: owner, manager, vet, barn staff. This follows Polaris's "Job titles without a name associated with them" and Microsoft's "more than one of a thing". Atlassian's own example writes "Ask your admin".
- **Keep the capitals on proper names:**
  - **OpenFarm.**
  - **The named parts of the product that exist once:** the **Playbook**, the **Shed Phone**, the **Investor Portal**. This is Polaris's "Product names unique to Shopify" and Google's "officially capitalized" feature.
  - **A page named as a destination,** matching its menu label ("Go to Ventures"). This is Polaris's "Go to the Products page".
- **Leave the Investor papers and the adviser-approved wording alone until the Owner asks the advisers.**
  - That means the paper templates, `statements.*` and `agreeInApp.*`, and the portal wording that was approved.
  - In a contract, "the Investor", "the Farm" and "the Agreement" are defined terms, and capitals are how a contract marks them.
  - The portal's 64 strings are UI, but their wording was approved as built (2026-09-26). A casing change there is the Owner's to put to the advisers.
- **`CONTEXT.md` and code keep their capitals.** They are the team's ubiquitous language, not UI text, and Google's glossary rule is about published documents.
- **Bangla is untouched.** It has no case.

## 5. Body size, and page and section titles

**What the sources say.**

- **Body.**
  - Carbon's productive set "uses a base type size of 14px" ([Type sets](https://carbondesignsystem.com/elements/typography/type-sets/)).
  - Fluent Body 1 is 14/20.
  - Atlassian body is 14/20 (`--ds-font-body`).
  - EUI's body is the `s` scale, 14px.
  - Grafana's `fontSize = 14`.
  - GitLab: "font.size.300 14px … body text, input labels, help text" ([type fundamentals](https://design.gitlab.com/product-foundations/type-fundamentals)).
  - Material body-medium is 14/20 (body-large is 16/24).
  - Polaris body-md is 13/20.
  - macOS Body is 13/16.
- **Page title.**
  - Atlassian's page header: `--ds-font-heading-large`, 24/28, weight 653, `letter-spacing: normal` (`@atlaskit/page-header` `title.compiled.css`).
  - Polaris's page title: `variant="headingLg" fontWeight="bold"`, 20/24 at 700 (`polaris-react/src/components/Page/components/Header/components/Title/Title.tsx:41`).
  - Fluent Title 3 is 24/32 semibold.
  - GitLab level-1 headings are 24px (up to 30 by viewport) at 600.
  - Grafana xl is 24/28.
- **Section and card title.**
  - Fluent Subtitle 2 is 16/22 semibold.
  - Atlassian heading-small is 16/20 at 653.
  - Carbon heading-02 is 16/24 (`productiveHeading02` 16/22) semibold.
  - Polaris heading-md is 14/20 at 650.
  - Grafana h5 is 16/22.
- **Weights.** GitLab says "two weights are used by default: 400 and 600". EUI's bold is 600, Polaris's semibold 650, and Atlassian's bold 653.

**What OpenFarm does.**

- **Body.** Components set `text-sm`, 14/22: table, label, tabs, button (`packages/ui/src/components/{table,label,tabs,button}.tsx`). The `body` element itself is 16/26 (`globals.css:287-288`, the Tailwind default size).
- **Page title.** `text-xl md:text-2xl font-semibold tracking-tight`, which is 24/36 at 600 on a desk (`page.tsx:141`).
- **Page description.** `text-sm md:text-base`, which is **16/26 on a desk** (`page.tsx:147`).
- **Section title.** `text-base font-semibold tracking-tight`, 16/26 at 600 (`page.tsx:56`). The card title is the same (`card.tsx:40`).

**Applies here as:**

- **Size and weight need no change.** 14px body, a 24px/600 page title and a 16px/600 section title all sit inside the range. What makes them look off is their 36px and 26px line heights and their extra tracking (sections 2 and 3).
- **The page description could stay `text-sm` on a desk.** Polaris's page subtitle is `bodySm`, and no system sets a page description larger than its body. Today it is the only 16px running text on a desk page.

---

## Recommendations, ranked

**Must**

1. **Lowercase common nouns in the English staff screens.** This means the 380 strings outside the Investor and paper namespaces (§4), plus a test that keeps a fixed list of words (venture, investor, unit, pen, farm, owner, manager, vet, tag number…) from appearing capitalized mid-sentence in `en.ts`.
   - Keep: OpenFarm, Playbook, Shed Phone, Investor Portal, and page names used as destinations.
   - This is the change every guide asks for. It also ends the app's own inconsistency.
2. **Delete `font-feature-settings: "cv11", "ss01"`** (`globals.css:292`). It does nothing today, and it would turn on a single-story "a" and open digits if the font were ever swapped (§1).

**Should**

3. **Tighten the shared line heights:** `xs` 1.125rem, `base` 1.5rem, `lg` 1.625rem, `xl` 1.75rem, `2xl` 2.125rem, `3xl` 2.5rem, with `sm` kept at 1.375rem (`globals.css:260-266`, §3).
   - Check, at 1440 and 375, in bn and en: a two-line Bangla hint, a two-line Bangla page title, and the figure tiles.
4. **Give Inter titles their display design and drop `tracking-tight`.**
   - Import `@fontsource-variable/inter/opsz.css` (about +25 KB) and remove `tracking-tight` from `SECTION_TITLE`, the page title, the figures and the card title.
   - If the opsz file is not wanted, use the per-size `--text-*--letter-spacing` values from §2 instead, set to `normal` under `html:lang(bn)`.
5. **Take the Investor-facing casing to the advisers.** That is `portal.*`, `agreeInApp.*`, `projection.*`, and the papers if they agree. Until they answer, those 124 strings keep their capitals.

**Could**

6. **The page description at `text-sm` on a desk** (`page.tsx:147`).
7. **Disambiguated `l`/`I`/`1` for Tag Numbers** through `cv05`, as GitLab does. It needs a full Inter build, not fontsource's Google build.
8. **Revisit `sm` at 1.25rem (14/20)** once two-line Bangla at 15px has been looked at in the browser.

## What could not be confirmed

- **Whether opsz supersedes dynamic metrics.** Inter's documents were not found saying so. The −0.020em per character at opsz 24 is a measurement made here.
- **Linear's settings** come from its marketing site's production CSS. Linear publishes no design system.
- **Vercel's Inter-era settings** (before Geist) were not found in any primary source.
- **Supabase's typeface** was not confirmed. Only its commented-out feature line was read.
- **Polaris may set font features outside the repo paths searched.** None were found in `Shopify/polaris`.
- **Fluent's Subtitle 1** is 20/26 on the design site and 28px in the tokens. The tokens are used here. The desktop note's "Subtitle 1 20/26" (`desktop-enterprise-design.md` §4) follows the site.
- **Material 2's "tall scripts" line-height guidance** could not be read; the page renders in script only. No primary source gives a recommended Bangla line height.
- **The string counts are regex counts.** A few lowercase hits are other senses ("both sides", "a lot").
- **Nothing here was measured in a browser.** The Bangla margins are glyph-bounds arithmetic. Shaping can stack marks a little differently.
