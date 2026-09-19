# 07 — The three statements on screen

**What to build:** A way for the Owner to actually produce the three papers. All three exist, are narrowed to one Investor, and write their Export to the trail — and not one of them can be reached by anybody. `investorStatements.joining`, `.progress` and `.settlement` are procedures nothing calls.

Three buttons, where she already stands:

- **যোগদানপত্র** beside the Agreement she has just signed and taken capital against.
- **অগ্রগতি** beside each Agreement while the run is on — the sheet, and the animals' photographs laid out with it.
- **হিসাব নিকাশ** beside each Investor's line once the Settlement is approved.

And the telling that already reaches her — `investor_statement_due`, raised on the four occasions — should land her where the buttons are rather than leaving her to go looking.

**Blocked by:** None — 01 to 06 are done and merged.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 79 and 85; the [roles matrix](../../openfarm-investor-projects/assets/venture-roles-matrix.md) row "Investor statement — generate, issue, record acknowledgement: Owner alone"; `CONTEXT.md` — **Investor Statement**, **Export**.

- [x] A Venture's Agreements are listed by the Investor's name before its Settlement is approved, because two of the three papers are wanted while the run is on and nothing lists them today
- [x] The Owner can produce each of the three papers for one named Investor, from the Venture she is looking at
- [x] The progress sheet shows the animals' photographs beside its text, and reads properly for an Animal nobody has photographed
- [x] A paper that cannot be made yet says why in words she can act on — no capital arrived, the Settlement is not approved — rather than a refusal code
- [x] Only the Owner sees any of it, and nothing on screen carries one Investor's figures into another's view
- [x] The `investor_statement_due` notice leads to the place the paper is made
- [x] Somebody opens the page and looks at all three before this is called done

## Checked before starting

**There is one Venture screen, it is a list, and nothing is a page.** `apps/web/src/routes/_auth/ventures.tsx` is the whole of it — `VenturesPage` (`:411`) drives a card per Venture off `ventures.list`, with eleven callbacks that each open a **Sheet** from `apps/web/src/components/ventures/`. A Venture is never navigated to. There is no `$ventureId`, `$agreementId` or `$investorId` route anywhere in the app, though the pattern exists elsewhere (`animals/$tagNumber`, `work/$instanceId`), so adding one is possible — it would mean turning `ventures.tsx` into the directory form TanStack needs for children.

**And there is no list of Agreements on any screen, which is this ticket's real problem.** The only per-Investor-per-Venture rows in the app are `approved.shares.map(...)` in `settlement-sheet.tsx:436` — and they exist **only once the Settlement is approved**. হিসাব নিকাশ belongs there and fits perfectly. যোগদানপত্র and অগ্রগতি do not: both are wanted while the run is on, and hanging them off that list would make them unreachable for exactly the Ventures they are for. Something has to list a Venture's Agreements before approval, and nothing does.

`ventures.agreements` (`routers/ventures.ts:587`) already returns what such a list needs — `{ id, investorId, units, investorsPercent, targetWindow, arbitrator, stamp, hasPaper }` — but its only consumer today is `take-capital-sheet.tsx:47`, and it returns `investorId` rather than a name. A list by name means joining `investors.list` or widening the procedure. Decide which; do not do both.

**The paper pattern is four lines.** `apps/web/src/components/accountant-export.tsx:26-72` is the whole of it: `useState<string | null>` for the text, `useMutation(orpc.X.mutationOptions({ onSuccess: ({ text }) => setPaper(text), onError }))` with `onError` from `useRefusalToast()`, a Button, and `{paper ? <Paper id="…" text={paper} /> : null}`. Strings come from `useLanguage()`'s `t`, and the keys live in `packages/i18n/src/messages/{en,bn}.ts` — the check script enforces that Bangla covers every English key.

**`PaperId` is a closed union of fourteen and needs three more.** `apps/web/src/components/paper.tsx:7-21`. It is closed on purpose — the comment says the id is written straight into a stylesheet — so adding `investor-joining-letter`, `investor-progress` and `investor-settlement` is part of the work rather than an afterthought.

**A statement needs a personal session, so it cannot hang anywhere a Shed Phone reaches.** All three carry `requireOnly("owner", OWNER_ONLY)` _and_ `requirePersonalSession()`. The `/ventures` route already guards with `beforeLoad: onlyFor("owner")` (`ventures.tsx:589`), which is the precedent to follow.

**The progress sheet's photographs are the one thing that does not fit.** `<Paper>` takes `text` plus **at most one** `image` (`paper.tsx:30-39`), and only the Registration record uses it. `investorStatements.progress` returns `{ text, photos, agreementId }` where `photos` is `{ tagNumber, contentType, data }[]` — base64, as `apps/web/src/components/animal-photo.tsx` renders it (`src={\`data:${contentType};base64,${data}\`}`). **The Owner decided (2026-09-19) that the photographs travel beside the sheet and every paper stays a plain string**, so the question left for this ticket is only how the page lays them out next to the text — not whether to change `<Paper>` or make this one paper JSX. Both of those were considered and declined.

Watch where they are put, though: `<Paper>`'s print rules are keyed on `#${id}` and hide everything outside it, so photographs rendered _below_ or _beside_ the `<Paper>` element would show on screen and vanish from the printed page. "Beside the sheet" has to mean inside the printed section.

