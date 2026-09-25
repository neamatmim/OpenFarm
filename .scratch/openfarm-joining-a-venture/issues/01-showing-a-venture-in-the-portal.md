# 01 — Showing a Venture in the portal

**What to build:** The Owner can show an Open Venture in the portal, with a few words of their own, and take it out again. Every invited Investor who is not retired then sees it. They see:

- the terms, including the split the farm signs on today;
- the rules;
- the Owner's words;
- nothing else.

The notice on every portal page changes to match.

This is the surface every later Investor-side ticket sits on. It carries no Request yet: the Venture-to-join page only reads.

**Blocked by:** None.

**Status:** built on `feat/portal-shows-a-venture`; the portal pages still wait to be opened

**Spec:** [joining spec](../spec.md), user stories 1–23. `CONTEXT.md`: **Investor Portal**. ADR 0008.

- [x] A Venture is not shown until the Owner shows it. Showing and taking out are refused unless it is Open, and showing is refused after its decide-by day.
- [x] The Owner can write and change a short description as they show it, with a warning beside the field against stating returns, prices to come or comparisons.
- [x] Show, take out and a changed description are each an Audit Event.
- [x] The Owner's Venture page says whether the Venture is shown, and holds the show and take-out acts and the description.
- [x] An invited Investor sees shown, Open Ventures on a new page reached from the portfolio, including an Investor with no Agreement anywhere. A retired Investor sees none.
- [x] A Venture the Investor already has an Agreement on is not offered; it is theirs already.
- [x] A shown Venture past its decide-by day reads "no longer taking requests".
- [x] The Venture-to-join page shows:
  - the Unit price, target, Floor, decide-by day, Target Window and both budgets;
  - the farm's split today;
  - the rules: every taka back if the Floor is missed, a loss off capital, nothing guaranteed, joining only by signing in person;
  - the description.
- [x] A test asserts on the **whole** answer that an Investor gets nothing from any Agreement: no Units taken, no Units left, no names, no count of people.
- [x] The notice on every portal page says the portal is not a public offer, that joining is only by an Agreement signed in person, and that no money moves through it, in Bangla and English.
- [x] The demo seed shows one Open Venture in the portal.
- [ ] Somebody opens the Owner's Venture page and both portal pages, on a phone-width screen, before this is called done. **The Owner's page was opened on 2026-09-25**: show, change the words, take out and show again all work, in Bangla and English, at the narrowest window. **The two portal pages have not been opened**: that needs an Investor to join from an invitation, which a person has to do.

## Checked before starting

- **The portal's reads narrow to the Investor's own Agreements** through `requireTheirs` in `packages/api/src/portal-store.ts`. An open Venture belongs to no Agreement, so it needs its own narrowing. Don't widen `requireTheirs`.
- **The split is a Farm value**, not a Venture's: `farm.venture_investors_percent`, 60 by default. Each Agreement freezes its own.
- **One Agreement per Investor per Venture** is a unique index on `investment_agreement`. That is why an Investor already signed is not offered the Venture.
- **The Owner's Venture page** is `apps/web/src/routes/_auth/ventures/$ventureId.tsx`, and it shares acts with the list through `use-venture-acts.tsx`. Dim acts say why on both layouts.
- **The portal's pages** are under `apps/web/src/routes/portal/_in/`. Its answers are never persisted on the device (`keptOnDevice`).
- **The notice** is `portal.notice` in `packages/i18n/src/messages/{en,bn}.ts`. Both languages go in together, and Bangla numbers are worded where the string is built.
- **The untranslated-text guard** reads a `>` inside a JSX expression as a closing tag. Name the boolean.
- **A new migration** is applied to the dev database and the seed on merge, and moves the latest-migration marker.

## What was decided while building

- **Showing needs no bank details and no words.** The words may be empty. The Investor's page simply has no "From the farm" section then.
- **Taking out keeps the words,** so showing again starts from them.
- **Taking out a Venture that is not shown is not refused.** It writes an Audit Event that changes nothing. The code review noted this: changing the words _is_ refused when not shown. Left as it is.
- **The planned budgets are read off the Venture row directly** for the Investor, never through the held-money figures, so nothing that has come in can leak onto the page.
