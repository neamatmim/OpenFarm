# Design sweep — 2026-10-09

The user: "check the full app for design improvement and improve every design which is not beautiful and consistent,
e.g. money/accountant income and expense is not beautiful/consistent, specially printable things".

## Finding that leads

Two kinds of printed paper live side by side:

- **Laid-out papers** — `PaperDocument` (domain `paper-template.ts`) drawn by `PaperDocumentView` in `PaperDialog` /
  `PaperToolbar`: letterhead, headed parts, tables, a বাংলা/English switch (ADR 0021). Every Investor paper, the
  Farm's and a Venture's monthly report.
- **Text papers** — a string from domain `papers.ts`, shown in a `<pre>` by `components/paper.tsx` and printed as
  is: Bangla and English crammed on one line ("আয় / in ৳… · ব্যয় / out ৳…"), no table, no letterhead. Thirteen
  of them (`PaperId`).

## Phase A — papers (the user's focus)

Each text paper redrawn as a `PaperDocument`, shown and printed through the shared paper kit. Content, order and
the Export trail unchanged.

| #   | Paper                                                                                                        | Where                 | Language                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------- |
| A1  | Accountant summary (income and expense)                                                                      | Money › Accountant    | switch (farm's own, like the monthly report) |
| A2  | Milk dispatch record                                                                                         | Milk › records        | switch                                       |
| A3  | Inspector View registers ×6 (registration, herd summary, vaccination, treatment, disease history, mortality) | Inspector view        | switch                                       |
| A4  | Sale papers: receipt, withdrawal summary, animal passport                                                    | Sales, animal › money | switch                                       |
| A5  | Transport card, DLS letter                                                                                   | Sales, animal › money | Bangla only (ADR 0021: an authority's forms) |
| A6  | Whatever else prints through `Paper` / `printAlone` (work notices, SOP card)                                 | —                     | decide on reading                            |

## Phase B — screens

A page-by-page look on the seed (Owner, desktop first per the 2026-10-04 desktop pass, bn and en), findings in
`screens.md`, fixed in groups. A code-level audit of hand-rolled styles runs alongside (`code-audit.md`).

## Decisions

- The user asked for the whole app to be made beautiful and consistent; design choices are made on recommendation
  (as the enterprise-look passes were) and written here.
- **2026-10-09, the Owner:** every compliance paper reads in one language with the switch, not Bangla with English
  labels alongside (Release 1 spec story 100). Recorded as an addendum to ADR 0021. A5's transport card and DLS
  letter take the switch too.
- Registers share one layout, a new paper part `records`: numbered entries, heading left, fields running right.
- A paper table column may be `whole` (never breaks, keeps written line breaks); figures never break.

## Done

- A1 accountant summary 6e01f2c0 · A2 milk dispatch record 205b3cec · A3 Inspector View ×6 f49bee94
- A4/A5 sale papers 666d85f9 · DLS letter dd05df11 · text letterhead removed 2b5b24c4 — no text paper is left;
  the SOP wall card and the portal code slip keep their own deliberate layouts.

## Phase B plan (from `code-audit.md`, item numbers in brackets)

| Group | What | Audit items |
|---|---|---|
| B1 | Empties and loading: `EmptyState` everywhere a list can be empty, `Loaded` + `TableSkeleton` for tables, no "none" while loading, no silent `null`, one skeleton radius | 6, 7 |
| B2 | Parts and headings: hand sections → `Section`; headings → `SECTION_TITLE`/`SUBHEADING`; an `OVERLINE` constant; the Rules page's second title | 4, 5, 23 |
| B3 | Tag Numbers: `TagChip`/`TagLink` on every list and table | 2 |
| B4 | Portal: `BackLink`, `PageHeader` on Your data, warnings as `Notice` | 1, 14 |
| B5 | Controls: kit `Checkbox`/`RadioGroup` for native ones, `SegmentedControl` for few choices | 3, 12 |
| B6 | Dialogs: `CorrectionDialog` on `FormDialog`, confirms on `ConfirmDialog`, one title size, money records in sheets | 9, 10 |
| B7 | Tables: statement tables styled as `DataTable`'s, the month table once, phone cards for lists | 8, 25, 26 (month) |
| B8 | Forms: `UnitInput`, an inset panel and a computed-figure piece in the kit, button heights, one upload button | 15, 16, 17, 18, 26 |
| B9 | One-offs: date filter, record "more" menu, initials, flow cards, door colours, error red, code spacing, `formatNumber` | 11, 13, 19, 20, 21, 27, 28 |

Then a visual pass page by page on the seed (bn and en, 1366 and a phone) for what code reading cannot see.

## Phase B done (branch design/exports-and-periods)

Exports 0056f584 · tags/portal/controls 6fb060d5 · empties/loading cbd6e961 · dialogs/money forms 5b3643fa · tables
ba7ca84c · sections/headings 0bd0c3b5 · form pieces 82096616 · feed unit f28775a6 · one-offs f7ddfd06 · review fixes
40a82b41. New kit: `ExportList`/`ExportRow`, `COLUMN_HEADING`, `OVERLINE`/`LABEL_HEADING`/`PAGE_TITLE`, `Chip`,
`InsetPanel`/`WorkedOut`/`ChoiceCard`/`UploadButton`, `HeaderMenu`/`InitialsMark`/`PeriodFilter`/`FlowHead`/`FLOW_CARD`/
`BatchBar`/`CODE_SPACING`, `FigureTerm size="panel"`, `FormDialog keepsWhatIsTyped`.

Left on purpose (judgement, or not worth the churn):
- Standards and financial-year lists keep a table on a phone (desk pages; desktop first).
- The two month pages keep their own statement tables (shapes differ); both now head them alike.
- The portal's herd table and weight table keep their hand split (already muted, small, with a phone list).
- ~45 hand `dt`/`dd` figure pairs in the portal and a few forms: each would change its look to fit a FigureTerm size.
- `Initials` in the user menu and shed phone stay their own sizes; `TONE_TEXT`/`TILE_TONE` twins, `CHIP` on /work,
  `AnimalLink` beside `TagLink`, catalog key placement, `HeaderMenu`/`RowMenu` sharing logic: code-only.
- Money fields keep their sign in the label («দাম (৳)»), the app-wide convention; units of weight go inside the box.
- New: a retired Investor's initials mark is greyed, as a person's is when access is off.
