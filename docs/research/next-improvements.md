# What to improve next: accessibility, a slow phone, and forms

**Question:** After the desktop, typography, routes, portal and offline rounds, what should OpenFarm improve next in three areas the earlier notes did not cover? The areas are accessibility to WCAG 2.2 AA, speed on a low-end Android phone on a slow network, and how forms and feedback behave. What should change, and in what order?

**Researched:** 4 October 2026. Code read at `760112f3` on main. The production build of `apps/web` was run (`pnpm run build`, which is `vp build`). It finished in about 8 s with one warning: "Some chunks are larger than 500 kB after minification". Its output is in `apps/web/.output`, which is git-ignored.

**Sources.** Primary sources only. Every quote was read from the page's own HTML. None came through a summarizing fetch.

- W3C WCAG 2.2 and its Understanding documents.
- WAI-ARIA APG.
- web.dev, and Lighthouse's throttling document.
- The GOV.UK Design System.
- IBM Carbon.
- Shopify Polaris, read from its archived `.mdx` source on GitHub, because polaris.shopify.com now redirects.
- Atlassian.
- Fluent 2.

**The recommendations are this note's, not the sources'.** Where two systems disagree, the note says so. Contrast ratios were computed from the OKLCH tokens with the WCAG relative-luminance formula; a token with alpha was first composited over the surface it sits on. **[from code]** marks a finding read from source that was not watched in a browser.

**Skipped, because earlier notes cover it:** desktop layout, density, tables and the sidebar (`desktop-enterprise-design.md`), type (`english-typography.md`), routes (`route-naming-audit.md`), portal exposure, and offline capture. Most of the desktop note's list has since merged: input borders at 3:1, error toasts that stay, toasts top right, sticky table headings, the sidebar bar, and a remembered sidebar. Those are not raised again here.

---

## The answer, up front

**The foundations are sound:**

- every token pair used for text is above 4.5:1, light and dark;
- the skip link, `<main tabIndex=-1>` and scroll padding are in place;
- `prefers-reduced-motion` is honored app-wide;
- `lang` follows the reader's language;
- sign-in and the Shed Phone PIN both pass Accessible Authentication;
- routes are code-split;
- destructive acts mostly go through a confirmation dialog.

**What fails, or costs the most:**

1. **Two text-contrast failures** that the tokens do not show:
   - inactive tab labels are 4.25:1;
   - Sonner's `richColors` toasts are 3.07–4.36:1 in light mode.
2. **The language button's accessible name is not its visible word** (2.5.3, Level A). The word "English" also carries no `lang`.
3. **Every route ships about 495 KB of gzipped JavaScript before its own code.** That is three times web.dev's 170 KB example budget. About a third of it is both message catalogs, though a reader uses only one.
4. **The device cache rewrites itself on every query event, with no throttle.** It also holds every animal photo as base64. A 36px thumbnail fetches the full photo, up to 1280px.
5. **Forms hide what is wrong:**
   - about 80 of 87 forms gray out their button until they are ready;
   - 244 server refusals arrive as a toast instead of beside the form;
   - `FormField` links neither its hint nor an error to its control;
   - closing a sheet throws typed work away without asking.

---

## 1. Accessibility (WCAG 2.2 AA)

### 1.1 Contrast

**What the sources say.** 1.4.3: "text … has a contrast ratio of at least 4.5:1 … Large-scale text … at least 3:1". 1.4.11: UI components and graphics "at least 3:1 against adjacent color(s)" ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), "Success Criterion").

**What OpenFarm does.** These ratios were computed from the tokens in `packages/ui/src/styles/globals.css:69-175`.

| Pair                                                        | Light                                                 | Dark                          |
| ----------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- |
| muted-foreground on card / background / muted               | 7.06 / 6.58 / 6.20                                    | 7.24 / 7.80 / 6.46            |
| success, warning, danger, info on their own `-surface`      | 7.67 / 7.32 / 7.40 / 7.22                             | 7.25 / 7.51 / 5.68 / 6.84     |
| destructive text on `destructive/10` (badge, button)        | 7.07                                                  | 4.91 (on /20)                 |
| primary-foreground on primary                               | 9.39                                                  | 8.48                          |
| input border on card (since the desktop note)               | 3.6                                                   | 3.82                          |
| ring (focus border) on card                                 | 4.64                                                  | 5.77                          |
| **inactive tab label, `text-foreground/60`, on the ground** | **4.25** (4.36 on a card, 4.17 on muted)              | uses muted-foreground, passes |
| **Sonner `richColors` toast text on its background**        | **success 4.29, error 4.36, info 4.35, warning 3.07** | 6.6–12.3                      |

