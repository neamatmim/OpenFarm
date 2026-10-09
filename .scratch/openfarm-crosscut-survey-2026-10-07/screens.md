# The screens as a Bangla reader on a cheap phone meets them (2026-10-07)

Reviewer U, main at 22b479da, seed server on 127.0.0.1:3002, signed in as the Owner, in Bangla.

The screens hold up well on words: no English JSX text, no English attribute, the Bangla catalog complete (5,013 keys, only brand and technical words left in Latin letters), and every figure on 54 pages swept at phone width in Bangla numerals except tags, phones and account references. What does not hold is underneath the words. The worst is the shed's own screen: once the phone goes offline, a Step tapped on the work page is never written to the Outbox. React Query parks it as a paused mutation (U1, proven with the app's own QueryClient). Sightings and Moves choose their road by `navigator.onLine`, so "bars but no data" sends them to the server and loses them (U2). A screen not opened since the last deploy is not on the phone at all (U3). Second, the server's English still reaches the reader through one fallback: validation failures, failed connections and about 60 refusals that carry no word (U5). Third, at 360px the top bar cuts the sync status to one letter (U9), dialogs cannot scroll past the screen (U10), and page tabs are 25px tall against the kit's 44px rule (U11). The first shed screen costs about 720 KB on the wire and 1.8 MB of JavaScript to run (U15).

How phone width was looked at: Chrome here will not narrow below 1864px and the app refuses framing (`frame-ancestors 'none'`). So every CSS media rule was re-evaluated at 360px wide, with a coarse pointer and no hover, and `body` was made a 360×740 box (360×640 for the dialog check). Then each page was measured for text cut, boxes off the screen, sideways scrollers, small controls and Latin text. Screenshots were taken of the 360px strip. The JS `useIsMobile` hook did not flip, so the sidebar trigger stayed; everything else was the phone layout.

### Working with no signal

1. **U1. Proven, high.** On the work page, a Step tapped with the phone offline is never recorded: not on the screen, not in the Outbox. `recordStep`, `claimInstance` and `finishInstance` only write to the phone's own Outbox, but they run inside `useMutation` with React Query's default `networkMode: "online"`. `utils/orpc.ts:72-87` gives a network mode to queries only. Once the browser fires `offline`, which is what a phone does on walking into a shed with no coverage, each mutation is parked as paused. Its `mutationFn` never runs, so the tile does not turn green and the evidence sheet just sits there: no spinner, no word. The milker cannot move to the next cow, because that happens in `onSuccess`. A second tap parks a second copy. If the tab is discarded before signal returns, the work is gone, which is the one failure ADR 0002 exists to prevent. Proven in the seed app's own page: after an `offline` event, a mutation on `__TSR_ROUTER__.options.context.queryClient` whose function only counts stayed `pending, isPaused: true` with its function run 0 times. Also proven in a node script against query-core 5.102.8 with the app's default options. Places: `routes/_authenticated/work/$instanceId.tsx:121-163` (claim, finish, record), `components/work/pass-the-rest-well.tsx:49-74`. What it should do: work the phone keeps runs whatever the network says. Use `networkMode: "always"` on these mutations, or call `recordStep` outside React Query.

2. **U2. Proven/Traced, medium-high.** A sighting or a Move made with signal bars but no data is lost, with English on the screen. The dialogs choose the road by `navigator.onLine`, which is true whenever the phone has any connection. So they call the server, the fetch fails ("Failed to fetch", in English, via `sayWhy`) or hangs on a crawling line, and nothing goes to the Outbox. The person has to type it again later. Places: `components/report-sighting.tsx:52-63`, `components/animal/move-dialog.tsx:61-74`, `components/animal/weight-moves-tab.tsx:62`, `components/animal/group-move.tsx:76-83`. What it should do: put the sighting or Move into the Outbox first, as Steps are (the Outbox already sends at once when it can). At the least, fall back to the queue when the send fails for want of a network.

