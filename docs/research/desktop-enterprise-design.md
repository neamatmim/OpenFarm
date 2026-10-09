# Does OpenFarm look and work like an enterprise desktop application?

**Question:** The Owner asked us to "make sure the design is following the enterprise standard, also priority on desktop". OpenFarm was built phone-first for Barn Staff. The Owner and the Farm Managers do their office work in it: money, Ventures, Investors, reports and settings. They want that work to feel like a professional desktop application. Shed work still has to work on a phone: the day's work on `/work`, a Step being worked (where Milk Records are taken), and the Shed Phone screen. Do the enterprise design systems agree with how the app is built, at desktop widths first? What should change, and in what order?

**Researched:** 3 October 2026. Code read at `d19e6d0c` on main.

**Sources.** The primary sources are the design systems' own documents:

- IBM Carbon. Read from the Markdown source of carbondesignsystem.com, and from the `carbon` code where the site gives no number.
- Microsoft Fluent 2. Its pages are rendered on the server and were read directly. Some values exist only in the `microsoft/fluentui` source.
- Atlassian. Read through a summarizing fetch, so treat its quotes as near-verbatim.
- Shopify Polaris. The guidance was read from the docs' own `.mdx` source on GitHub, and the newer pages from shopify.dev.
- SAP Fiori for web, versioned pages (`v1-151`, and `v1-136` for breakpoints).
- WCAG 2.2 and its Understanding documents, verbatim.

Where a figure came from a system's code and not from its guidance, the note says **[from code]**. Material 3's own site (m3.material.io) could not be read. Its window size classes are quoted from Android's documentation, which follows it, and are marked **[via Android docs]**.

Each topic below says what the sources say, then what this note recommends. **The recommendations are this note's, not the sources'.** Nothing here changes wording the advisers approved for the Investor papers or the portal.

**Widths used throughout.** The sidebar is 16rem, which is 256px (`packages/ui/src/components/sidebar.tsx:27`). A page is padded `md:px-8`, 32px each side (`apps/web/src/components/page.tsx:68`). With the sidebar open, that leaves this much room for content:

| Screen | Room for content |
| ------ | ---------------- |
| 1280px | 960px            |
| 1440px | 1120px           |
| 1920px | 1600px           |

---

## The answer, up front

The **frame** is already enterprise-grade at desktop width:

- a persistent 256px grouped side nav on a laptop, the same width as Carbon's left panel and close to Fluent's 260px Nav;
- an icon rail on a tablet, and a drawer plus bottom bar on a phone, which is the progression Material and Carbon describe;
- a 14px body type ramp that matches Carbon's productive set, Fluent and Atlassian;
- page headers with the primary action at top right, as Polaris and Fiori place it;
- sortable tables with figures right-aligned;
- forms that are short in a dialog and longer in a side sheet, as Carbon divides them;
- empty states that say why, failures that offer to try again, a skip link, and scroll padding under the pinned bar.

What is still phone-first is **inside some pages**:

- Record pages (an Animal, a Venture) are long single columns, where Polaris and Fiori lay a record out in two columns with key figures in its header.
- Several money and returns lists are cards or plain rows where the systems use a table.
- Some long forms are squeezed into the narrow 512px sheet.
- Long tables have no sticky header, which Fiori requires.
- The Ventures table hides two columns until 1536px.
- The tabs and back link keep their 44px phone height on a desk.

Two things fail the standards outright:

- **Input borders are 1.5:1 against the card.** WCAG 1.4.11 asks 3:1 when the border is what shows there is a box.
- **The app-wide "could not load, try again" toast vanishes after 4 seconds.** It takes its Retry button with it. Atlassian, Carbon and Polaris all say an error or a toast with an action must not go that fast.

None of this needs a redesign. It is about a dozen small changes, each of which can be merged on its own. They are listed in order at the end. The shed screens are left as they are.

---

## 1. Layout grid and maximum width

**What the sources say.**

