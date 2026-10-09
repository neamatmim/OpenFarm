# Design-consistency audit of the screen code, 2026-10-09

Read-only sweep of `apps/web/src` (routes and components) and `packages/ui`, against the kit in
`components/page.tsx`, `components/page-kit.tsx`, `components/data-table.tsx`, `ventures/venture-money.tsx`
(`MoneyTotals`) and `packages/ui/src/styles/globals.css`. Paper/print code (`components/paper.tsx`,
`components/ventures/paper-*.tsx`, `investors/welcome-letter.tsx`, print-alone) was left out. The phone sizing of the
phone-first screens (/work, /shed-phone, observation, /vet) was left alone too, but their cards and headings were checked.
Every finding below was opened and confirmed in the file. Grep hits that turned out fine are listed at the end.

Severity:

- **Visible**: a person can see it on screen.
- **Visible, subtle**: seen only side by side, or only on one kind of screen.
- **Code-only**: it looks the same as the kit today, but bypasses it, so a later change to the kit will not reach it.

What is already clean:

- No raw palette colors outside paper code. The only one is `door-screen.tsx`, see 21.
- No `sonner` imports outside `lib/toast.ts`.
- No `shadow-sm`/`shadow-md` on surfaces.
- No `bg-card rounded-xl border` cards outside the two in 4f.
- No direct use of the ui `select`, `card` or `alert` components.
- `uppercase` appears only on overlines and on the door code input.

---

## Visible problems (most visible first)

### 1. The portal's back links are drawn by hand (4 places), and differ from `BackLink`

`BackLink` is a `ChevronLeft` at a thumb's height (`min-h-11 md:min-h-9`), `font-medium`, with a focus ring and fixed
spacing above the `PageHeader`. The Investor portal draws its own instead: an `ArrowLeft` in plain `text-sm`, with no
tap height, no focus ring, and its own spacing (`-mb-2`, or `gap-6` on the page).

- `components/portal/pages/venture.tsx:645-662`: two `<Link>`s with `ArrowLeft`, `-mb-2`
- `components/portal/pages/open-venture.tsx:126-134`: `ArrowLeft`, `-mb-2 flex w-fit`
- `components/portal/pages/your-data.tsx:96-103`: `ArrowLeft`, no negative margin
- `components/door-screen.tsx:170-184` (`BackToSignIn`) is a fourth back link, a `ChevronLeft` centered under the sign-in
  card. It is a different place (under a card), so a variant of it could be kept.

Kit: `BackLink`, which takes any `to`/`params`, so the portal places fit it. **Visible.** Investors see the arrow while
the farm side sees the chevron.

`your-data.tsx:29` also draws its page title as `<h1 className="text-2xl font-semibold">` with a `text-base` preamble,
not a `PageHeader` (`text-xl md:text-2xl`, `text-sm` description). So on a phone this one portal page has a larger
title than the rest. **Visible.**

### 2. Tag Numbers are drawn in at least six different ways

`TagChip` (a secondary chip in mono semibold) and `TagLink` (`fattening/fattening-words.tsx:26`, a TagChip that opens
her page) are the kit's way. Elsewhere:

- `components/animal/herd-list.tsx:79` (the Animals list) and `components/ventures/venture-animals.tsx:62`: bare
  `font-mono font-semibold` text, underlined on hover, with no chip
- `components/animal/herd-list.tsx:166`: `font-mono text-base font-bold`
- `components/animal-histories.tsx:698` (calves): `font-mono font-medium` with an underline
- `components/portal/pages/venture.tsx:223, 273, 419`: `font-mono font-medium`, or plain `font-mono` in a table cell
- `components/fattening/selling-trip.tsx:87`: `font-mono text-xs font-medium`
- `components/fattening/out-of-band.tsx:101`, `components/money/cash-tab.tsx:286`: plain `font-mono`
- `components/animal/animal-profile.tsx:385` (her page title): `font-mono tabular-nums`. This one is fine as a title.

**Visible.** The same animal is a chip on the fattening board and the review queue, but plain bold text on the Animals
list and in a Venture's animals.

### 3. Browser-native checkboxes and radios beside the kit's `Checkbox` (12 files use it)

These render the operating system's unstyled controls:

- `components/money/cash-tab.tsx:275-285`: the sales ticked into a deposit (inside a FormDialog)
- `components/playbook/sop-steps.tsx:394-401` ("repeat per animal")
- `components/playbook/sop-when.tsx:309, 322, 387` (every other week, first of the month, whole farm)
- `components/playbook/step-answers.tsx:70-82` ("required")
- `components/fattening/window-choice.tsx:42-66`: two native `type="radio"`s for the sale window. The kit's answer is
  `SegmentedControl`, or the radio-card label the sale/review sheets use.

**Visible.** They look out of place next to the styled controls on the same form.

### 4. Parts of a page drawn by hand instead of with `Section`

`Section` is a `surface p-4 md:p-5` with `gap-4`, a `SECTION_TITLE` h2, and a `text-sm` muted description beside an
optional action. These hand copies differ from it on screen:

| Where                                                                       | What is there                                                                                                                         | How it differs                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/costs.tsx:108-109`, `:155-156`                                  | `surface flex flex-col p-4 text-sm md:p-5`, `<h2 className="mb-2 text-base font-semibold">` / `<h3 className="mb-1 …">`               | no `gap-4`; the spacing comes from `mb-1`/`mb-2`, so the rhythm is tighter than in sibling Sections on the animal page                                                        |
| `components/gain.tsx:138-139`                                               | `surface space-y-2 p-4 md:p-5` + hand h2                                                                                              | `space-y-2` instead of `gap-4`                                                                                                                                                |
| `components/milk/milk-account.tsx:46-48`                                    | `surface flex flex-col p-4 md:p-5`, h3 `text-base font-semibold`, hint `pb-2 text-xs`                                                 | the description is `text-xs`, where Section's is `text-sm`                                                                                                                    |
| `components/feed/scale-by-seller.tsx:60-63`                                 | same shape as milk-account                                                                                                            | description `text-xs`                                                                                                                                                         |
| `components/money/cash-tab.tsx:774-775` (floats out) and `:931-932` (hands) | surface, h3 or no title, hint `pb-2 text-xs`                                                                                          | as above                                                                                                                                                                      |
| `components/money/wage-draws.tsx:411-414`                                   | surface with a hint `pb-2 text-xs`                                                                                                    | as above                                                                                                                                                                      |
| `components/money/categories-tab.tsx:383-392`                               | surface, a header row with `border-b pb-4`                                                                                            | the only part with a rule under its title                                                                                                                                     |
| `components/templates/template-sections.tsx:468-480`                        | hand `<section className="surface …">` + `SECTION_TITLE`                                                                              | description `text-xs`                                                                                                                                                         |
| `components/farm-parameters.tsx:278-286`                                    | `<h2 className="inline-flex items-center gap-2 text-base font-semibold">` with a `SlidersHorizontal size-5` icon, then `text-sm` hint | a second, icon-led title ("Farm parameters") directly under the Rules page's own `PageHeader` ("Rules and alerts"), on `/farm/rules`. No other page has a title with an icon. |

Two more card-like boxes are drawn by hand:

- `components/playbook/standard-sops.tsx:161`: tiles inside a Section on `bg-background … rounded-xl border p-4`. These
  are gray-ground tiles inside a white card, and the only ones like that.
- `components/work/work-notices.tsx:33`, `:111`: `rounded-xl border p-3` sections with no card fill (on /work). The
  phone sizing is meant; the missing `surface` is not.

**Visible, subtle.** The `text-xs` descriptions and the tighter spacing show when these sit beside a real `Section`.

### 5. Headings that are neither `SECTION_TITLE` nor `SUBHEADING` and look different from both

71 headings in all: 14 use the constants, 57 are written by hand. Most of the hand ones match a constant exactly (listed
under Code-only, item 23). These differ on screen:

- **A subheading in medium instead of semibold** (`SUBHEADING` is `text-sm font-semibold`):
  `components/fertility/fertility.tsx:185`, `components/ventures/offers-in-app.tsx:162` and `:289`,
  `components/playbook/step-answers.tsx:36` (h4), `components/people/person-access.tsx:59` (h3 `font-medium`, base size),
  `components/work/work-notices.tsx:113` (h2 `font-medium`)
- **An h3 at body size `font-semibold`** where its siblings use `SUBHEADING` (14px):
  `components/playbook/proposals-tab.tsx:278` and `:312`, `components/feed/feed-rations.tsx:730`,
  `components/culling/cull-list.tsx:359`, `components/audit/audit-trail.tsx:428`, `components/playbook/sop-steps.tsx:319`
- **Small muted "label" headings, in five variants**:
  - `text-muted-foreground text-xs font-medium` (`home/early-losses.tsx:32`, `work/work-notices.tsx:34`)
  - `… text-sm font-medium` (`portal/capital-account.tsx:86`)
  - `… text-sm font-semibold` (`work/work-board.tsx:203`)
  - `… text-xs` (`portal/pages/account.tsx:88`)
  - `border-b pb-1.5 text-sm font-semibold` (`sops/$definitionId/card.tsx:209`)

  There is no kit constant for an overline-style group heading, so each one invents its own.

**Visible, subtle.**

### 6. Empty lists said as a plain muted line, beside pages that use `EmptyState`

`EmptyState` (`compact` for one muted line with an icon, `bare` inside a Section) is used 89 times. These say "nothing
here" as a bare `<p className="text-muted-foreground text-sm">` with no icon:

- **Venture month page**, `components/ventures/venture-month.tsx:128-130, 216-218, 288-290, 345-347`. The tabs of the
  Venture page it is opened from use `EmptyState bare` with an icon (`venture-animals.tsx:268`,
  `venture-money.tsx:322`, `venture-investors.tsx:634`), so the same "no animals / no money" reads two ways one click
  apart.
- **Farm month page**, `components/months/one-month.tsx:194`, `:294`. Its sibling `months/by-month.tsx:721` uses
  `EmptyState bare`.
- **Home**: `components/home/farm-panels.tsx:203, 333-335, 425-427`, `components/home/early-losses.tsx:56`.
- `components/money/farm-accounts.tsx:241-243`, `components/vet-cases.tsx:171`,
  `routes/_authenticated/inspector-view.tsx:236-238`, `components/portal/pages/home.tsx:177-179`.

Inside form sheets (`feed-rations.tsx:362`, `receive-feed-sheet.tsx:617`, `buy-medicine-sheet.tsx:241`,
`nominees-form.tsx:284`) a plain line is reasonable, so those are not counted.

**Visible.**

### 7. Loading states: "nothing here" while loading, silent nulls, and mismatched skeletons

- **"None" shown before the farm has answered**, which `Loaded` exists to prevent:
  - `components/money/wage-draws.tsx:399-409`: `open.data ?? []`, and `EmptyState "no wage draws"` while loading or on
    a failure. Its sibling money tabs (register, receivables) use `Loaded` with a `TableSkeleton`.
  - `components/money/farm-accounts.tsx:220, 240-243`: "no accounts" while loading.
  - The same `?? []` shape, for lists that are not in a picker, appears in `trips/past-outings.tsx:35`,
    `investors/investor-requests.tsx:24`, `fertility/heifer-growth.tsx:168` and `feed/feed-history.tsx:414`. Worth a
    look in the fix pass.
- **A part that returns `null` until its data comes**, so it neither shows a placeholder nor says it failed, and pops in
  late: `costs.tsx:97`, `home/early-losses.tsx:48`, `milk/milk-account.tsx:38`, `farm-parameters.tsx:265` (all of
  /farm/rules), `fattening/animal-prices.tsx:338`, `animal/death-photo.tsx:54`, `intake/intake-sections.tsx:296`,
  `feed/scale-by-seller.tsx:57`, `money/cash-tab.tsx:408`, `:924`.
- **Loaded rebuilt by hand without its retry**: `components/health-registers.tsx:599-609` (a danger Notice with no retry
  button, then a Skeleton). `routes/_authenticated/ventures/$ventureId_.months.index.tsx:31-35` (the same).
- **Placeholder shapes for list pages that are siblings**:
  - Farm-settings lists: breeds (`farm/breeds.tsx:555`), Eid dates (`farm/eid-dates.tsx:291`) and the financial year
    (`farm/financial-year.tsx:382`) draw one `h-40 rounded-lg` block.
  - Backups (`farm/backups.tsx:345`) and shed phones (`farm/shed-phones.tsx:113`) draw `Loaded`'s default `h-20`.
  - People (`farm/people/index.tsx:240`) draws `TableSkeleton`.
  - In all, `TableSkeleton` is used by 6 of the ~20 `Loaded` blocks that wrap a table. Others:
    `needs-review.tsx:317`, `sign-off/check-tab.tsx:291`, `sign-off/late-tab.tsx:188`, `milk/handed-over.tsx:374`,
    `intake/recent-intakes.tsx:146`, `feed/feed-leftovers.tsx:287`, `money/categories-tab.tsx:401`,
    `people/person-sign-ins.tsx:238`, `observations.tsx:211`.
- **Skeleton radius**: block placeholders are `rounded-xl` (the surface radius) in about 45 places, but `rounded-lg` in
  `Loaded`'s own default (`page.tsx:589`), `milk-mismatches.tsx:48`, `selling-trip.tsx:290`, `recent-intakes.tsx:146`,
  `categories-tab.tsx:401`, `portal/pages/account.tsx:518`, `animals/index.tsx:379`, and the farm-settings pages above.
- **The one spinner page**: `routes/_authenticated/setup.tsx:193` returns `components/loader.tsx` (a centered `Loader2`),
  where every other page draws a skeleton.

**Visible.**

### 8. Tables outside `DataTable` look different from it

`DataTable` headings are muted, `text-xs`, sit at the foot of their cell and are indented `first:pl-4 md:first:pl-5`,
and a phone gets cards (ADR 0006). The tables below differ:

- **Statement tables on the ui `Table`**, whose `TableHead` default is `text-foreground` 14px `font-medium`, so they are
  darker and larger than every DataTable heading:
  - `components/months/one-month.tsx:73`, `:198` and `components/ventures/venture-month.tsx:74`, `:349`. These are twin
    copies of the same table (see 26).
  - `routes/_authenticated/standards.tsx:72` and `routes/_authenticated/farm/financial-year.tsx:97`. These two are lists,
    with no phone card, so they scroll sideways on a phone.
- **Raw `<table>` with its own heading style** (`text-muted-foreground px-2 py-1.5 text-xs`, close to DataTable but not
  aligned to its padding): `components/ventures/venture-plan.tsx:699` and
  `components/ventures/plan-against-actual.tsx:46`, `:218`.
- **Raw `<table>` in the portal**: `components/portal/pages/venture.tsx:393` hand-builds DataTable's own phone/desk
  split (a `ul sm:hidden` plus a table); `components/portal/weight-line.tsx:132`.
- `components/audit/audit-trail.tsx:346`: a known leftover (the audit sheet's table, with a `bg-muted/50` header and a
  `rounded-lg border` frame).
- These tables also mix `text-right` and `text-end` (the ui-Table ones use `text-right`, the plan tables `text-end`).
  Code-only.

**Visible.**

### 9. Recording money: a dialog in one place, a sheet in another

`FormSheet`'s own doc says a piece of work of its own, "feed in, a sale, milk handed over", goes in a sheet, and a short
form ("a level, a name, a reason") goes in a dialog. Money records are split between them:

- **FormDialog**:
  - `components/money/cash-tab.tsx:101` (hand cash over), `:250` (deposit sales to a Venture), `:581` (count a trip's
    float home)
  - `components/money/wage-draws.tsx:83` (wage draw: person, amount, day, payment method, account, note, holder, side)
- **FormSheet**:
  - `components/ventures/count-float-sheet.tsx:142` (count a Venture's float) and `draw-float-sheet.tsx:103`
  - `components/money-entry.tsx` `EnterMoneySheet`, and `components/money/receivable-payment-sheet.tsx`

"Count a float home" is a dialog on the Cash tab and a sheet on the Venture page. The wage draw has as many fields as
the money-entry sheet. **Visible.**

### 10. Dialogs built by hand instead of `FormDialog` and `ConfirmDialog`

- `components/correction-dialog.tsx:102-133` (`CorrectionDialog`, **25 uses in 20 files**, every "Correct" on the
  app):
  - its own `<form>` with no Cancel button (`FormDialog` has Cancel + submit)
  - `Label` + `Input` instead of `FormField`
  - the browser's `required` check, so the "missing" message is the browser's, in the browser's language
  - no unsaved-changes guard

  It is the most-seen dialog in the app and looks unlike every `FormDialog` next to it.

- `components/password-again-dialog.tsx:68-104`: a hand form dialog, with errors in `text-destructive text-sm`.
- **Hand confirm dialogs** on a plain `Dialog`, where `ConfirmDialog` is an `AlertDialog` that a tap outside does not
  dismiss: `components/devices/phone-table.tsx:221-245` (revoke a shed phone), `components/people/person-access.tsx:617-640`
  (switch off a person's access). Both take something away, and both close on a stray tap beside them.
- **Dialog title size**: every dialog and sheet title is `DialogTitle`/`SheetTitle`'s `text-sm font-medium`. Two dialogs
  raise theirs to `text-base font-semibold`: `components/milk-mismatches.tsx:134`, `components/money-entry.tsx:508`.

**Visible.**

### 11. The "more" menu at the top of a record page is drawn two ways

- **Animal page**, `components/animal/animal-profile.tsx:96-119`: an outline `Button` with dots and the word "More",
  and a `w-60` menu written out by hand (it repeats `RowMenu`'s safe/destructive split).
- **Venture page**, `routes/_authenticated/ventures/$ventureId/route.tsx:207-210`: `RowMenu`, so an icon-only ghost dots
  button `md:size-8` and a `w-56` menu.

The initials mark at the head of a record also differs between two sibling pages:

- **Investor**, `routes/_authenticated/investors/$investorId/route.tsx:143`: `bg-primary/10 text-primary`, hidden on a
  phone (`hidden sm:grid`).
- **Person**, `routes/_authenticated/farm/people/$userId.tsx:118-130`: `bg-primary text-primary-foreground`, always
  shown.

**Visible.**

### 12. Choosing one of a few things: four looks

- `SegmentedControl` is the kit's, with 12 uses.
- **Rounded-full pill chips**, `components/saw-filter.tsx` `Chip`: in `components/returns/season-breakdown.tsx:236`,
  `:293` (open the season by Market/Seller/…) and in /vet. The saw-filter's doc comment says the Manager's observations
  sweep shares it, but `observations.tsx` now uses a `NativeSelect`.
- **aria-pressed `Button`s swapped between `secondary` and `outline`**: `components/money/period-bar.tsx:66-82` (period
  shortcuts), `components/playbook/sop-when.tsx:283-295` (weekdays), `components/report-sighting.tsx:93-102` (what was
  seen; this one is a grid of answers, fine).
- Native radios, `fattening/window-choice.tsx` (item 3).

**Visible, subtle.**

### 13. Three designs of a from/to date filter

- `PeriodFilter` (kit): a `surface` fieldset with its own hand-styled `<input type="date">` (`page.tsx:719`, `:733`).
  Used once, in `components/health-registers.tsx:669`.
- `PeriodBar`, `components/money/period-bar.tsx:46`: a bare grid (no card) of `FormField` + kit `Input`, with shortcut
  buttons. Used on /money.
- `components/milk/milk-records.tsx:54-75`: `FilterBar className="border-y py-4"` inside a surface, with rules above
  and below.

**Visible.** The same "from–to" control sits on a card on one page, bare on another, and between rules on a third.

### 14. Warnings drawn by hand instead of `Notice`

`Notice` is `rounded-xl border`, the `*-surface` fill, a `size-5` icon and a semibold title. These differ:

- `components/portal/how-to-pay.tsx:54`: `border-warning/35 bg-warning-surface/40 rounded-md`, a `size-4` icon
- `components/returns/gaps.tsx:90`: `border-warning/30 bg-warning/5 rounded-md`. This fill is not even the
  `--warning-surface` token.
- `components/returns/season-breakdown.tsx:245`, `:302`: an error said as a bare `text-danger text-sm` line

**Visible, subtle.**

### 15. Units written into the label instead of `UnitInput`

`UnitInput` (the unit inside the box at its end) is used in one file, `ventures/venture-plan.tsx`. Elsewhere the unit
is in brackets in the label:

- `components/feed/feed-rations.tsx:121`, `:134` ("From (kg)", "Up to (kg)")
- `components/feed/feed-items.tsx:224`, `:319` ("Bag size (kg)")
- `components/feed/receive-feed-sheet.tsx:275` ("Weighed on the farm's scale (kg)")
- `components/investors/nominees-form.tsx:167` ("Share (%)")
- `components/ventures/amend-sheet.tsx:311` ("The investors' share (%)")
- `routes/_authenticated/farm/breeds.tsx:417` (gain share "(%)")

**Visible, subtle.**

### 16. Inset panels inside a card or sheet: four fills, three radii

There is no kit piece for "a quiet box inside a card". Hand versions:

- `bg-muted/40 rounded-lg border p-3`: `gain.tsx:25`, `:32`, `people/invite-sheet.tsx:69`, `:119`,
  `playbook/sop-when.tsx:203`, `ventures/venture-plan.tsx:392`
- `bg-muted/60 rounded-lg border p-3`: `vet/prescribe-sheet.tsx:109`, `vet/diagnosis-sheet.tsx:36`,
  `investors/investor-profile.tsx:121`
- `bg-muted/50 rounded-lg p-3` (no border): `portal/how-to-pay.tsx:173`, `animal/animal-acts.tsx:802`,
  `ventures/take-capital-sheet.tsx:239`, `portal/requests-to-join.tsx:643`
- `bg-muted/50 rounded-md p-3`: `returns/returns-page.tsx:203`, `investors/nominees-form.tsx:181`
- `bg-muted/60 rounded-xl border p-4`: `people/one-time-code.tsx:35`
- No fill, `rounded-lg border p-3/p-4`: `playbook/sop-when.tsx:355`, `:407`, `playbook/proposals-tab.tsx:319`,
  `portal/pay-in-notes.tsx:362`, `ventures/call-off-sheet.tsx:141`
- No fill, `rounded-md border p-3`: `investors/nominees.tsx:254`, `nominees-form.tsx:94`,
  `templates/template-sections.tsx:110`, `:291`

**Visible, subtle.**

### 17. Buttons sized outside the `h-11 md:h-9` rule

- **Flow-card buttons**, `h-12 text-base md:h-10`, where `text-base` has no `md:` twin, so a desk shows a 40px button
  with 16px text:
  - `sign-in-form.tsx:174`, `sign-up-form.tsx:253`, `forgot-password-form.tsx:120`
  - `routes/portal/join.tsx:184`, `routes/portal/sign-in.tsx:127`, `routes/_authenticated/join.tsx:87`
  - `routes/_authenticated/setup.tsx:146`, `:154`, `:209`, `:244`

  They are consistent among themselves, but neither the default nor `md:h-9`.

- **Twin on `sm:` not `md:`**: `components/sign-off/check-tab.tsx:192` (`h-12 sm:h-9`),
  `routes/_authenticated/outbox.tsx:140` (`h-12 w-full sm:h-9`). Between 640 and 768px they are already desk-height
  while every other button is still phone-height.
- **`size="lg"`** (`h-11 text-base`, no `md:` twin) on the intake submit: `routes/_authenticated/intakes.tsx:234`,
  `components/intake/intake-summary.tsx:234`. These are the only submit buttons on a desk that are taller than the rest.
- `components/playbook/sop-steps.tsx:538`: "Add a Step", `h-12 … md:h-12`, on the Owner's desk editor.

**Visible, subtle.**

### 18. Upload buttons drawn by hand (5 copies) instead of `buttonVariants`

A `<label>` styled as a button around a hidden file input:

- `components/photo-field.tsx:43` and `components/intake/intake-sections.tsx:84`: outline look, `md:min-h-9`
- `components/ventures/agreement-paper.tsx:38` and `components/investors/nomination-paper.tsx:52`: the same, but
  `md:min-h-8`
- `components/certificate.tsx:70`: primary look, `h-11 md:h-9 shadow-xs`

The heights differ on a desk (36 vs 32px). **Visible, subtle.**

### 19. Flow cards (sign-in, join, setup): 12 hand `<h1 className="text-2xl font-semibold">`, two gaps

There is no kit piece for the card of a flow, so each copies its frame:

- `surface … gap-6 p-6 sm:p-8`: `sign-in-form.tsx:69`, `forgot-password-form.tsx:52`, `sign-up-form.tsx:87`,
  `routes/_authenticated/join.tsx:44`
- `surface … gap-5 p-6 sm:p-8`: `routes/portal/join.tsx:109`, `routes/portal/sign-in.tsx:67`,
  `routes/_authenticated/setup.tsx:105`, `:223`, `routes/shed-phone.tsx:77`, `routes/_authenticated/work/$instanceId.tsx:292`

The farm's sign-in card and the portal's sign-in card are spaced differently. **Visible, subtle.**

### 20. Card padding off the kit's `p-4 md:p-5`

- `components/portal/capital-account.tsx:82` and `portal/portal-skeletons.tsx:58`: `p-5 md:p-6`. This is the portal's
  lead card, and it may be meant.
- `components/feed/feed-rations.tsx:726` (ration cards, `p-4`), `:593` (`p-3`), `components/playbook/sop-steps.tsx:308`
  (`p-4`), `routes/_authenticated/outbox.tsx:105` (`p-4`), `components/ventures/venture-plan.tsx:252` (fieldset `p-3`),
  `components/assign-work.tsx:65` (`p-3`)

**Visible, subtle.**

### 21. Small one-offs

- **Eyebrow.** `routes/_authenticated/inspector-view.tsx:362`, `:442` carries the "Compliance" eyebrow. Its sidebar
  siblings `/notifiable-diseases` and `/audit` carry none. Every farm-settings page does carry its group's eyebrow.
- **Large radius.** `components/sync-banner.tsx:214`: `rounded-2xl` on a phone, the only large radius by hand. It turns
  `rounded-full` at `lg`.
- **Raw colors.** `components/door-screen.tsx:41`: `bg-[oklch(0.27_0.045_162)] text-[oklch(0.95_0.015_150)]`. These are
  the light `--sidebar` values written out, so in dark mode the door panel stays the light theme's green instead of the
  dark sidebar. Use `bg-sidebar text-sidebar-foreground` if it is meant to match.
- **Batch bar.** The "N ticked" bar is written twice: `components/animal/group-move.tsx:128` (`gap-2`) and
  `components/sign-off/check-tab.tsx:303` (`gap-3`). It is also a candidate for a kit piece.
- **Code-input letter-spacing** (a known leftover) is now eight values, not four:
  - `0.4em` (`people/person-access.tsx:515`), `0.3em` (`investors/portal-access.tsx:577`), `0.25em`
    (`people/one-time-code.tsx:38`), `0.2em` (`door-screen.tsx:158`)
  - `tracking-widest` (`portal/agree-in-app.tsx:124`, `portal/pages/account.tsx:287`), `tracking-wider`
    (`sign-up-form.tsx:226`), `tracking-wide` (`portal/how-to-pay.tsx:145`)

---

## Code-only (looks right today, bypasses the kit)

### 22. `bg-card rounded-xl border shadow-(--surface-shadow)` written out instead of `surface`

- `routes/_authenticated/work/index.tsx:132` (the /work tiles)
- `routes/_authenticated/sops/$definitionId/card.tsx:170` (the printable SOP card; it needs `print:` overrides, which
  can sit beside `surface`)

### 23. Headings that copy a kit constant word for word

- **`text-base font-semibold` (= `SECTION_TITLE`)**: `costs.tsx:109`, `:156`, `gain.tsx:139`,
  `milk/milk-account.tsx:47`, `feed/scale-by-seller.tsx:61`, `money/cash-tab.tsx:775`, `ventures/venture-card.tsx:642`,
  `herd/shed-card.tsx:276`, `farm-parameters.tsx:279`. Also the kit's own `FormSection` legend (`page-kit.tsx:1024`).
- **`text-sm font-semibold` (= `SUBHEADING`)**: `home/farm-panels.tsx:176`, `:237`, `home/queue.tsx:109`,
  `investors/investor-profile.tsx:322`, `ventures/plan-against-actual.tsx:44`, `:160`, `:216`,
  `inspector-view.tsx:270`, `playbook/sop-when.tsx:356`
- **The overline class** (`text-xs font-semibold tracking-wider uppercase`) is written three times with no constant:
  `page.tsx:136` (eyebrow), `settings-nav.tsx:102`, `farm/rules.tsx:19`.
- `components/work/work-board.tsx:378`: copies `PageHeader`'s h1 class.

### 24. A figure under its label, rewritten instead of `FigureTerm`

- **Four local copies** of the same `dt text-xs` + `dd text-lg font-semibold sm:text-xl` helper on the home page:
  `home/farm-panels.tsx:78-95`, `home/herd-health.tsx:10-23`, `home/adult-deaths.tsx:8-25`, `home/calf-losses.tsx:15-35`.
  `FigureTerm` has `lg` and `xl` but no "lg on a phone, xl from sm" size. Add the size and the four can go.
- **About 45 hand `<dt>`s in all.** The densest are in the portal: `portal/pages/home.tsx:77-115`,
  `portal/pages/venture.tsx:305-489`, `portal/how-to-pay.tsx:70-156`. Also `milk-mismatches.tsx:143-279`,
  `playbook/proposals-tab.tsx:286-298`, `ventures/venture-plan.tsx:394-420`.

### 25. Phone/desk split written by hand around a DataTable

`DataTable`'s `card` prop already draws the phone list. These draw their own `ul md:hidden` + `div hidden md:block`:

- `components/money/wage-draws.tsx:415-432`
- `components/money/cash-tab.tsx:776` (floats), `:933` (hands)
- `components/months/by-month.tsx:725`

### 26. Repeated class strings with no component behind them

- **The computed figure in a form**, `bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums`, about
  12 copies:
  - `money-entry.tsx:101`, `sale/sale-sheet.tsx:259`, `drugs/buy-medicine-sheet.tsx:43`, `intake/intake-sections.tsx:321`
  - `milk/dispatch-sheet.tsx:90`, `feed/receive-feed-sheet.tsx:342`, `money/wage-draws.tsx:470`
  - `vet/prescribe-sheet.tsx:29`, `ventures/count-float-sheet.tsx:177`, `ventures/bank-check-sheet.tsx:233`,
    `ventures/internal-sale-sheet.tsx:302`
- **The radio-card label**, `has-data-checked:border-primary/40 … h-11 … md:h-9`, 4 identical copies:
  `receivable-fields.tsx:39`, `needs-review.tsx:363`, `fattening/selling-trip.tsx:79`, `animal/animal-acts.tsx:779`.
- **The tinted link on home**, `bg-*-surface text-* rounded-lg px-3 min-h-11 md:min-h-9`, 3 copies:
  `home/farm-panels.tsx:347`, `:413`, `:431`.
- **The month statement table** is written twice: `months/one-month.tsx:73` and `ventures/venture-month.tsx:74` (each
  with its own `Figure`).

### 27. Two names for the error red

`text-destructive` (7 uses: `farm-parameters.tsx:86`, `password-again-dialog.tsx:87`, `portal/pages/venture.tsx:175`,
`feed/feed-rations.tsx:150`, `:400`, `:455`, `ventures/venture-plan.tsx:481`) against `text-danger` (67 uses, and
`FormField`'s error). Both are the same in light mode, a hair apart in dark. The kit's error is also `font-medium`; these
are not.

### 28. Numbers formatted with `Intl.NumberFormat` by hand

`components/work/work-notices.tsx:299` and `components/work/evidence-sheet.tsx:818` (phone-first screens, `en-GB`
hard-coded), where `formatNumber` from `@OpenFarm/i18n` is used everywhere else.

---

## Leads that were checked and are fine

- Uppercase on `wordmark.tsx`, `settings-nav.tsx`, `farm/rules.tsx` (On this page) and `PageHeader`'s eyebrow: these are
  overlines or the wordmark. The door code input is a code.
- `shadow-xs` in `SegmentedControl` (the chosen segment) and `__root.tsx:196` (the skip link).
- `rounded-xl` on `Skeleton` blocks, `animal-photo.tsx`, `herd-list.tsx` likeness, and icon tiles: `--radius-xl` is the
  surface's own radius.
- `bg-card` on `data-table.tsx` sticky headers, `by-month.tsx:402`, `ventures-table.tsx:289` sticky columns,
  `saw-filter.tsx` chip and input-like controls: these are not cards.
- Hand `Sheet`/`Dialog` in `audit-trail.tsx`, `proposals-tab.tsx`, `step-preview.tsx`, `settlement-sheet.tsx`,
  `portal-papers.tsx`, `investor-papers.tsx`, `go-to-animal.tsx`: these are read-only viewers, not forms.
- Direct `dropdown-menu` imports in `theme-menu.tsx`, `user-menu.tsx`, `portal-shell.tsx`, `phone-preferences.tsx`:
  these are chrome menus, not row menus.
- `#315d4d` in `__root.tsx:141`: the `theme-color` meta, which must be a literal.