3. **U3. Traced (build), medium-high.** After a deploy, a screen not yet opened with signal cannot be opened offline. The service worker caches the shell pages (`/`, `/work`) and whatever asset the page happens to fetch (`public/sw.js:15,61-80`). Route components are lazy chunks, and the router has no `defaultPreload` (`src/router.tsx`). In the build, the work page's component is `assets/_instanceId-rLQdRpL1.js` (30 KB), fetched only from its route stub. So a Shed Phone that loads the new build at the office and then walks into the parlour gets the failed-page screen on the first work card it taps. `PageFailed` is in Bangla, but the morning's milking cannot be recorded. Also, the asset cache (`openfarm-assets-v3`) is never trimmed. Every deploy adds about 1.8 MB of old chunks on a phone with little storage. What it should do: once a new worker installs, precache the build's chunks for the shed routes (work, work/$instanceId, animals, shed-phone, outbox), and drop assets the current build no longer names.

4. **U4. Traced, medium.** A milker cannot correct a figure she has just entered (11 L typed for 1.1 L) until there is signal. Recording the same Step again is a Correction, and `correctStep` is an online mutation (`routes/_authenticated/work/$instanceId.tsx:173-193,315-336`). Offline it parks as in U1, with no word. With signal but the first entry still unsent, the server does not know the Completion it is asked to correct. What it should do: while the first entry is still on the phone, replace it on the phone. After that, hold the Correction in the Outbox behind it.

5. **U16. Traced, low-medium.** Any other form saved with no network (the Manager's death, dose not prescribed, a Sale at the market) waits as a paused mutation with only a spinner on its button and no word that it waits for signal. Closing the sheet while it waits skips the "close without saving?" question (`components/page-kit.tsx:739-745`, `changed && !pending`). The save then goes later, unseen, or never if the tab closes. What it should do: tell the reader in words that there is no signal and the form was not saved, and keep the form open.

### English a Bangla reader meets

6. **U5. Proven, medium.** When the farm refuses something without a refusal word, the reader gets the server's English. `sayWhy` falls back to `error.message` (`lib/saying.ts:59-71`), and the work page and the pass-the-rest sheet do the same by hand (`routes/_authenticated/work/$instanceId.tsx:113-116`, `components/work/pass-the-rest-well.tsx:73`). Three sources reach it:
   - **Input checks.** A figure the screen allows but the schema refuses answers "Input validation failed", with only `issues` and no word. This was proven on the seed: `animals/get` with a number for the tag answered 400 "Input validation failed".
   - **Connection failures.** A failed connection reads "Failed to fetch" on every online-only form (see U2).
   - **Refusals with no word.** 64 `ORPCError` throws carry no refusal word, leaving out sign-in and not-found. Reachable examples:
     - `push-store.ts:214` "That browser is already listening for somebody else", met when a second person turns notifications on in a shared phone's browser (`settings.tsx:95`)
     - `routers/vet-cases.ts:127` "That vet already has a case open on her"
     - `routers/sops.ts:625` "That person was already marked as trained on this version"
     - `routers/work.ts:749` "This work is not overdue yet"
     - `herd-store.ts:748,811,914` "This animal has already left the farm" (and its kin), met from a page a minute stale
     - `routers/stock.ts:53`
     - the web's own `lib/record-offline.ts:42` "This device cannot keep work; nothing was recorded"

   The guard `i18n/unworded-refusals.test.ts` reads only throws that carry `refusal: "…"`, so none of these is on its list. What it should do: give the kit words for "the farm will not take this figure" and for "no signal, not saved". Make the last resort `common.error` rather than the message. Widen the guard to throws without a word.

7. **U6. Traced, low-medium.** The Outbox's "Sent back" card and the Needs Review line for a held entry show a choice answer by its code word: `positive`, `negative`, `ai`, `natural`, `assisted`, `vet_called`, `not_hot` (the standard Playbook's values, `packages/domain/src/standard-playbook.ts`). Places: `routes/_authenticated/outbox.tsx:47-56` (`String(value)`), `components/needs-review.tsx:73-82`. What it should do: show the Step's own choice label in the reader's language ("গর্ভবতী"), as the evidence sheet does.

8. **U7. Proven, low.** Two English words reach a screen reader:
   - **The toast region.** On every page it is announced as "Notifications alt+T", Sonner's default `containerAriaLabel`, not set in `components/app-toaster.tsx`.
   - **The PIN pad.** Each key's `aria-label` is an ASCII digit (`routes/shed-phone.tsx:155,163`) while the key shows a Bangla one.