- **Tabs.** `TabsTrigger` is `text-foreground/60` in light mode (`packages/ui/src/components/tabs.tsx:61`). That applies to every `PageTabs` (`apps/web/src/components/page-kit.tsx:251`) and `SideTabs`. The text is 14px (15px in Bangla) at medium weight, which is not "large", so 4.5:1 applies.
- **Toasts.** `<Toaster … richColors>` (`apps/web/src/routes/__root.tsx:92-96`) swaps the app's popover colors for Sonner's own. These are `--success-text: hsl(140,100%,27%)` on `hsl(143,85%,96%)` and so on (sonner 2.0.8, `dist/styles.css`). The app's own `success` on `success-surface` is 7.67:1.
- **Exempt cases:**
  - disabled buttons, at 2.58:1, are exempt as inactive components;
  - the Step's empty "০" placeholder at `muted-foreground/50`, 2.28:1, is `aria-hidden` (`components/work/evidence-sheet.tsx:747`).

**Applies here as:**

- **Inactive tabs become `text-muted-foreground`,** which is 6.2–7.1:1.
- **Drop `richColors`.** Alternatively, map Sonner's `--success-bg`/`--success-text` (and the other three) onto the app's `-surface` and tone tokens in `packages/ui/src/components/sonner.tsx`, where `--normal-*` is already mapped.

### 1.2 Label in name, and language of parts

**What the sources say.**

- 3.1.1 (A): "The default human language of each web page can be programmatically determined."
- 3.1.2 (AA): "The human language of each passage or phrase in the content can be programmatically determined except for proper names, technical terms…" ([3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html), "Success Criterion").
- 2.5.3 Label in Name (A) asks that a control's accessible name contain its visible text. **[criterion text not re-fetched for this note]**

**What OpenFarm does.**

- **The page's language is right after hydration.** `document.documentElement.lang = language` (`i18n/language-provider.tsx:75-77`), and the CSS switches type on `html:lang(bn)` (`globals.css:271-284`).
- **The language button fails 2.5.3.** It shows "English" (or "বাংলা") but has `aria-label` "ভাষা বদলান" / "Change language" (`components/language-toggle.tsx:15-20`). A voice-control user who says "click English" reaches nothing. The visible word also has no `lang`, so a Bangla screen reader voice reads "English" as Bangla.
- **Bangla-only content in English mode has no `lang="bn"`.** About 50 places render a `.bn` field directly: ration names (`components/feed/feed-rations.tsx:502,646`), standard SOP names (`components/playbook/standard-sops.tsx:144-146`), and Step units (`evidence-sheet.tsx:756`). Some already do it right, for example `components/templates/said-field.tsx:33,48` and `components/portal/how-to-pay.tsx:55`.

**Applies here as:**

- Remove the toggle's `aria-label`. Keep `title`, and put `lang={next}` on the word.
- A small `<Bn>` / `<Said lang>` wrapper for any field that is always in one language.

### 1.3 Focus not obscured

**What the sources say.** 2.4.11: "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." "Typical types of content that can overlap focused items are sticky footers, sticky headers, and non-modal dialogs". A sticky notification "will fail this success criterion if it entirely obscures a component receiving focus". The fix is "C43: Using CSS scroll-padding" ([Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), "Intent", "Techniques").

**What OpenFarm does.**

- **The pinned top bar and the phone's bottom bar are covered.** There is `scroll-padding-top: 3.5rem`, and `scroll-padding-bottom` whenever the bottom bar is present (`globals.css:249-255`).
- **Error toasts now stay until closed** (`lib/toast.ts:11-16`). They sit top right at 64px from the top on a desk (`__root.tsx:92-96`), which is over the `PageHeader`'s right-hand actions. On a phone they span the top, over the top bar's buttons. A toast that stays can therefore hide the focused primary action or menu button. **[from code]**
- **A Step being worked hides the bottom bar** (`components/shell/app-shell.tsx:96-104`, `focusedWork`). It shows a sticky `StickyAction` instead, which holds the 48–56px buttons (`components/page.tsx:604-608`, `components/work/evidence-sheet.tsx:1097-1130`). No `scroll-padding-bottom` applies there, so a field just above the action can be tabbed to underneath it. **[from code]**

**Applies here as:**

- On a desk, move toasts to **bottom right**, which Fluent also allows. On a phone, keep them under the top bar.
- Give `html:has([data-slot="sticky-action"])` its own `scroll-padding-bottom`.

### 1.4 Target size

**What the sources say.** 2.5.8: "at least 24 by 24 CSS pixels". It makes exceptions for spacing (a 24px circle that touches no other target), an equivalent control, and inline links ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), "Success Criterion").

**What OpenFarm does.**

- **The smallest buttons used** are `icon-sm`, 32px (`packages/ui/src/components/button.tsx:31`). That covers:
  - the row menu ⋮ (`page-kit.tsx:454`);
  - the sheet and dialog close buttons (`sheet.tsx:69`, `dialog.tsx:71`);
  - the pager (`data-table.tsx:187,197`).
- **The checkbox** is 16px drawn, with an `after:-inset-x-3 -inset-y-2` hit area of 40×32 (`checkbox.tsx:12`).
- **Everything passes AA.** On a phone, where every other control is 44px, the row menu and the close buttons are the only 32px targets.

**Applies here as:** passes. Giving the row menu and close buttons `size-11 md:size-8` (44px on a phone) is a could.

### 1.5 Accessible authentication and redundant entry

**What the sources say.**