**Nobody has ever opened any of these pages.** Ticket 04 of [the finishing set](../../openfarm-ventures-finishing/issues/04-the-settlement-on-screen.md) says so plainly of the Settlement screen it built — "the layout, the spacing and how several blocks read together have not been seen by anybody" — and it has not been looked at since. This ticket inherits that, which is why its last criterion is that somebody opens the page.

**And they cannot be opened without work, because the demo seed makes no Venture.** Nothing under `packages/api/src/seed/` mentions one — no Venture, no Investor, no Agreement, no Settlement. So there is nothing to look at: a signed, funded, half-run Venture has to be built by hand through the UI, or seeded. Seeding one is the smaller job and the one that keeps paying, and it would let the finishing set's three screens be looked at too. It may deserve to be split out and done first.

**Three questions about the papers themselves are still open, and are the Owner's.** They are written on their own tickets and should not be settled by whoever builds the screens: a bull sold across to another Venture is out of অগ্রগতি's head counts but her price is in what the Venture spent ([ticket 04](./04-the-paper-while-the-venture-runs.md)); a Settlement Adjustment line mixes cumulative and incremental measures, which a second Adjustment would expose ([ticket 06](./06-the-paper-when-the-venture-ends.md)); and "issue" and "acknowledge" are not recorded acts, so a button that says _Send_ would be claiming something the trail cannot back ([ticket 05](./05-when-the-progress-paper-goes-out.md)).

**`ventures.herd` is built and nothing calls it.** `routers/ventures.ts:2286` returns the whole progress reading — counts, averages, daily gain, days to the window, a row per Animal — to the Owner _and_ the Manager, with no personal session needed. If a Venture card should show how the cattle are doing without producing a paper, it is already there and unclaimed. That is a different thing from this ticket and should not be folded in without saying so.

**A refusal is already a word, not a code.** All three procedures refuse in the house way — `no_capital_yet`, `capital_returned`, `not_settled_yet`, `no_such_agreement` — and `apps/web/src/lib/correction-refusal.ts` is where a word becomes a sentence in the reader's language. `sayWhy(error, t, ownWords)` takes a per-screen `ownWords` map, and `settlement-sheet.tsx:68` shows the shape worth copying — `as const satisfies Record<Block["word"], MessageKey>`, so a new refusal word fails to compile rather than printing an empty line.

**Two things about the strings.** They live in `packages/i18n/src/messages/{en,bn}.ts` and go in together, in the same commit, every time — the check script enforces that Bangla covers every English key. And `apps/web/src/i18n/untranslated-text.test.ts` reads a `>` inside a JSX expression as a closing tag: `ventures.tsx` carries two comments warning about it because it has bitten that file twice. Write `lastMonth() <= x` rather than the other way round, or name the boolean.

**There is a throwaway prototype worth looking at first.** `/prototype/investor-statement?variant=A|B|C` (`apps/web/src/routes/prototype/investor-statement.tsx`) renders all three with invented content. It is not wired to the API and its own README says to rewrite it properly — but it is what the Owner reacted to, so it is the nearest thing to a picture of what she expects.

## What was decided while building

**`<Paper>` did gain a prop, and this ticket said it would not.** Line 41 above records that changing
`<Paper>` was "considered and declined" — but line 43 requires the photographs to print *inside* the
`#id` section, and there is no way to put them there from outside the component. The declined thing was
making a paper JSX instead of a string, and that was kept: every paper is still a plain multi-line
string, and `photographs` is an optional prop beside the text. Raising it here rather than leaving it in
a code comment, because the ticket says the opposite.

**The button is asked of the Agreements, not of the Venture's state.** It was first put in the block
that draws for a running Venture, which is wrong: the যোগদানপত্র is wanted while the Venture is still
**Open**, because capital arrives before an animal is bought. `hasPapersToGive` asks whether anybody has
signed and the run was not called off — which also covers a **Settled** Venture, whose Investors may
want their হিসাব নিকাশ again.

**The notice leads somewhere, and nothing in this app did before.** `alert-list.tsx` drew every notice
as a sentence and a "got it"; there was no kind→route table to copy, so criterion 6 was new work rather
than a wiring-up. It is one kind on purpose: `/ventures?statements=<ventureId>`, read by the route and
cleared from the address when the sheet closes, the same shape `?sell=` already uses on `/sale`.

**Three defects only opening the page could have found.** None of them was in this ticket's own code:

- The **অগ্রগতি** printed its column header — `ট্যাগ · শুরুর ওজন · …` — over no rows at all for a
  Venture that has bought nothing yet, which is every Venture for the first days of its run. It now
  says so in words.
- The **notice printed its own placeholders**: `{venture}: {investors} জন …`. `paramsOf` in
  `alert-list.tsx` is a fixed table of the facts each kind carries, and nobody added this kind's three
  when the notice was built in ticket 05.
- The **month occasion read `2026-09`** — Arabic numerals in the middle of a Bangla sentence, the same
  defect the seven joining terms had. It is now worded: `সেপ্টেম্বর ২০২৬`.

**The English labels were renamed against the glossary.** `CONTEXT.md` warns under **Bank Check** that
"statement" is the bank's own paper, and the Venture's **Settlement** button sits on the same card — so
a bare "Statements" and "Settlement" collided with two other things. They read "Investor statements" and
"Settlement statement" now. The Bangla was already the glossary's own three words.

**Still open, and still the Owner's** — the three questions written on tickets 04, 05 and 06 were not
touched: the bull sold across to another Venture, the Adjustment line's mixed measures, and "issue" and
"acknowledge" not being recorded acts. Nothing on this screen says *Send*, for that last reason.