### The screen at 360px

9. **U9. Proven, medium.** On a phone the top bar cuts the sync status to its first letter. The status is the one thing a shed phone must say: what is waiting and since when.
   - **What gets cut.** "সব পাঠানো হয়েছে" shows as "স…". The waiting form "৭ অক্টোবর, ২০২৬ ০৫:৪০ থেকে ১২টি পাঠানো বাকি" shows as "৭…": 22px of 306px. The pill is 72px wide, while the language toggle "English" takes 96px and the theme button 44px. Screenshot: `screens-sync-pill-360.png`.
   - **Hover-only and small.** When it was last sent shows only in a hover `title` (`components/sync-banner.tsx:213`) or at `lg` (`:228`), so a phone never shows it. The pill's "try again" is a 28px icon (`sync-banner.tsx:240-251`, `size-7`). The "Sent back" link is the cut label itself.
   - **Places:** `components/shell/top-bar.tsx:18-28`.

   What it should do: on a phone, give the status the bar, and move language and theme into the account menu or More. Say the waiting count first ("১২টি বাকি"). Make the retry key 44px.

10. **U10. Proven, medium.** Dialogs cannot be scrolled when they are taller than the screen. `DialogContent` is fixed and centred, with no `max-h` or overflow (`packages/ui/src/components/dialog.tsx:62-66`), and `FormDialog`'s body does not scroll (`components/page-kit.tsx:933-950`). The shed's own "যা দেখছেন জানান" (report a sighting) dialog is 726px tall. On a 360×640 screen its top sits at −43px: the title naming the cow and the close button are above the screen, and Cancel is below it. With the keyboard up for the note, Save is hidden too. There are 50 FormDialogs. The fullest are cash hand-over, notifiable disease, wage draw, feed item, write off Lost, and dose not prescribed. What it should do: `max-h-[calc(100dvh-2rem)]` on the content, with the fields scrolling between a pinned header and footer, as FormSheet does.

11. **U11. Proven, low-medium.** Page tabs are 25px tall on a phone. `PageTabs` asks for `h-11` (`components/page-kit.tsx:333`), but the kit's `group-data-horizontal/tabs:h-8` (`packages/ui/src/components/tabs.tsx:27`) is more specific and wins. That gives a 32px list with 25px triggers on the animal page, Money, Feed, Milk, the day, Overview, Sales, Sign-off and Medicines. The row scrolls sideways with no cue: on the animal page 605px sits in 360, "ওজন…" is cut at the edge, and "টাকা ও কাগজপত্র" is out of sight.

12. **U12. Proven, low.** Bangla labels are cut with "…" where English fits, in figure grids and cards:
    - /drugs: "দুধ আটকে রাখার দিন", "মাংস আটকে রাখার দিন" (121px and 132px of text in 113px)
    - /fertility: "বাছুর দেওয়ার পর প্রথম পাল", "দুধ বন্ধের আগে দোহানো"
    - /home: "আজ কাজ আছে এমন পেন", "মোটাতাজা শেড / কোয়ারেন্টিন পেন"
    - /monthly-report: "বিক্রি হওয়া মোটাতাজা পশু"
    - /returns: "কোরবানি ২০২৬ ভেঞ্চার"
    - /investors/$id: "এখন খামারের কাছে মূলধন"

    The portal's figures wrap on a phone (`SummaryFigures hintsOnPhone`); the farm's do not.

13. **U14. Proven/Traced, low.** Controls under 44px on a phone:
    - the herd list's "select to move" checkboxes, 16×16 on /animals and /sheds
    - the breed list's "নিন" buttons, 28px `xs` (`routes/_authenticated/farm/breeds.tsx:168`)
    - `components/fattening/selling-trip.tsx:148` (`xs`)
    - the template section arrows (`components/templates/template-sections.tsx:39-58`, `icon-sm`)
    - the plan line remove (`components/ventures/venture-plan.tsx:261`)
    - the DataTable row expander (`components/data-table.tsx:491`)
    - the portal's footer links, 18px tall
    - the sync retry key (U9)

    Small `sm` buttons are 36px on a phone, which is fine.