- **3.3.8.** No cognitive function test unless a "Mechanism" is offered. That includes "support for password entry by password managers … and copy and paste".
- **Verification codes.** "A service that requires manual transcription of a verification code is not compliant … it must be possible for a user to at least paste the code". Evaluating "only requires verification that the web content does allow pasting" ([Understanding 3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html), "Success Criterion", "Two-factor authentication systems").
- **3.3.7.** Information "required to be entered again in the same process is either: auto-populated, or available for the user to select" ([3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)).

**What OpenFarm does.**

- **Sign-in passes.** It uses `autoComplete="email"` and `"current-password"` (`components/sign-in-form.tsx:98,144`). The reset code is `one-time-code` (`forgot-password-form.tsx:91`). No field blocks paste anywhere: `onPaste` is not used in `apps/web/src`.
- **The Shed Phone passes.** The PIN is a real `type="password"` input under the pad, and pasted digits go the same way as tapped ones (`routes/shed-phone.tsx:384-391,429-437`). The device code accepts paste (`:312-327`). `autoComplete="off"` on a shared barn phone is a reasonable choice.
- **3.3.7.** No failure was found in the flows sampled (sale, intake, sign agreement). The Outbox's "Sent back" list asks the person to "put it in again" (`routes/_authenticated/outbox.tsx:83-90`; `outbox.heldHint`). That is a new process, so it falls outside 3.3.7, but pre-filling it would be kinder.

**Applies here as:** passes. A "put it in again" button that opens the form already filled is a could.

### 1.6 Errors and status announced

**What the sources say.**

- 3.3.1: "the item that is in error is identified and the error is described to the user in text".
- 4.1.3: status messages "can be programmatically determined … without receiving focus". A "Saved in 'Wedding' album" popup is the example ([4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), "Status message examples").

**What OpenFarm does.**

- **Sign-in and sign-up are the model.** They set `aria-invalid`, `aria-describedby` to an error `<p id>`, and validate on submit (`components/sign-up-form.tsx:60-75,108-130`).
- **`FormField` gives a label and a hint, and nothing else** (`page-kit.tsx:738-757`):
  - the hint is not tied to the control by `aria-describedby`;
  - there is no error slot.
- **Across the app, `aria-invalid`, `aria-describedby` and `aria-errormessage` appear 14 times in total.**
  - Some fields mark themselves invalid with no text attached, for example `components/feed/receive-feed-sheet.tsx:240`.
- **What `FormSheet`'s `missing` says goes in a `role="alert"` line at the sheet's foot,** and focus moves to the field (`page-kit.tsx:560-570,590-594`). The field itself is not marked.
- **Toasts are announced, even over a modal sheet.** Sonner's region is `aria-live="polite"`, and Base UI's modal leaves `[aria-live]` elements out of the `aria-hidden` it puts on the page (`@base-ui/react` `floating-ui-react/utils/markOthers.mjs:86-88`). That passes 4.1.3. While the sheet holds focus, its Retry and close cannot be reached by keyboard.
- **Every warning `Notice` is `role="alert"`, even one that is there when the page loads** (`components/page.tsx:516`). Each page with a standing warning interrupts the screen reader as it opens.
- **A loading skeleton says nothing to a screen reader** (`page.tsx:581`).

**Applies here as:** see §3. The kit change is one `FormField error` prop, which sets `aria-invalid` and `aria-describedby` on its child and draws the message under the field.

### 1.7 Dialogs

**What the sources say.**