- **Carbon.** The 2x Grid breakpoints are 320, 672, 1056, 1312 and 1584. Max is 1584px, with 16 columns and a 32px gutter ([2x Grid overview](https://carbondesignsystem.com/elements/2x-grid/overview/), "Breakpoints", "Gutters").
  - Its product model "anticipates a left-hand navigational panel, and keeps content within a maximum width", left-aligned. Its "high-density interface" model "uses the full width of the browser" ([2x Grid usage](https://carbondesignsystem.com/elements/2x-grid/usage/), "Style models").
  - With the left nav opened or closed, "the number of columns remains the same but responds fluidly" ("Left-hand navigation").
- **Atlassian.** Breakpoints are 1024–1439 (m), 1440–1767 (l) and 1768 and up (xl), with 32px margins from 1024. Fixed-wide "has a maximum width of 1296px (including margins). Use this as the default for most experiences". Fixed-narrow is 864px, for long-form content ([Atlassian grid](https://atlassian.design/foundations/grid), "Breakpoint table", "Fixed grid").
- **Polaris.** The default page is about 998px: a 662px main column, plus a 240–320px side column, plus a 16px gap. That figure is the sum of the CSS values. "Full width" is "for… wide tables or lists". "Narrow" is "if the page supports a single unified task" (Polaris `page.mdx`, "Best practices", and its CSS, [source](https://github.com/Shopify/polaris)).
- **Fiori.** "Letterboxing limits the width of the content area to 1280 px" ([Dynamic page](https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/page-layouts/dynamic-page-layout)).
- **Fluent.** Breakpoints are x-large 1024–1365, xx-large 1366–1919 and xxx-large 1920 and up, on a 12-column framework. No maximum width is given ([Fluent layout](https://fluent2.microsoft.design/layout), "Breakpoints").

**What OpenFarm does.**

- `Page` has no maximum width. Only `narrow` (`max-w-2xl`) caps it, and only a Step being worked uses it (`components/page.tsx:42-48`, `routes/_authenticated/work/$instanceId.tsx:322,341`).
- The `<main>` element has no cap either (`components/shell/app-shell.tsx:64-68`).
- The page header's description is capped at `max-w-2xl` (`page.tsx:142`). A Section's description is not (`page.tsx:204`).

**Applies here as:**

- **Full width is right for the list and table pages.** That is Carbon's high-density model and Polaris's full width for wide tables. Up to 1920 it already lands at about 1600px, which is Carbon's 1584.
- **Cap the frame at 1584px (99rem), left-aligned.** Only a screen wider than about 1900px notices.
- **Give settings and other form pages a narrower frame.** Atlassian's 864px and Polaris's settings template both do this. See section 8.

## 2. Navigation shell

**What the sources say.**

- **Carbon.**
  - The header is 48px, spans the full width, and is sticky or scrolls away ([UI shell header style](https://carbondesignsystem.com/components/UI-shell-header/style/), "Structure").
  - The left panel is 256px and fixed to the left edge. The selected item has a 4px border ([UI shell left panel style](https://carbondesignsystem.com/components/UI-shell-left-panel/style/)).
  - "Use the left panel if there are more than five secondary navigation items". For a third tier, "use tabs within the page" ([left panel usage](https://carbondesignsystem.com/components/UI-shell-left-panel/usage/), "Behavior").
  - **[from code]** The rail is 48px, and the side nav hides below 1056px.
- **Fluent Nav.** "By default, Nav is set to 260 pixels wide. At 640 pixels screen width, it becomes an overlay drawer". "Nav doesn't support an icon-only layout" ([Fluent Nav usage](https://fluent2.microsoft.design/components/web/react/core/nav/usage), "Reflow and overflow").
- **Material [via Android docs].**
  - Window classes are compact under 600, medium 600–839, expanded 840–1199, large 1200–1599 and extra-large 1600 and up. Large and extra-large "have been added to better target desktop" ([window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes)).
  - With few destinations, use a bottom bar on compact and a rail on medium and expanded. With many, use a drawer, persistent on expanded ([navigation for responsive UIs](https://developer.android.com/guide/topics/large-screens/navigation-for-responsive-uis)).
- **Breadcrumbs.**
  - Polaris: "Always provide breadcrumbs when a page has a parent page". In Polaris React this is the page's back action (`page.mdx`).
  - Fluent: "Don't use breadcrumbs alone", and keep them to 30–50% of the width ([Fluent breadcrumb](https://fluent2.microsoft.design/components/web/react/core/breadcrumb/usage)).
  - Fiori's object page header carries breadcrumbs ([Object page](https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/object-page)).

**What OpenFarm does.**

- A 16rem sidebar, open from 1024px (`app-shell.tsx:26`). It is down to a 3.5rem icon rail from 768px to 1023px (`sidebar.tsx:29`), and a drawer below 768px (`packages/ui/src/hooks/use-mobile.ts:3`).
- About 30 destinations in eight groups (`components/shell/navigation.ts:60-230`).
- A 56px sticky top bar with the menu button, sync state, language, theme and the person's menu (`components/shell/top-bar.tsx:14`).
- A bottom bar below 768px only (`components/shell/bottom-bar.tsx:26`, `md:hidden`).
- **Record pages have a `BackLink` named for the list they came from** (`page.tsx:100-107`). That is Polaris's back action. There is no breadcrumb component anywhere in `apps/web` or `packages/ui`.
- **The current page is marked in the sidebar only by a background,** `bg-sidebar-accent`. Against the sidebar that background is **1.29:1**, plus a medium weight (`components/shell/app-sidebar.tsx:83`).
- **Closing the sidebar on a laptop is forgotten on reload.** `useSidebarOpen` starts open and follows the screen (`app-shell.tsx:34-44`). The shadcn sidebar writes a `sidebar_state` cookie that nothing reads back (`sidebar.tsx:25,83`).
- ⌘/Ctrl+B toggles the sidebar (`sidebar.tsx:30,95-99`).

**Applies here as:**

- **Keep the shell.** The 1024 / 768 split is Carbon's, and the bar, rail and drawer progression is Material's.
- **Add a 3–4px bar on the current sidebar item,** as Carbon's selected border.
- **Remember a closed sidebar** on a laptop.
- Breadcrumbs are not needed beyond `BackLink`. The app's records are one level deep, and Fluent warns against breadcrumbs alone.

## 3. Density and control sizes

**What the sources say.**

- **Fiori.** Cozy is for touch and compact is for mouse and keyboard. "The default cozy touch area of 2.75 rem (44 px) is reduced in compact mode. Rows and toolbars can use sizes of 2 rem (32 px)". "Never combine 'cozy' and 'compact' modes within the same hierarchy or page" ([Cozy and compact](https://www.sap.com/design-system/fiori-design-web/v1-151/foundations/visual/cozy-compact), "Metrics").
- **Carbon.** Text inputs are sm 32, md 40 and lg 48. md "is the default size… When in doubt, use the medium size" ([Text input usage](https://carbondesignsystem.com/components/text-input/usage/)).
- **Fluent [from code].** Inputs are small 24, medium 32 and large 40, and medium is the default. Fluent's own guidance asks touch targets of 44×44 on mobile and web ([Fluent layout](https://fluent2.microsoft.design/layout), "Applying Fluent spacing").
- **WCAG 2.5.8 (AA).** A target is at least 24×24 CSS px, or spaced so a 24px circle around it touches no other target ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#target-size-minimum)).

**What OpenFarm does.**

- The app's own height rule (see the enterprise-look note) is phone 44px and desk 36px:
  - Button: `h-11 md:h-9` (`packages/ui/src/components/button.tsx:25`)
  - Input: `h-11 … md:h-9 md:text-sm` (`input.tsx:33`)
  - Native select: `page-kit.tsx:340`
  - Date inputs: `page.tsx:630,644`
- 36px sits between Fluent's 32 and Carbon's 40.
- Three things keep the phone height on a desk:
  - **`PageTabs` is `h-11`** with no desk size (`components/page-kit.tsx:251`). That is every tabbed page.
  - **`BackLink` is `min-h-11`** (`page.tsx:87`).
  - Some panel links on the Owner's overview are `min-h-11` (`components/home/farm-panels.tsx:337,403,421`).

**Applies here as:**

- **Keep 44/36.**
- **Give tabs and the back link their `md:` twin.** Fiori forbids mixing cozy and compact on one page, and today a 36px button sits beside a 44px tab row.
- Every desk size stays well above WCAG's 24px.

## 4. Type ramp

**What the sources say.**

- **Carbon.** "The productive type set uses a base type size of 14px"; productive is for when "users are focused on getting a specific job done" ([Type sets](https://carbondesignsystem.com/elements/typography/type-sets/); [Style strategies](https://carbondesignsystem.com/elements/typography/style-strategies/)). Headings are 14, 16, 20, 28, 32, 42 and 54 **[from code]**.
- **Fluent web.** Caption 12/16, Body 1 14/20, Subtitle 2 16/22 semibold, Subtitle 1 20/26, Title 3 24/32, Title 2 28/36 ([Fluent typography](https://fluent2.microsoft.design/typography), "Type ramp").
- **Atlassian.** Body 14/20 is the default in components; headings are 12 to 32 ([Atlassian typography](https://atlassian.design/foundations/typography)).

**What OpenFarm does.**

- Body text in components is `text-sm` (14px).
- The section title is `text-base font-semibold` (16px semibold, `page.tsx:51`), which is exactly Fluent's Subtitle 2.
- The page title is `text-xl md:text-2xl`, so 24px on a desk (`page.tsx:136`), which is Fluent's Title 3.
- Figures are `text-2xl md:text-3xl`, 30px (`page.tsx:292`).
- Line heights are slightly taller than Fluent's. `text-sm` is 22px, not 20 (`packages/ui/src/styles/globals.css:259-266`). That is on purpose: Bangla needs the room, and both languages share one line height so nothing moves when the language changes.

**Applies here as:** no change. The ramp is the productive ramp. Bangla's larger sizes (`globals.css:271-281`) are this app's own decision, and no system speaks to them.

## 5. Spacing

**What the sources say.**

- Carbon's scale is 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 and 160 ([Spacing](https://carbondesignsystem.com/elements/spacing/overview/)).
- Fluent's ramp is on "a base unit of four pixels" ([Fluent layout](https://fluent2.microsoft.design/layout), "Global spacing ramp").
- Atlassian's is "built around a base unit of 8 pixels" ([Atlassian spacing](https://atlassian.design/foundations/spacing)).
- Carbon puts 32px between fields on a dedicated form page, 16–24px in a contained form, and 48px before the buttons ([Forms pattern](https://carbondesignsystem.com/patterns/forms-pattern/), "Form context").

**What OpenFarm does.** It uses Tailwind's 4px steps:

- page gutter 32px and gap 32px between parts on a desk (`page.tsx:68`), which matches Atlassian's 32px margin from 1024;
- 20px inside a card (`page.tsx:186`);
- 20px between parts of a sheet's body (`page-kit.tsx:591`).

**Applies here as:** no change.

## 6. Page header and actions

**What the sources say.**

- **Polaris.** A page's single primary activity goes in its header "as a primary button", and other page actions are secondary actions there (`page.mdx`, "Best practices"). The newer page component says: "Include no more than one primary action and 3 secondary actions per page", and "Don't include any actions at the bottom of the page" ([s-page](https://shopify.dev/docs/api/app-home/polaris-web-components/structure/page)).
- **Atlassian.** The page header holds breadcrumbs, title, actions, and a search bar and filters. "Use one page header per page" ([Page header usage](https://atlassian.design/components/page-header/usage)).
- **Fiori.** In a list report, "Never place finalizing actions in the header toolbar" ([List report](https://www.sap.com/design-system/fiori-design-web/v1-151/page-types/floorplans/list-report-floorplan-sap-fiori-element)).

**What OpenFarm does.** `PageHeader` puts the title left and the actions right from 640px (`page.tsx:126,153-157`). Pages use it that way:

- Money: "By hand" (`routes/_authenticated/money/route.tsx:139-148`)
- Feed: "Record arrival" (`feed/route.tsx:171-182`)
- Milk: "Record dispatch" (`milk/route.tsx:117-128`)
- Sales: "Record sale" (`sales.tsx:137-146`)
- Ventures: Open, with Sell internally as the secondary (`ventures/index.tsx:164-182`)
- Investors (`investors/index.tsx:137-146`)
- People: Invite (`people/index.tsx:204-214`)
- SOPs: New (`sops/route.tsx:211-227`)

**Applies here as:** already the standard. Keep one primary and at most three secondaries, with the rest in the row menu.

## 7. Data tables

**What the sources say.**

- **Carbon.**
  - Rows are xs 24, sm 32, md 40, lg 48 and xl 64. The header row "should always match the row size of the table" ([Data table style](https://carbondesignsystem.com/components/data-table/style/), "Rows").
  - "Include up to five actions within the table toolbar". The batch-action bar "appears at the top of the table". Pagination is "always placed at the bottom". "Use skeleton states instead of spinners" ([Data table usage](https://carbondesignsystem.com/components/data-table/usage/)).
- **Fiori.** "The icon tab bar, table/chart toolbar, and column headers of all table types must be 'sticky'" (List report).
- **Polaris.**
  - An index table supports bulk actions, sorting, filtering and pagination. "Paginate when the current list contains more than 50 items". Numbers are right-aligned. Its examples have a sticky last column and a sticky scroll bar (`index-table.mdx`).
  - A data table is "Not to be used for an actionable list of items that link to details pages" (`data-table.mdx`).
- **Fluent [from code].** Rows are medium 44, small 34 and extra-small 24. "Set a `min-width`" (react-table docs).
- **WCAG 1.4.10.** Data tables are exempt from reflow. They "have a two-dimensional relationship" ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), "Tabular data").

**What OpenFarm does.**

- **One `DataTable` for every list** (`components/data-table.tsx:190-305`). It has sortable headings with `aria-sort` (`:96-133`, `:250`), figures right-aligned with tabular numbers (`:280`), a pager at the bottom (`:294-302`), and a card list below 768px when the page gives one (`:224-237`).
- **Sizes.** A row is about 38px: `p-2` plus a 22px line (`packages/ui/src/components/table.tsx`). The header row is 40px. Both are Carbon's md.
- **No sticky header** anywhere. The only sticky cell is the Ventures acts column (`components/ventures/ventures-table.tsx:289`).
- **No row selection or batch actions.**
- **The Ventures table hides People and Animals below 1536px** (`hidden … 2xl:table-cell`, `ventures-table.tsx:263,272`). At 1280 and 1440, which are the Owner's likely laptop widths, those two columns are not there.
- **The monthly report's month table has `minWidth="72rem"`,** 1152px (`components/months/by-month.tsx:460`). It scrolls sideways at 1280 and 1440, and nothing stays put while it does.
- **Some lists are cards or plain rows,** although each row is a record with several figures:
  - Returns: seasons and Ventures as `<details>` cards (`components/returns/returns-page.tsx:83,349`); missing prices as cards (`:409-411`); the dairy herd, head prices and animals to price as rows (`components/returns/dairy-returns.tsx:226,395,515`).
  - Receivables: one lone tile and then one card per buyer (`components/money/receivable-tab.tsx:283-298`).
  - Cash in hand: one full-width list of people and floats (`components/money/cash-tab.tsx:610-657`).
  - Wage draws: a nested list per person (`components/money/wage-draws.tsx:239-268`).
  - Giving less: queue rows carrying tag, lately, usually, drop and pen (`components/giving-less.tsx:27-60`).
  - Ventures against plan on the monthly report (`by-month.tsx:538`).
- **While a list loads, `Loaded` draws one 80px gray block** (`page.tsx:504-505`).

**Applies here as:**

- **Sticky column headings on long tables.** Fiori says must; we say should.
- **Show the Ventures table's People and Animals from 1280px.** Let the acts column stay pinned while the table scrolls.
- **Pin the first column** of the month table.
- **Move the card-shaped money and returns lists onto `DataTable`.** It keeps their phone cards.
- **A table-shaped skeleton** for table pages.
- **Batch actions only where the Owner names a job done to many rows at once** (open question 3).

## 8. Forms and long edits: dialog, sheet, or page

**What the sources say.**

- **Carbon.** Use a dialog "for critical, infrequent requests… less than five inputs". Use a side panel "when dealing with more than five inputs". Use a dedicated page "for more complex, lengthier or multistep" forms. "Carbon generally recommends single-column forms", with two or three related inputs on one line. "The field widths should reflect the intended length of the content" ([Forms pattern](https://carbondesignsystem.com/patterns/forms-pattern/), "Variants", "Columns", "Text inputs"). "A modal is not an alternative to page" ([Dialog pattern](https://carbondesignsystem.com/patterns/dialog-pattern/)).
- **Fluent.**
  - The drawer's sizes are small, medium, large and full, and small is the default. **[from code]** They are 320, 592 and 940px.
  - "Prolonged flows" should be "kept to two to three steps… For longer or more complex tasks… consider a more focused surface" ([Fluent drawer](https://fluent2.microsoft.design/components/web/react/core/drawer/usage)).
  - "If dialog forms are too long, people may forget the context" ([Fluent dialog](https://fluent2.microsoft.design/components/web/react/core/dialog/usage)).
- **Fiori.** "Use a dialog to create when there are fewer than 8 required fields" (List report). Forms run 1, 2, 3 and 4 columns at S, M, L and XL, with labels on top (Object page).
- **Polaris.**
  - "Annotated" layout sections are for settings pages only (`layout.mdx`).
  - The Settings template is a small width with grouped sections and a save bar ([App Home patterns](https://shopify.dev/docs/api/app-home/latest/patterns)).

**What OpenFarm does.**

- **Three shapes.**
  - `FormDialog` for a short form (`page-kit.tsx:619`).
  - `FormSheet`, 512px (`sm:max-w-lg`), or 768px (`sm:max-w-3xl`) when `wide`, with the actions pinned at its foot (`page-kit.tsx:525-616`).
  - A full page for the SOP editor (`sops/route.tsx:191-206`).
- **Labels are on top, and form grids go two columns from 640px** (`page-kit.tsx:722-765`).
- **Nine of the 42 `FormSheet`s are wide,** and they are the right ones: money entry, sale, receive feed, buy medicine, investor, nomination, open Venture, sign agreement and internal sale.
- **Long forms still in the 512px sheet:**
  - **The Venture Plan editor.** It is a list of plan lines, each a `grid-cols-6` row, plus a totals grid (`components/ventures/venture-plan.tsx:257,380,570`). At 512px a six-column row is about 75px a column.
  - The amend sheet, about 18 inputs (`components/ventures/amend-sheet.tsx:283`).
  - Take capital, about 12 (`take-capital-sheet.tsx:163`).
  - Reimburse, about 10 (`reimburse-sheet.tsx:269`).
  - Milk dispatch, about 10 (`components/milk/dispatch-sheet.tsx:140`).
  - Invite a person, about 12 controls (`components/people/invite-sheet.tsx:141`).
  - The ration editor is a 512px **dialog** with an item list that scrolls inside it at `max-h-80` (`components/feed/feed-rations.tsx:256,311`).
- **Settings pages.**
  - `/settings` is two thin cards across the full width (`routes/_authenticated/settings.tsx:226-233`).
  - `/farm` already has an "on this page" rail (`farm.tsx:248,302`). Its two-column field grids have no cap, so at 1920 each field is about 700px wide (`farm.tsx:88,159`; `components/farm-parameters.tsx:852`).

**Applies here as:**

- **More than about eight fields means a `wide` sheet.**
- **The Venture Plan editor needs a larger surface.** Either a full-width sheet (Fluent's "large", 940px) or a page of its own, as the SOP editor has.
- **The ration editor moves from a dialog to a wide sheet.**
- **Settings take a narrower frame and Polaris's annotated sections:** the title and why on the left third, the fields on the right.

## 9. Record pages: Animal, Venture, Investor, person

**What the sources say.**

- **Fiori's object page.**
  - Its header holds breadcrumbs, title, subtitle, header facets ("form: at most 5 label-value pairs"; key values "to highlight important data or KPIs") and the global actions.
  - Navigation is an anchor bar by default, or tabs "if your object page covers different topics that each have complex content".
  - Edit and create get a footer toolbar that "remains sticky".
  - (Object page.)
- **Fiori's dynamic page header** collapses on scroll, and its actions stay usable while collapsed (Dynamic page).
- **Polaris.** "2/3 + 1/3 layout on detail pages", with the main information in the wide column and context in the narrow one (`layout.mdx`). The Details template is a "dual-column layout… supporting information visible in the sidebar" (App Home patterns).

**What OpenFarm does.**

- **The Investor's page is the model.**
  - Its header has a mark (initials), badges and phone as meta, and the acts top-right (`routes/_authenticated/investors/$investorId/route.tsx:134-165`).
  - Figures come straight under it (`:168`), then tabs.
  - The overview is two-thirds plus one-third (`components/investors/investor-profile.tsx:351-352`).
- **The Animal's page** has the photo as the header's mark (`components/animal/animal-profile.tsx`). Every tab is a single column of full-width parts at every width: overview, health, weight and moves, breeding, money and papers (`components/animal/overview-tab.tsx:586`, `health-tab.tsx:371`, `weight-moves-tab.tsx:108`, `breeding-tab.tsx:267`, `money-papers-tab.tsx:445`). Only the "About" facts spread out, `lg:grid-cols-4` (`overview-tab.tsx:351`).
- **The Venture's page** has its acts top-right (`ventures/$ventureId/route.tsx:193-204`). Its figures come after the stage track (`:205-212`). Its overview is mostly one column of six or seven panels; only Money and Terms sit side by side (`components/ventures/venture-overview.tsx:190,198-216`).
- **A person's page** has no figures and no mark in its header (`routes/_authenticated/people/$userId.tsx:84-112`). Its access tab is one column (`components/people/person-access.tsx:740-761`).

**Applies here as:**

- **Lay out the Animal and Venture overviews as the Investor's is:** two-thirds plus one-third from 1024px, with facts, figures and side panels in the narrow column. Below 1024px they stack exactly as today.
- **Give a person's header the same mark-and-meta** the Investor's has.
- Tabs, not an anchor bar, are right here. Fiori's own condition holds: each tab is a topic with complex content.

## 10. Empty, loading and error states

**What the sources say.**

- **Carbon.** An empty state has a title, a body, a primary action and a secondary link. It comes in three kinds: no data, no results, error ([Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/)). Skeletons are only for containers and data components ([Loading](https://carbondesignsystem.com/patterns/loading-pattern/)).
- **Atlassian.** "Include an action or link to help people understand what to do next" ([Empty state](https://atlassian.design/components/empty-state/usage)).
- **Polaris.** "Use only one primary call-to-action button" (`empty-state.mdx`).
- **Fiori's empty-table texts:** "To start, set the relevant filters." and "No data found. Try adjusting the filter settings." (List report).

**What OpenFarm does.**

- `EmptyState` has an icon, a title, a description and an action, with `bare` and `compact` variants (`page.tsx:331-379`).
- `Loaded` says "could not load" with a retry, and keeps what the phone last had under a warning (`page.tsx:483-522`).

**Applies here as:** already the standard. The only gap is the table-shaped skeleton (section 7).

## 11. Feedback: toasts, banners, notices

**What the sources say.**

- **Carbon.** Inline notifications sit "at the top of the primary content area" and "do not dismiss automatically". Toasts go top right. An actionable toast "should remain on screen until the user dismisses it". Toasts are "best used with system-generated messages" ([Notification usage](https://carbondesignsystem.com/components/notification/usage/); [Notification pattern](https://carbondesignsystem.com/patterns/notification-pattern/)).
- **Fluent.** Toasts go "usually the top-right or bottom-right", and "Don't use toasts for necessary actions" ([Fluent toast](https://fluent2.microsoft.design/components/web/react/core/toast/usage)). A warning or error message bar "must include a button, link, or both" ([Fluent message bar](https://fluent2.microsoft.design/components/web/react/core/messagebar/usage)).
- **Atlassian.** "Never use auto dismiss flags for any critical warning or error messages" ([Flag](https://atlassian.design/components/flag/usage)).
- **Polaris.** "Avoid using toast for error messages". A toast with an action needs at least 10,000 ms. A toast should "Not go over 3 words" (`toast.mdx`).

**What OpenFarm does.**

- Sonner sits at **top center** (`routes/__root.tsx:91`). About 140 success toasts and 20 error toasts use it.
- **The app-wide query failure is a toast with a Retry action** (`utils/orpc.ts:59-71`). It sets no duration, so Sonner's default of 4,000 ms applies (`TOAST_LIFETIME` in sonner 2.0.8). Retry is gone in 4 seconds.
- In-page problems use `Notice`, colored, with an icon, the word and `role="alert"`, which is the standard inline notification (`page.tsx:445-477`).

**Applies here as:**

- **Error toasts, and toasts with an action, stay until dismissed.** This is a must.
- **On a desk, toasts go top right, under the bar.** On a phone they stay top center.
- Success toasts are fine as they are.

## 12. Keyboard and focus

**What the sources say.**

- WCAG 2.1.1: "All functionality… operable through a keyboard interface".
- WCAG 2.4.7: the "keyboard focus indicator is visible".
- WCAG 2.4.11: focus is "not entirely hidden due to author-created content". The Understanding document names "sticky footers, sticky headers", and scroll padding as the fix (technique C43) ([WCAG 2.2](https://www.w3.org/TR/WCAG22/); [Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
- WCAG 2.4.13 (AAA, not required): a 2px perimeter at 3:1.
- Fluent's focus outline is 2px **[from code]**.

**What OpenFarm does.**

- **The basics are there:**
  - a skip link first on every route (`routes/__root.tsx:166-176`);
  - `<main id="main" tabIndex={-1}>` (`app-shell.tsx:64-70`);
  - `scroll-padding-top` under the pinned bar, and `scroll-padding-bottom` over the phone's bar (`globals.css:241-252`);
  - real `<form>`s, so Enter submits (`page-kit.tsx:586-616`);
  - arrow keys on SideTabs.
- **There are no shortcuts beyond ⌘/Ctrl+B, and no search box for jumping to a record.**
- **The focus ring.** Inputs and buttons draw a 1px `border-ring` at 4.6:1 and a 3px halo at 50% opacity, about 2:1 (`button.tsx:7`, `input.tsx:33`). That passes 2.4.7 and 1.4.11 through the border, but the halo itself is faint.

**Applies here as:**

- **Passes.** Two optional changes:
  - a full-strength 2px ring, which meets the AAA level the systems draw at;
  - a "go to Tag Number" box in the top bar, if the Owner wants one (open question 4).
- **A sticky table header (section 7) must sit under the 56px bar,** or 2.4.11 fails again.

## 13. Accessibility at desktop

**What the sources say.**

- WCAG 1.4.3: text contrast at least 4.5:1.
- WCAG 1.4.4: text can be resized to 200%.
- WCAG 1.4.10: reflow at 320 CSS px, "equivalent to a starting viewport width of 1280 CSS pixels wide at 400% zoom".
- **WCAG 1.4.11:** UI components need 3:1. The Understanding document's "Text input" section says: "Where a text-input has an indicator such as a complete border… that indicator must meet 3:1". A failing example is an input with a light border, "As the border here is required to identify the presence of the input" ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

**What OpenFarm does.** These ratios were computed from the tokens:

- **`--input` is `oklch(0.86 0.006 165)`** (`globals.css:96`). That is **1.53:1 on a white card** and about 1.4:1 on the page ground. The inputs are `bg-card` on `bg-card` inside every Section, so the border is all that shows there is a box.
- In dark mode, `--input` is `white / 16%` (`globals.css:149`). That is **1.63:1**.
- Text passes everywhere checked: muted text is 7.1:1 on a card and 6.6:1 on the ground, and body text is 15:1.
- Reflow at 1280 and 400% is the phone layout, which the app already has. Tables are exempt.

**Applies here as:**

- **Must:**
  - light `--input` to `oklch(0.62 0.006 165)`: 3.6:1 on a card, 3.4:1 on the ground, 3.2:1 on `muted`;
  - dark `--input` to `white / 40%`: 3.8:1.
- **This darkens outline buttons too,** since they share `border-input`. That is acceptable: Carbon's and Fluent's outline buttons carry strong borders.

---

## Audit table

Paths are under `apps/web/src/` unless they start `packages/`. "Cited" points to the section above where the standard is quoted.

| #   | Where                                                                                                                                                                                                                                           | What it does now                                                                                          | What the standard says                                                                                                              | Severity | The fix                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/ui/src/styles/globals.css:96`, `:149`                                                                                                                                                                                                 | Input border 1.53:1 light, 1.63:1 dark                                                                    | WCAG 1.4.11: an input's border "must meet 3:1" (§13)                                                                                | **must** | `--input: oklch(0.62 0.006 165)`; dark `oklch(1 0 0 / 40%)`. Look at outline buttons after.                                                                                                                                                     |
| 2   | `utils/orpc.ts:59-71`; `routes/__root.tsx:91`                                                                                                                                                                                                   | "Could not load" toast with Retry vanishes after 4 s                                                      | Carbon: an actionable toast stays until dismissed. Atlassian: never auto-dismiss errors. Polaris: 10 s or more with an action (§11) | **must** | `duration: Number.POSITIVE_INFINITY` on that toast and on every `toast.error`/toast with `action`. Or a default in `Toaster` `toastOptions` for `error`.                                                                                        |
| 3   | `components/page-kit.tsx:251` (PageTabs), `components/page.tsx:87` (BackLink), `components/home/farm-panels.tsx:337,403,421`                                                                                                                    | 44px on a desk beside 36px buttons                                                                        | Fiori: never mix cozy and compact on one page (§3); the app's own `h-11 md:h-9` rule                                                | should   | `h-11 md:h-9` on the TabsList; `min-h-11 md:min-h-9` on BackLink and the panel links. Check BackLink's `-mb-6` offset still lines up.                                                                                                           |
| 4   | `components/data-table.tsx:233-293`                                                                                                                                                                                                             | No sticky column headings; long lists (herd, money register, audit, people) lose their headings on scroll | Fiori: "column headers of all table types must be 'sticky'" (§7)                                                                    | should   | For tables with `pageSize`, on `md:` give the wrapper `max-h-[calc(100dvh-10rem)] overflow-auto` and the `<thead>` `sticky top-0 z-10 bg-card`. (A sticky head inside today's `overflow-x-auto` wrapper sticks to the wrapper, not the window.) |
| 5   | `components/ventures/ventures-table.tsx:263,272`                                                                                                                                                                                                | People and Animals hidden below 1536px                                                                    | Carbon: content scales fluidly. Polaris: sticky column plus scroll for a wide index table (§7)                                      | should   | Make it `hidden xl:table-cell`. At 1280–1535 the table scrolls under the sticky acts column already at `:289`. Measure `scrollWidth` at 1280/1440 in both languages.                                                                            |
| 6   | `components/months/by-month.tsx:460`                                                                                                                                                                                                            | 72rem table scrolls at 1280/1440 with nothing pinned                                                      | Polaris sticky column; WCAG allows tables to scroll (§7)                                                                            | should   | Pin the month column: `sticky left-0 bg-card` through a column `meta.className`.                                                                                                                                                                |
| 7   | `components/ventures/venture-plan.tsx:570`                                                                                                                                                                                                      | Plan editor (rows of six) in a 512px sheet                                                                | Carbon: a dedicated page for "complex, lengthier" forms. Fluent: "a more focused surface" (§8)                                      | should   | Add a `size="full"` to `FormSheet` (`sm:max-w-5xl`, about 1024px, close to Fluent "large"), or a page route like the SOP editor. Owner's call is not needed.                                                                                    |
| 8   | `ventures/amend-sheet.tsx:283`, `take-capital-sheet.tsx:163`, `reimburse-sheet.tsx:269`, `milk/dispatch-sheet.tsx:140`, `people/invite-sheet.tsx:141`                                                                                           | 10–18 inputs in the 512px sheet                                                                           | Carbon side panel for more than 5 inputs; Fluent medium drawer (§8)                                                                 | should   | Pass `wide`. Fields already sit in `sm:grid-cols-2`, so they use the room.                                                                                                                                                                      |
| 9   | `components/feed/feed-rations.tsx:256,311`                                                                                                                                                                                                      | Ration editor is a 512px dialog with a list scrolling inside it                                           | Carbon: a dialog for fewer than 5 inputs. Fluent: long dialog forms lose context (§8)                                               | should   | Move it to `FormSheet wide`.                                                                                                                                                                                                                    |
| 10  | `components/animal/overview-tab.tsx:586` (and the other tabs listed in §9); `components/ventures/venture-overview.tsx:198-216`                                                                                                                  | One column of full-width parts at every width                                                             | Polaris "2/3 + 1/3 layout on detail pages". Fiori object page (§9)                                                                  | should   | `grid gap-6 lg:grid-cols-3` with the main parts in `lg:col-span-2`, as `investors/investor-profile.tsx:351-352`. Facts and short panels go in the third column.                                                                                 |
| 11  | `routes/_authenticated/people/$userId.tsx:88-110`                                                                                                                                                                                               | Header has no mark or key facts                                                                           | Fiori header facets; app's own Investor header (§9)                                                                                 | could    | `PageHeader leading` with `initialsOf` (lib/initials.ts), and Roles and last sign-in as meta.                                                                                                                                                   |
| 12  | `components/money/receivable-tab.tsx:283-298`, `money/cash-tab.tsx:610-657`, `money/wage-draws.tsx:239-268`, `giving-less.tsx:27-60`, `returns/returns-page.tsx:83,349,409`, `returns/dairy-returns.tsx:226,395,515`, `months/by-month.tsx:538` | Records with several figures shown as cards or plain rows across about 1100–1600px                        | Polaris index table for records to act on. Carbon data table (§7)                                                                   | should   | Move each to `DataTable` with a `card` for the phone (keeps today's phone look). One page per merge. Keep `<details>` only where a row opens to a breakdown.                                                                                    |
| 13  | `routes/_authenticated/settings.tsx:226-233`; `farm.tsx:88,159`; `components/farm-parameters.tsx:852`                                                                                                                                           | Settings are thin cards across the full width; farm fields stretch to about 700px                         | Polaris annotated layout and Settings template (small width). Carbon: "field widths should reflect the intended length" (§8)        | should   | A `Page width="settings"` (`max-w-5xl`) plus a `SettingsSection` (`lg:grid-cols-[18rem_minmax(0,1fr)]`, title and description left, fields right). Cap farm form grids at `max-w-3xl`.                                                          |
| 14  | `routes/__root.tsx:91`                                                                                                                                                                                                                          | Toasts top center on every width                                                                          | Carbon top right; Fluent top or bottom right (§11)                                                                                  | should   | On `md` and up, `position="top-right"` with `offset` 64px (clears the 56px bar). On a phone keep `top-center`. Read the width with `useIsMobile`.                                                                                               |
| 15  | `components/shell/app-sidebar.tsx:83`                                                                                                                                                                                                           | Current page marked by a 1.29:1 background and weight                                                     | Carbon: selected item has a 4px border. WCAG 1.4.11 states (§2)                                                                     | should   | `data-active:before:` a 3px `bg-sidebar-primary` bar on the inline start, hidden in icon mode. Or `data-active:shadow-[inset_3px_0_0_var(--sidebar-primary)]`.                                                                                  |
| 16  | `components/page.tsx:504-505`                                                                                                                                                                                                                   | One 80px block while a table loads                                                                        | Carbon: skeletons shaped like the data table (§7, §10)                                                                              | could    | `DataTable` gets a `TableSkeleton` (header and 5 rows) that pages pass to `Loaded skeleton`.                                                                                                                                                    |
| 17  | `components/page.tsx:45-48`                                                                                                                                                                                                                     | No max width; on a 2560px monitor content is about 2240px                                                 | Carbon product model: max width 1584, left-aligned (§1)                                                                             | could    | `default: "max-w-[99rem]"` (left-aligned, no `mx-auto`), so the title stays put as the window grows.                                                                                                                                            |
| 18  | `components/shell/app-shell.tsx:34-44`                                                                                                                                                                                                          | A sidebar closed on a laptop opens again on reload                                                        | Carbon: columns stay the same as the nav opens or closes; the choice is the person's (§2)                                           | could    | Read the `sidebar_state` cookie (already written at `packages/ui/src/components/sidebar.tsx:83`) as the starting value on 1024px and up.                                                                                                        |
| 19  | `button.tsx:7`, `input.tsx:33`                                                                                                                                                                                                                  | Focus halo at 50% (about 2:1) around a 4.6:1 1px border                                                   | Passes AA. AAA 2.4.13 and Fluent use a 2px ring at 3:1 (§12)                                                                        | could    | `focus-visible:ring-2 focus-visible:ring-ring` (full strength) in place of `ring-[3px] ring-ring/50`.                                                                                                                                           |
| 20  | `routes/_authenticated/home.tsx:101` vs `components/page-kit.tsx:176-179`                                                                                                                                                                       | Skeleton figures `lg:grid-cols-4`, real figures `xl:grid-cols-4`; the page jumps at 1024–1279             | Carbon: skeletons match the layout (§10)                                                                                            | could    | Use `xl:grid-cols-4` in the skeleton.                                                                                                                                                                                                           |
| 21  | Top bar, `components/shell/top-bar.tsx`                                                                                                                                                                                                         | No way to jump to an Animal by Tag Number from anywhere                                                   | Atlassian page header has a search slot; no system requires it (§12)                                                                | could    | Open question 4.                                                                                                                                                                                                                                |

**Already at the standard (no change):**

- the shell's widths and breakpoints;
- the type ramp;
- spacing;
- `PageHeader`;
- `DataTable`'s sorting, alignment and pager;
- the nine wide sheets;
- the overview and the Manager's day as two-column dashboards (`overview.tsx:278`, `home.tsx:175`);
- the Investor record;
- `/farm`'s anchor rail;
- the SOP card's side rail;
- `EmptyState`, `Loaded` and `Notice`;
- the skip link and scroll padding.

---

## A desktop-first plan that keeps the shed on the phone

**Pages that stay phone-first, and why.**

- **The day's work** (`/work`) and **a Step being worked** (`/work/$instanceId`, where Milk Records and other Evidence are taken). Barn Staff hold the phone with an animal in front of them. Their 48–56px buttons (`work/$instanceId.tsx:327`, `components/work/evidence-sheet.tsx:1106,1114`) are deliberate, and so is the `max-w-4xl` column.
- **The Shed Phone screen** (`routes/shed-phone.tsx`), which is a kiosk: 56px buttons and a keypad (`:65,142`).
- **Reporting an Observation and the Vet's screen.** These are used in the barn.

None of the steps below touches these, except that the token, toast and focus fixes reach them too. Each step says when to look at 375px.

The investor portal already had its own research round (`docs/research/investor-portal-design.md`). It shares the kit, so steps 1–3 reach it. No step changes its wording.

**The steps, in order. Each can be merged on its own.**

1. **Input contrast** (audit 1). Change two tokens in `globals.css`.
   - Check `/animals` (search and filters), the money-entry sheet and `/settings` at 1440, light and dark.
   - Check the outline buttons beside them.
   - Check a Step at 375: its boxes should simply look firmer.
2. **Toasts that wait** (audit 2, 14).
   - Error toasts and toasts with an action stay until dismissed. On a desk they go top right, under the bar.
   - Check: stop the API, open `/money` at 1440. The failure toast should stay with Retry, top right, clear of the bar. At 375 it should be top center.
3. **One density on a desk** (audit 3). Add the `md:` twins on PageTabs, BackLink and the overview's panel links.
   - Check `/money` and `/animals/$tagNumber` at 1280: the tabs should be 36px and the back link should sit where it did.
   - At 375 nothing should change.
4. **Sidebar** (audit 15, 18). Add the current-item bar, and remember a closed sidebar.
   - Check at 1440: close it, reload, and it should stay closed.
   - At 1100 the icon rail should still show the bar; at 900 it should become the rail.
5. **Tables on a desk** (audit 4, 5, 6, 16). In `DataTable`: sticky headings for paged tables, the table skeleton, and Ventures People/Animals from `xl`. In the month table: a pinned first column.
   - Check `/animals` at 1440 by scrolling 50 rows. The headings should stay under the bar, and Tab through a row should never land under them (2.4.11).
   - Check `/ventures` at 1280 and 1440 in bn and en (`scrollWidth` against the wrapper), and `/monthly-report` at 1280.
   - At 375 the cards should be unchanged.
6. **Long forms get room** (audit 7, 8, 9).
   - Pass `wide` to five sheets. Move the ration editor into a wide sheet. Add `FormSheet size="full"` for the Venture Plan.
   - Check each at 1280 (the tightest laptop) and 1920, and at 375, where a sheet is the whole screen anyway.
7. **Record pages in two columns** (audit 10, 11). First the Animal overview, then the Venture overview, then the person header. One merge each.
   - Check `/animals/$tagNumber` and `/ventures/$ventureId` at 1280, 1440 and 1920 in bn and en.
   - Check at 768–1023 (it should stack as today) and at 375.
8. **Lists into tables** (audit 12). Receivables, then cash in hand, then wage draws, then giving less, then the returns lists, then Ventures against plan. One page per merge.
   - Check each at 1440 and 375: the phone should still be the same cards.
   - Delete any label the move stops using; the unused-messages test will say which.
9. **Settings frame** (audit 13). Add `Page width="settings"` and the annotated `SettingsSection` to `/settings`, then cap `/farm`'s grids.
   - Check at 1440 and 1920. At 375 it should be one column as today.
10. **The frame's cap** (audit 17). `max-w-[99rem]`, left-aligned.
    - Check at 1920, where nothing should change, and at a 2560 window (or the browser zoomed to 67% at 1920), where the content should stop at 1584px.
11. **Small polish** (audit 19, 20). The focus ring and the Manager's day skeleton.
    - Check by tabbing through `/money` at 1440, light and dark.

Steps 1–3 are the ones that matter most for "enterprise". Steps 5–8 are the ones the Owner will feel most at a desk.

---

## Open questions only the Owner can answer

1. **What screen do the Owner and the Managers work on?** A 1366 or 1280 laptop, or a 1920 monitor? Steps 5 and 7 are measured at 1280–1920.
   - _Recommendation:_ tell us the real screen. Until then, treat 1366×768 as the smallest desk and check every step at 1280 too.
2. **Should a very wide monitor use all of its width, or stop at 1584px?**
   - _Recommendation:_ stop at 1584px, left-aligned, as Carbon does. Below 1920 nothing changes.
   - _Answered 2026-10-09:_ use all of it. The cap was built, but left-aligned it left a wider margin on the right than
     the left, which read as the page not lining up with the top bar. The Owner chose the whole width with the same
     32px on both sides over a centered, capped frame.
3. **Is there a job you do to many rows at once?** For example: signing off several Steps, marking several animals Ready for Sale, or approving several money entries.
   - _Recommendation:_ build row selection and a batch-action bar (Carbon's pattern) only for a job you name. The Sign-off queue is the likeliest. Do not add checkboxes to every table.
4. **Would a "go to Tag Number" box in the top bar help?** It would work from any page, with a keyboard shortcut such as Ctrl+K.
   - _Recommendation:_ yes, but only for Tag Numbers at first, the farm's most-typed key. A whole-app search can wait until you ask for it.
5. **Is a tablet ever used in the office or the barn?** Between 768 and 1023px the app shows desk-sized 36px controls with the icon rail.
   - _Recommendation:_ keep that as it is unless a tablet is used by hand in the barn. If one is, the size switch can follow the pointer (touch or mouse) and not the width, as Fiori's cozy and compact do.

## What could not be confirmed

- **Material 3's own pages** (m3.material.io would not load). Its size classes are quoted from Android's documentation.
- **Carbon for IBM Products' side panel and tearsheet sizes,** which are behind IBM sign-in. Carbon's page header has only Storybook notes, no design measurements.
- **Fluent's maximum content width** (none is published), **its table guidance** (no design page; the row heights are from code) and **its exact button heights.**
- **Atlassian quotes** came through a summarizing fetch.
- **The field counts for the sheets** are counts of input components in the source, not of fields seen on screen.
- **Nothing here was measured in a browser.** Every width check above is still to be done, page by page, as each step merges.