14. **U13. Proven, low.** /farm/agreement-templates runs off a 360px screen: the version cards reach 409–426px. It is an Owner page, mostly read at a desk.

### Page weight

15. **U15. Proven (build), low-medium.** Before /work draws, a cheap phone downloads and runs:
    - **JavaScript:** 223 files, 1.26 MB raw, 453 KB gzipped
    - **The Bangla catalog:** `bn-*.js`, 527 KB raw, 106 KB gzipped, every one of 5,013 strings including the portal, templates and investor papers
    - **CSS:** 176 KB raw, 28 KB gzipped
    - **Fonts:** Noto Sans Bengali, 108 KB, plus 26 KB of its Latin subset

    That is about 720 KB over the wire and 1.8 MB of script to parse. It is downloaded again after every deploy, since the names are hashed.

    In the /work closure, beside the shared runtime (entry 261 KB, `language-provider` 221 KB, `use-mobile` 61 KB), are chunks the shed never uses: `dropdown-menu` 78 KB, `data-table` 41 KB, and the portal's pay pages (`venture-*`, 27 KB, imported by the entry). Measured on the build at 14:42, one merge before HEAD.

    What it could do: split the catalog by area (shed, desk, portal), and keep desk and portal code out of the entry.

### Owner choices

- **Native date and time boxes.** There are 83 date, time and datetime-local inputs. On a phone set to English, their picker shows English month names and AM/PM inside a Bangla form, against the farm's 24-hour clock. Keep the native picker (familiar, accessible, cheap) or draw the farm's own (Bangla digits, 24-hour, more code)?
- **The top bar on a phone.** Should the "English" toggle and the theme button stay in the bar, or move into the account menu and More so the sync status has room (U9)? On a Shed Phone shared by several people, a one-tap language switch in the bar is easy to hit by mistake.
- **The Manager's acts without signal.** Should a death, a dose not prescribed or a Sale also be held on the phone like the shed's Steps? Or stay online-only with a plain "no signal — not saved" (U16)?
- **How far to trim the first download (U15).** Splitting the catalog and the portal out is work. The service worker already makes every load after the first cheap, except after a deploy.

### Checked and holding

- **No untranslated JSX text.** `untranslated-text.test.ts` holds, and a wider grep found no literal English in `aria-label`, `placeholder`, `title`, `alt` or toast calls.
- **The catalogs agree.** en and bn have the same keys. The only Bangla values in Latin letters are brand, CSV, setup-code server words and agency acronyms (DLS, BLRI, FMD, IBBL).
- **Numbers in sentences.** `translate` writes numeric params in Bangla digits. No `String(n)`, `toFixed` or template-literal number reaches a `t()` param. Across 54 pages at 360px in Bangla, Latin digits appeared only in Tag Numbers, phone numbers, bank and transaction references, and the agency acronyms above.
- **Dates.** Days are the farm's (`farmDayOf`, `fieldOfMoment`). `shiftDay` does UTC sums on day strings, which is correct. The month and year pickers use `bn-BD` and `formatDigits`.
- **Wide tables have phone cards.** 46 of 52 DataTables have `card`; the six without (cash, receivables, wage draws, returns, giving-less, by-month) draw their own `md:hidden` list. Only chip rows and tab rows scroll sideways.
- **The shed's controls are big enough.** Bottom bar items 56px and labelled; work board actions 56px; PIN keys 64px; row menus and menu items 44px; Move dialog fits 640px.
- **Images, headings, colour.** Every `<img>` has alt text. Heading order is clean on /work, /home, /overview, /money and /feed. Status badges carry words, not colour alone.
- **CSV headers are English on purpose:** they are the DLS template's columns (`registers/register.ts:46`).
- **Push text is in each reader's language;** a digest's counts go through `translate` as numbers.
- **The notifiable-disease list shows the other language's name on purpose.**
- **Not this survey's:** breed names in English on /farm/breeds ("Jersey cross · ১৫টি পশু") are the seed's old typed names, not the standard list. English reasons on /audit ("This work is missed") were typed by earlier testers.
