# PROTOTYPE — Investor statements (throwaway)

Three A4 documents an Investor receives, Bangla with English labels, for the wayfinder ticket `.scratch/openfarm-investor-projects/issues/08-prototype-investor-statements.md`:

- **A যোগদানপত্র** — capital received, plus the terms in plain Bangla.
- **B অগ্রগতি** — where the Venture stands: head, weights, ADG, spend against the budgets, the animals.
- **C হিসাব নিকাশ** — settlement: proceeds, every charge, profit, the 60/40 split, rounding, the payout.

Run `pnpm dev:web`, open `/prototype/investor-statement?variant=A|B|C`; the floating bar (or ← →) flips variants, and the browser's print preview shows the A4 page.

Every figure is invented. No projection of future price or profit appears anywhere, and each sheet carries the "no guaranteed return, loss comes off capital" footer the law research requires.

This code was written under prototype constraints — no tests, no error handling — rewrite it properly when building.
