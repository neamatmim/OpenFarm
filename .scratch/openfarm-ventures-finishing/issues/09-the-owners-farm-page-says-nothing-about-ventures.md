# 09 — The Owner's farm page says nothing about Ventures

**What to build:** The exceptions a Venture raises, on the page the Owner actually opens in the morning.
`apps/web/src/routes/_auth/farm.tsx` is her page and the word "venture" does not appear in it once. A
Venture running over its Cattle Budget, a Running Budget nearly gone, animals unsold as the Wind-up
Period runs out and a month the bank has not agreed with are all things she finds out by remembering to
go to `/ventures` and read two cards.

**Blocked by:** None. The map listed this as waiting on settlement; settlement shipped 2026-09-18.

**Status:** ready-for-agent

**Spec:** [The map](../../openfarm-investor-projects/map.md), "Not yet specified" — "The Owner's view of
Ventures. Venture tiles and exceptions on the Owner's farm page: a Venture running over cost, a Running
Budget nearly gone, animals unsold as the Wind-up Period ends."
[Ventures spec](../../openfarm-investor-projects/spec.md), "Who may do what" — the Owner alone.
`CONTEXT.md` — **Venture**, **Running Budget**, **Wind-up Period**, **Bank Check**.

- [ ] The Owner's farm page says when a Venture needs her, and stays quiet when none does
- [ ] It says which Venture and what is wrong, in words she can act on, not a count
- [ ] Each thing it says leads to where she would do something about it
- [ ] Nothing about Ventures reaches anybody but the Owner
- [ ] A farm with no Venture sees no change at all
- [ ] Somebody opens the page with the seeded Ventures on it and looks at it

## Checked before starting

**`farm.tsx` is the Owner's page and knows nothing of Ventures.** `grep -c venture` on it returns 0. It
draws from `orpc.home.owner` (`routers/home.ts:254`), which gathers eleven things in one `Promise.all` —
late work, proposals, needs-review, completions, animals held, today's milk, mortalities, money awaiting
approval, the week, low stock — and not one of them is a Venture. Adding a twelfth is the shape to
follow; it is already `requireRole("owner")`, which is the guard this needs.

**Every figure it would need is already computed and already filtered to the Owner.**
`ventures.list` (`routers/ventures.ts:488`) returns per Venture: `runningBudgetLow`, `windUpEndsOn`,
`animalsStanding`, `bank: { lastCheckedMonth, monthsOut, monthsStale }`, `cattleBudgetHeldBdt`,
`runningBudgetHeldBdt`, `openFloatBdt`, `state`. The card already reads all of it. So this is a question
of _where she is told_, not of working anything out — do not recompute any of it.

**Three of the four exceptions already have a settled shape on the card**, and the words exist:

- `runningBudgetLow` is gated to the running states in `venture-store.ts:191` — "one whose run is over
  is not feeding anybody" — so it is already honest about when it applies.
- `pastWindUp` is in `ventures.tsx:141`, one condition used by both the warning and the button that
  answers it, deliberately: "being told the run is over while the button that ends it is not there
  would be worse than not being told." Whatever the farm page says has to obey the same rule.
- `bank.monthsOut` / `monthsStale` are told apart on purpose — a stale month needs the statement read
  again, a disagreeing one needs explaining. Do not collapse them into one line.

**"Running over cost" has no figure yet.** The map asks for "a Venture running over cost" and nothing
computes that. The nearest honest thing is the Cattle Budget: `cattleBudgetHeldBdt` falling below zero
means it has drawn more for animals than the capital set aside for them. Decide whether that is what the
Owner meant, or whether it is the Running Budget warning under another name — and if it is a new figure,
it belongs in `ventures.list` beside the others, not on the farm page.

**There is now something to look at.** The demo seed makes two Ventures since
[ticket 07](./07-a-venture-in-the-demo-seed.md) — one settled, one fattening with an Owner's Advance
outstanding. Neither is currently in any exception state, so seeing this work will mean either pushing
one into trouble by hand through the UI, or widening the seed. Say which, and if it is the seed, do it
in the same commit so the next person can see it too.

**A caution from the four screens opened on 2026-09-19.** Every one of them was gated by the Venture's
_state_ where it should have been gated by what the thing is for — the Statements button, the Settlement
button and the budget line all got this wrong in the same file. Ask what the Owner needs to know, then
ask which Ventures can be in that condition; do not start from the state.

**A telling already exists and is not this.** `investor_statement_due` (`investor-statement-notice.ts`)
goes in the evening Digest and now leads to `/ventures?statements=<id>` — the only notice in the app
that leads anywhere (`alert-list.tsx`). This ticket is the farm page, not the notice list; decide
deliberately whether any of these four exceptions deserves to be a Notice as well, and say why in the
commit rather than adding one quietly.