- **Where focus goes.** "When a dialog opens, focus moves to an element contained in the dialog". For a step "not easily reversible, such as deleting data … set focus on the least destructive action". "When a dialog closes, focus returns to the element that invoked the dialog" ([APG Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), "Keyboard Interaction").
- **Which role.** An alert dialog is for "action confirmation prompts" ([APG Alert dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/), "About This Pattern").
- **Carbon:** "For destructive interactions, the "cancel" button takes focus" ([Carbon modal accessibility](https://carbondesignsystem.com/components/modal/accessibility/), "Focus handling").

**What OpenFarm does.**

- **On open.** Base UI moves focus to "the first tabbable element inside the popup", or to the popup itself on touch. On close it goes back to the "trigger or previously focused element" (`@base-ui/react` 1.8.0, `dialog/popup/DialogPopup.d.ts:13-34`). In `ConfirmDialog` the close ✕ comes after the footer (`dialog.tsx:64-77`), so the first tab stop is **Cancel**. That matches APG and Carbon.
- **Role.** `ConfirmDialog` is a plain `dialog` (`page-kit.tsx:664-707`). Base UI has an `AlertDialog`.
- **Return after a menu.** Whether focus comes back correctly when the dialog was opened from a `RowMenu` item, which unmounts as the menu closes, was not checked in a browser.

**Applies here as:** passes. Moving `ConfirmDialog` onto `AlertDialog` is a could.

### 1.8 Already at the standard

- the skip link (`__root.tsx:166-182`);
- reduced motion (`globals.css:311-318`); the one exception is JS `scrollIntoView({behavior:"smooth"})` in `FormSheet` (`page-kit.tsx:568`), which ignores it, and 2.3.3 is AAA anyway;
- heading levels: `PageHeader` h1 and `Section` h2 (`page.tsx:140,200`);
- `aria-sort` on tables;
- `aria-current` in the bottom bar;
- `Notice` carries its word and icon, not color alone;
- the 3:1 input borders.

---

## 2. Performance on a low-end phone on a slow network

**What the sources say.**

- **Core Web Vitals.** "LCP should occur within 2.5 seconds … INP of 200 milliseconds or less … CLS of 0.1", measured at "the 75th percentile of page loads" ([web.dev Web Vitals](https://web.dev/articles/vitals), "Core Web Vitals"). "An INP above 500 milliseconds means a page has poor responsiveness" ([INP](https://web.dev/articles/inp), "What is a good INP score?").
- **Budgets.** "Under 170 KB of critical-path resources (compressed/minified)". "Our home page must load and get interactive in < 5 s on slow 3G on a Moto G4" ([Performance budgets 101](https://web.dev/articles/performance-budgets-101), "Establish a baseline", "Examples of budgets").
- **Lighthouse's mobile preset:** "Latency: 150ms / Throughput: 1.6Mbps down", with "a constant 4x CPU multiplier" ([throttling.md](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md)).
- **Code splitting:** "only send the code needed for the initial route" ([Code splitting](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting), "Measure").
- **Fonts.** "Use font-display: swap but make sure to deliver the font early enough that it does not cause a layout shift". "preload ignores unicode-range declarations" ([Font best practices](https://web.dev/articles/font-best-practices), "Choose an appropriate font-display strategy", "Be cautious when using preload").

**What the build gives.** These figures were measured from `.output/public/assets`. The route chains come from `.output/server/_tanstack-start-manifest_*.mjs`: each route's `preloads`, plus its parents'. They were gzipped locally with Node's zlib.

| Loaded                                                  | JS gzip     | JS raw        | Files   |
| ------------------------------------------------------- | ----------- | ------------- | ------- |
| `__root__` alone (every page)                           | 495 KB      | 1.73 MB       | 62      |
| `/_authenticated/home`                                  | 507 KB      | 1.77 MB       | 67      |
| `/work/` and `/work/$instanceId`                        | 520, 523 KB | 1.80, 1.81 MB | 79, 83  |
| `/shed-phone`                                           | 507 KB      | 1.76 MB       | 76      |
| `/sign-in` (signed out)                                 | 538 KB      | 1.89 MB       | 71      |
| `/animals/$tagNumber`, `/ventures/$ventureId` (largest) | 546, 555 KB | 1.88, 1.93 MB | 100, 98 |
| CSS, one file, render-blocking                          | 28 KB       | 177 KB        | 1       |

- **Routes are code-split.** There are 328 JS chunks, and a route's own code is 0–52 KB gzip. What is not split is the root.
- **The two biggest chunks are in the root:**
  - **`language-provider-*.js`: 260 KB gzip, 1.02 MB raw.**
    - It contains `@OpenFarm/i18n`. `translate.ts:4-5` imports **both** `messages/bn.ts` (478 KB of source, 91 KB gzip) and `messages/en.ts` (289 KB, 80 KB gzip).
    - A reader uses one of the two, and the other is about 80–90 KB gzip of pure waste.
    - The rest of the chunk is the auth client and Sonner, among others (inferred from strings).
  - **`index-*.js`: 109 KB gzip.** This is React DOM, the router and Query.
- **The entry also pulls in about 60 more chunks statically.** Among them are `data-table`, `page-kit`, `dropdown-menu`, `venture`, `months`, `giving-less` and many icons (the `__root__.preloads` list). A signed-out person on `/sign-in` downloads the Ventures and data-table code. Why each one is in the entry's static graph was not traced. A likely path is `router.tsx:6` importing `components/not-found.tsx`, which imports `page.tsx`, but that is unconfirmed.
- **`sign-in-*.js`, 37 KB gzip, carries zod** (284 `_zod` matches). **`phone-*.js`, 36 KB gzip, is libphonenumber-js** with every country's metadata. It loads on the portal's sign-in and join pages (`packages/domain/src/phone.ts`).
- **What this means on Lighthouse's network.** At 1.6 Mbps, 495 KB takes about **2.5 s** to transfer, before any round trip or parse. That is roughly 3× the 170 KB example budget. The pages are server-rendered, so text can paint before the JS arrives. Taps wait for hydration, which means parsing and running 1.7 MB of JS on a 4×-slowed CPU. No INP or LCP was measured.
- **Fonts.**
  - Self-hosted WOFF2 with `unicode-range` and `font-display: swap` (`globals.css:4,15-57`).
  - In Bangla, a page fetches the Noto Bengali glyph subset (108 KB) and its Latin subset (26 KB).
  - In English it fetches Inter's Latin `opsz` subset (73 KB). The language button's "বাংলা" alone is enough to pull in the 108 KB Bengali subset (inferred from the `unicode-range`).
  - No font is preloaded, so each is found only after the CSS is parsed, and then swaps in.
- **The language flips after hydration. [from code]**
  - The server renders `<html lang="bn">` and Bangla text for everyone (`__root.tsx:67`).
  - `LanguageProvider` learns the reader's choice only in the browser, from `localStorage` or the session (`language-provider.tsx:65-77`).
  - An English reader sees the page in Bangla, then re-rendered in English. That costs a layout shift, since Bangla sizes are larger (`globals.css:271-281`), and a later LCP.
- **Photos.** This is the largest network cost found. **[from code]**
  - `AnimalPhoto` asks `animals.photo`, which returns the stored photo whole, as base64 in JSON (`packages/api/src/routers/animals.ts:1534-1550`). Stored photos are up to 1280px at JPEG quality 0.7 (`apps/web/src/lib/photo.ts:3-7`).
  - The herd list draws them at 36 or 44px, up to 50 a page (`components/animal/herd-list.tsx:18,67,140`). The work board draws them at 64px (`components/work/work-board.tsx:382`).
  - A 1280×960 photo at that quality is commonly 100–250 KB, which is about 130–330 KB once base64-encoded **[estimate, not measured]**. A herd page full of photos could then be several megabytes.
  - The service worker never caches `/api/` (`public/sw.js:97-99`), so the photo cache is only the query cache below.
- **The device cache. [from code]**
  - `persistQueryClient` is given a hand-written persister (`lib/query-cache.ts:105-117,166-172`). TanStack's `persistQueryClientSubscribe` calls `persistClient` on **every** `added`, `removed` or `updated` event in the query and mutation caches, with no throttle (`@tanstack/query-persist-client-core` 5.102.8, `build/modern/persist.js:7-13,58-64`).
  - Each call dehydrates every successful query and `JSON.stringify`s it with a replacer. That includes 14 days of answers (`gcTime`, `utils/orpc.ts:77`) and every photo above. The result is written to IndexedDB.
  - A page that loads ten queries does this dozens of times on the main thread, which is exactly when INP is measured.
  - TanStack's packaged storage persisters throttle these writes **[not re-read for this note]**.
  - Restoring parses the whole cache with a reviver (`query-cache.ts:60-72`).
- **The service worker** (`public/sw.js`) helps repeat loads:
  - **Build assets are cache-first** (`:69-80`), so a second visit fetches no JS.
  - **Navigations are network-first with no timeout** (`:82-90`). On a connection that is up but crawling, the page waits for the network until the request fails.
  - **The asset cache never prunes old hashed files** (`openfarm-assets-v3`, `:13`). It grows by about 1–5 MB per deploy, until the name is bumped.

**Applies here as:**

- **Thumbnails.** Store a small rendition (about 160px) beside each photo and send that to lists. Keep `animals.photo` out of the persisted cache.
- **Throttle the device cache.** Write at most once every 1–2 s, and only after the cache goes idle.
- **Load one catalog.** Split `bn` and `en` into their own chunks and load the reader's one. Then find what pulls `data-table`, `page-kit` and the Venture words into the entry. Aim for a root under about 250 KB gzip on the way to 170.
- **Server-render the language.** Read it from a cookie written next to `localStorage`, so the first paint is in the reader's language.
- **The service worker.** Give navigations a 3–4 s timeout before falling back to the cached shell. Prune `ASSETS` on `activate` down to the files the current shell references.
- **Fonts and libraries (could):**
  - preload the Bengali subset on `lang="bn"` pages only;
  - use BD-only libphonenumber metadata.

---

## 3. Forms and feedback

**What the sources say.**

- **Where an error goes.**
  - GOV.UK: "put the message in red after the question text and hint text". "Do not clear any form fields when showing the Error message component". Use an error summary "at the top of a page", and "move keyboard focus to the error summary" ([Error message](https://design-system.service.gov.uk/components/error-message/), "How it works"; [Error summary](https://design-system.service.gov.uk/components/error-summary/)).
  - Polaris: "Place the error close to what needs fixed". "Avoid error jargon like "invalid"" (`content/error-messages.mdx`). "Avoid using toast for error messages" (`toast.mdx`, quoted in the desktop note).
- **Wording.** GOV.UK: do not use "'please'" or "'valid' and 'invalid'". Avoid "'This field is required'". Use an instruction such as "'Enter your name'" for an empty field (Error message, "Be clear and concise", "Be specific").
- **When to validate. The systems disagree here.**
  - GOV.UK: "Do not validate when the user moves away from a field. Wait until they try to move to the next part … usually by clicking the 'continue' or 'submit' button" ([Validation](https://design-system.service.gov.uk/patterns/validation/)).
  - Carbon: inline validation "should happen as soon as the field loses focus" ([Forms pattern](https://carbondesignsystem.com/patterns/forms-pattern/), "Errors and validation").
  - Polaris: an inline error should "Be removed as soon as the input is valid" (`inline-error.mdx`).
- **Required and optional. The systems disagree here too.**
  - GOV.UK: "add '(optional)' to the labels of optional fields … Never mark mandatory fields with asterisks" ([Question pages](https://design-system.service.gov.uk/patterns/question-pages/)).
  - Carbon: mark the minority, "(optional)" or "(required)" (Forms pattern, "Optional vs. mandatory").
  - Atlassian requires an asterisk with the legend "Required fields are marked with an asterisk *" ([Form usage](https://atlassian.design/components/form/usage), "Required fields").
- **Disabled buttons.**
  - GOV.UK: "Disabled buttons have poor contrast and can confuse some users, so avoid them if possible" ([Button](https://design-system.service.gov.uk/components/button/)).
  - Carbon: "For longer forms, do not disable primary action buttons" (Forms pattern).
  - Atlassian: "Never disable a submit button, even if all of the required fields aren't filled in" (Form usage).
  - Polaris: "The surrounding interface should make it clear why the button is disabled" (`button.mdx`).
- **Unsaved changes.**
  - Fluent: alert dialogs are for "potential loss, like unsaved changes or confirming destructive actions" ([Fluent dialog](https://fluent2.microsoft.design/components/web/react/core/dialog/usage), "Types").
  - Polaris's modal example is "Discard unsaved changes?" (`deprecated/modal.mdx`).
  - Atlassian: "Persist forms on refresh so user data isn't lost" (Form usage).
- **Destructive acts.** Carbon's danger modal is "a confirmation for an action that would result in a significant data loss" ([Modal usage](https://carbondesignsystem.com/components/modal/usage/), "Danger modal"). No system read here asks for type-to-confirm.
- **Success.**
  - Carbon toasts "can timeout … after five seconds" (Notification usage, "Dismissal").
  - Atlassian's auto-dismiss flag goes "after eight seconds", and "Never use auto dismiss flags for any critical warning or error messages" ([Flag](https://atlassian.design/components/flag/usage)).

**What OpenFarm does.**

- **Three form shells.** There are 43 `FormSheet`s, 44 `FormDialog`s and 13 `ConfirmDialog`s.
- **Most forms gray their button until they are ready.**
  - `FormDialog` always does (`page-kit.tsx:649`).
  - `FormSheet` does unless it is given `missing` (`:602`), and only 4 of the 43 are: sale, internal sale, sign agreement and buy-what-is-left.
  - So about 80 of the 87 forms do it, and nothing next to them says why.
  - The `missing` sheets do what GOV.UK and Atlassian ask. They stay pressable, say what is missing and move focus to it (`:560-570`). The message goes in the footer rather than at the field.
- **Validation timing** is on submit wherever it is visible: sign-up's zod `onSubmit` and `missing` after a press. That is GOV.UK's rule.
- **Server refusals arrive as a toast.** `useRefused` wraps 244 save paths (`lib/refused.ts:14-19`). The toast is top right, outside the sheet. While the sheet keeps focus it is out of keyboard reach, and it is not beside any field.
- **Error wording is mostly to GOV.UK's rules.** For example "Name must be at least …" and "Password must be at least …" (`messages/en.ts:848-853`). There are two departures:
  - "Enter a valid email address" (`:844`) uses "valid";
  - `common.error`, "Something went wrong", is used in 20 places.
- **Required and optional are not marked consistently.**
  - No field anywhere carries a required mark, though `required` appears 84 times.
  - "(optional)" appears in eight labels.
  - A `FormDialog` has no `noValidate`, so its `required` boxes would give the browser's own bubble, in the phone's language. The grayed button means it is never reached.
- **Nothing guards unsaved changes.** Cancel, ✕, Escape and a tap outside all call `onOpenChange(false)` (`page-kit.tsx:596-601`).
  - Some sheets keep their state in a parent that stays mounted, so the draft survives (`components/people/invite-sheet.tsx:117-122`).
  - Others reset on close (`components/drugs/drug-products.tsx:774-778`).
  - Which sheets do which was not mapped.
- **Destructive acts are confirmed.**
  - Retire acts go through `ConfirmDialog` or `retire-confirm.tsx`. Revoking a phone goes through `RevokeDialog` (`components/devices/phone-table.tsx:260-275`).
  - Retire, never delete, is the farm-list rule.
  - The Outbox's "Done with this" removes a sent-back entry without asking (`routes/_authenticated/outbox.tsx:83-90`).
- **Success.** There are 141 `toast.success` calls at Sonner's 4 s, which is in line with Carbon's 5 s and Atlassian's 8 s. They are announced through Sonner's live region.

**Applies here as:**

- **One error model in the kit, after GOV.UK, since it matches what the app already does on submit:**
  - `FormField error` draws the message under the hint and wires `aria-invalid` and `aria-describedby`.
  - `FormSheet`/`FormDialog` gain a `refused` slot at the **top** of the body, using the `Notice` the app already has. `useRefused` fills it when a sheet is open, and falls back to the toast otherwise.
- **Make `missing` the default.** Every `FormSheet` and `FormDialog` stays pressable, says what is missing and focuses it, and the field gets its own `error`. Carbon's long-form rule and Atlassian's "never disable" agree.
- **Mark the optional fields, not the required ones.** Most farm forms are mostly required, so GOV.UK and Carbon agree; this departs from Atlassian. Use `FormField optional`, which appends "(optional)" / "(ঐচ্ছিক)", and replace the eight hand-written labels.
- **Ask before throwing work away.** When a sheet or dialog with any typed field is dismissed, show "Discard what you typed?" in an `AlertDialog`, with Keep editing first.
- **Wording.** Replace "valid" in `auth.invalidEmail`. Give the 20 `common.error` toasts the specific word for what failed.
- **Toasts.** Leave success at 4 s. Errors already stay.

---

## Audit table

Paths are under `apps/web/src/` unless they start `packages/`. "§" points to where the standard is quoted.

| #   | Where                                                                                                        | Now                                                                           | Standard                                                     | Severity | Fix                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `packages/ui/src/components/tabs.tsx:61`                                                                     | Inactive tab text 4.25:1 (light)                                              | WCAG 1.4.3, 4.5:1 (§1.1)                                     | **must** | `text-muted-foreground` in place of `text-foreground/60`                                                    |
| 2   | `routes/__root.tsx:95`; `packages/ui/src/components/sonner.tsx`                                              | `richColors` toasts 3.07–4.36:1 (light)                                       | WCAG 1.4.3 (§1.1)                                            | **must** | Drop `richColors`, or map `--{success,error,warning,info}-{bg,text,border}` to the app's tokens (7.2–7.7:1) |
| 3   | `components/language-toggle.tsx:15-20`                                                                       | `aria-label` "Change language" over visible "English"; no `lang`              | WCAG 2.5.3 (A); 3.1.2 (§1.2)                                 | **must** | Drop `aria-label`, keep `title`; `<span lang={next}>`                                                       |
| 4   | `lib/query-cache.ts:105-117,166-172`                                                                         | Whole cache stringified and written on every query event                      | web.dev INP ≤200 ms (§2)                                     | **must** | A throttled persister (1–2 s, trailing); measure write time on a mid phone                                  |
| 5   | `packages/api/src/routers/animals.ts:1534-1550`; `components/animal-photo.tsx:18-35`; `herd-list.tsx:67,140` | 36–64px thumbnails fetch the full ≤1280px photo as base64; kept on the device | web.dev budgets (§2)                                         | **must** | Store and serve a ~160px thumbnail for lists; `shouldDehydrateQuery` skips `animals.photo`                  |
| 6   | `packages/i18n/src/translate.ts:4-5`                                                                         | Both catalogs (~171 KB gzip) in every page's root chunk                       | "only send the code needed" (§2)                             | should   | Per-language chunks (`import()` by language, the default one inlined for SSR)                               |
| 7   | Entry `__root__.preloads` (62 files, 495 KB gzip)                                                            | data-table, page-kit, Venture words, etc. on `/sign-in`                       | 170 KB critical path (§2)                                    | should   | Trace with a bundle visualizer; cut the static path from `router.tsx` / `not-found.tsx`                     |
| 8   | `routes/__root.tsx:67`; `i18n/language-provider.tsx:65-77`                                                   | SSR always Bangla; English readers re-render after hydration                  | CLS ≤0.1, LCP (§2); 3.1.1                                    | should   | Language cookie read in SSR; `lang` written by the server                                                   |
| 9   | `components/page-kit.tsx:738-757`                                                                            | `FormField` hint not linked; no error slot                                    | WCAG 3.3.1, 4.1.3; GOV.UK error message (§1.6, §3)           | should   | `error` and `optional` props; `aria-describedby` for hint and error                                         |
| 10  | `lib/refused.ts:14-19` (244 uses)                                                                            | Server refusals as a toast outside the open sheet                             | Polaris "avoid toast for errors"; GOV.UK summary at top (§3) | should   | A `refused` slot at the top of `FormSheet`/`FormDialog`, filled while open                                  |
| 11  | `page-kit.tsx:602,649`                                                                                       | ~80 of 87 forms gray out the act                                              | GOV.UK, Carbon (long forms), Atlassian (§3)                  | should   | `missing` on every form, with field errors                                                                  |
| 12  | `page-kit.tsx:596-601`, `FormDialog`                                                                         | Dismissing drops typed work, with no question                                 | Fluent alert dialog; Polaris "Discard unsaved changes?" (§3) | should   | A dirty flag on the form shell, plus `AlertDialog` "Discard?" with Keep editing focused                     |
| 13  | `__root.tsx:92-96`; `lib/toast.ts:11-16`                                                                     | Persistent error toasts over the header actions (desk) or the top bar (phone) | WCAG 2.4.11 (§1.3)                                           | should   | Bottom right on a desk; check in a browser at 1280/375                                                      |
| 14  | `components/page.tsx:604-608` with `focusedWork`                                                             | No scroll padding for `StickyAction`                                          | WCAG 2.4.11, C43 (§1.3)                                      | should   | `data-slot="sticky-action"` and `html:has(...) { scroll-padding-bottom }`                                   |
| 15  | `public/sw.js:82-90`                                                                                         | Network-first navigation with no timeout                                      | — (repeat-load speed)                                        | should   | Race the network against 3–4 s, then serve the cached shell                                                 |
| 16  | `feed/feed-rations.tsx:502,646`; `playbook/standard-sops.tsx:144`; ~50 `.bn` sites                           | Bangla shown in English mode without `lang="bn"`                              | WCAG 3.1.2 (§1.2)                                            | should   | A `<Said lang>` wrapper                                                                                     |
| 17  | `messages/en.ts:844`; 20 × `common.error`                                                                    | "valid"; "Something went wrong"                                               | GOV.UK wording (§3)                                          | could    | "Enter an email address like name@example.com"; specific words per act                                      |
| 18  | `page-kit.tsx:664-707`                                                                                       | `ConfirmDialog` is `role="dialog"`                                            | APG alertdialog (§1.7)                                       | could    | Base UI `AlertDialog`                                                                                       |
| 19  | `page.tsx:516`                                                                                               | Every warning `Notice` is `role="alert"`, even on load                        | APG / 4.1.3 intent (§1.6)                                    | could    | `role="status"` unless it appears after an act                                                              |
| 20  | `page.tsx:581`                                                                                               | Skeleton silent to a screen reader                                            | 4.1.3 (§1.6)                                                 | could    | `aria-busy` on the region and an sr-only "Loading"                                                          |
| 21  | `public/sw.js:13,40-50`                                                                                      | Old hashed assets never pruned                                                | —                                                            | could    | On `activate`, delete `ASSETS` entries the new shell does not reference                                     |
| 22  | `packages/ui/src/styles/globals.css:15-57`                                                                   | No font preload; swap after the CSS                                           | web.dev font best practices (§2)                             | could    | Preload the Bengali subset on `lang="bn"` pages only (preload ignores `unicode-range`)                      |
| 23  | `packages/domain/src/phone.ts`                                                                               | libphonenumber full metadata, 36 KB gzip, on portal sign-in/join              | §2                                                           | could    | BD-only (or `min`) metadata                                                                                 |
| 24  | `page-kit.tsx:454`; `sheet.tsx:69`; `dialog.tsx:71`                                                          | 32px menu and close targets on a phone                                        | Passes 2.5.8; app's own 44px phone rule                      | could    | `size-11 md:size-8`                                                                                         |
| 25  | `routes/_authenticated/outbox.tsx:83-90`                                                                     | Sent-back entries are re-typed by hand                                        | 3.3.7 spirit (§1.5)                                          | could    | "Put it in again" opens the form already filled                                                             |

**Already at the standard:**

- token contrast, and the 3:1 input borders;
- the skip link and scroll padding under the bars;
- reduced motion;
- `lang` switching on the client;
- sign-in, reset code and PIN (paste allowed, autocomplete);
- target sizes at AA;
- dialog initial focus on Cancel;
- toasts announced through a modal;
- on-submit validation timing;
- confirmation before retiring;
- error toasts that stay;
- routes split per page;
- cache-first hashed assets.

---

## Ranked list

**Must**

1. **Text contrast.** Fix the inactive tabs and the toast colors (audit 1–2). These are two small changes in `packages/ui`. Check `/money` tabs and one success, error and warning toast, light and dark.
2. **The language button's name and `lang`** (audit 3).
3. **Throttle the device cache, and keep photos out of it** (audit 4).
   - Before: time `persistClient` on `/animals` with Chrome's 4× CPU throttle.
   - After: confirm the writes fall to about one a second.
4. **Thumbnails for lists** (audit 5). This needs a migration for the smaller rendition, or a resize on read.

**Should**

5. **One catalog per reader, and a smaller entry** (audit 6–7). Re-run the size script after each change. The target is a root under 250 KB gzip.
6. **The language rendered on the server** (audit 8).
7. **The kit's error model** (audit 9–11): field errors and `optional`, a refusal slot at the top of a sheet, and `missing` everywhere. One kit change, then the forms one area at a time.
8. **Ask before discarding typed work** (audit 12).
9. **Focus not hidden** (audit 13–14), checked in a browser.
10. **A navigation timeout in the service worker** (audit 15).
11. **`lang="bn"` on Bangla-only content** (audit 16).

**Could**

12. Wording (audit 17).
13. `AlertDialog`, `Notice` roles, and the loading status (audit 18–20).
14. Pruning the service worker, the font preload, and phone metadata (audit 21–23).
15. 44px targets on a phone, and the Outbox's "put it in again" (audit 24–25).

---

## What could not be confirmed

- **Nothing here was measured in a browser or on a phone.** There are no LCP, INP or CLS figures. The transfer times are arithmetic on Lighthouse's 1.6 Mbps. Focus-obscured cases (audit 13–14) and focus return after a row menu are read from code.
- **The photo sizes are estimates.** Stored photos were not sampled from the database.
- **Why each of the ~60 chunks is in the entry's static graph** was not traced. The `not-found.tsx` → `page.tsx` path is a guess.
- **That TanStack's packaged storage persisters throttle their writes by default** was not re-read for this note.
- **WCAG 2.5.3's criterion text** was not fetched for this note; the claim rests on its well-known wording.
- **Contrast for Sonner's colors** used sonner 2.0.8's CSS values. Whether `cn-toast` or the `shadcn/tailwind.css` import overrides them was checked only by grep; no override was found.
- **Which sheets keep a draft after closing** (audit 12) was sampled, not mapped.
