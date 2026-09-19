# 09 — The Owner's farm page says nothing about Ventures

**What to build:** The exceptions a Venture raises, on the page the Owner actually opens in the morning.
`apps/web/src/routes/_auth/farm.tsx` is her page and the word "venture" does not appear in it once. A
Venture running over its Cattle Budget, a Running Budget nearly gone, animals unsold as the Wind-up
Period runs out and a month the bank has not agreed with are all things she finds out by remembering to
go to `/ventures` and read two cards.

**Blocked by:** None. The map listed this as waiting on settlement; settlement shipped 2026-09-18.

**Status:** done

**Spec:** [The map](../../openfarm-investor-projects/map.md), "Not yet specified" — "The Owner's view of
Ventures. Venture tiles and exceptions on the Owner's farm page: a Venture running over cost, a Running
Budget nearly gone, animals unsold as the Wind-up Period ends."
[Ventures spec](../../openfarm-investor-projects/spec.md), "Who may do what" — the Owner alone.
`CONTEXT.md` — **Venture**, **Running Budget**, **Wind-up Period**, **Bank Check**.

- [x] The Owner's farm page says when a Venture needs her, and stays quiet when none does
- [x] It says which Venture and what is wrong, in words she can act on, not a count
- [x] Each thing it says leads to where she would do something about it
- [x] Nothing about Ventures reaches anybody but the Owner
- [x] A farm with no Venture sees no change at all
- [x] Somebody opens the page with the seeded Ventures on it and looks at it

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

## What was decided while building

**"Running over cost" is not a thing, and no figure was invented for it.** `drawFloat`
(`routers/ventures.ts:930`) and the Internal Sale (`:1229`) both refuse to spend more than the Cattle
Budget is holding, so it cannot be overdrawn. The Running Budget falling low is the farm's one way of
saying a run is going over; a second figure saying the same thing differently would only disagree with
it. So three troubles, not four — the Running Budget, the Wind-up Period, and the bank.

**A stale bank month and a disagreeing one stay apart**, as the card already keeps them: one needs the
statement read again, the other needs explaining. A month nobody has opened yet is *not* raised — that
is a gap rather than trouble, and the Venture's own card says so quietly.

**Asked of the Venture, never of its state.** `troubleWith` reads `runningBudgetLow`, `pastWindUp` and
the bank months, each already true or not on its own terms. This was the caution this ticket carried,
and it is the fourth screen in a row where starting from the state would have been wrong.

**`pastWindUp` now has one definition**, in `apps/web/src/lib/ventures.ts`, read by both the Venture card
and the Owner's page. It stays worked out *where it is read* rather than sent down with the Venture: a
fortnight-old cached `true` would tell her a run is over on the strength of a date that has since moved.
That is also why the farm page asks `ventures.list` itself instead of widening `home.owner`.

**The badge counts them.** `decisionsWaiting(needsYou) + troubled.length`, because "সব ঠিক আছে" said
over a Venture that is not would be worse than saying nothing.

**Seen both ways, on the seeded farm.** Neither seeded Venture is in trouble, so the page was read twice:
with the farm's Running Budget warning raised to ৳২,০০,০০০ it named **ঈদ ২০২৭ ভেঞ্চার — "খাওয়ানোর টাকা
কমে আসছে — ৳১,৭১,২৩৮.৭৩ বাকি"**, first in her decisions, and the badge read ১৮; with the warning put
back to its ৳৫০,০০০ default the heading vanished entirely and the badge read ১৭. The parameter was
restored.

**The seed was left alone, deliberately.** This ticket asked whether to widen it so the next person sees
these rows. To do that honestly a Venture would have to be genuinely in difficulty, and the seeded farm
is not — forcing one would be fabricating a farm in trouble to make a panel visible. Turning the warning
threshold up for a minute is the honest way to see it, and it is written here so the next person knows.

## What the review caught

**A run that was called off was being told on.** The bank troubles were the only one of the three with
no condition of their own — `bank` is built for every row `ventures.list` returns. A cancelled run
refunded every taka and has no figures resting on it, so a month of its that disagrees is history rather
than something she can act on. A **settled** one is kept on purpose: its Settlement could not have closed
while a month was out, so a month that has gone out since means the figures everybody was paid on no
longer read the same.

**"All fine" could be said having never heard about the Ventures.** If `ventures.list` failed or was
still in flight, `troubled` was `[]` and the page showed the green word. An empty list is an answer; no
answer is not, and a green "everything is fine" resting on a request that failed is the worst of the
three. Both the badge and the empty state now wait for `isSuccess`.

**The split of stale months from disagreeing ones was in three places** — the card, this lib and
`settlement-store.ts`. Two of them are the same language and now share `monthsStillOut`; the third is
the server's and stays where it is.

**`ROW_LINK` and `MORE_LINK` were hand-rolled** rather than taken from `queue.tsx`, where `MORE_LINK`
already lived and `ROW_LINK` now does.

**The word table dispatched twice** — once for the message key, once for its parts. One table decides
both now, so a line cannot come to be worded for one trouble and numbered for another.

**The noun drifted.** The new Bangla line said পশু where `ventures.pastWindUp` says গরু for the same
fact, and the English dropped the noun altogether ("with 12 still unsold"). Both now match the screen
that already said it.

**The doc comment above `statements.title` was orphaned** by inserting the new keys between it and the
key it describes — the seventh time a review has caught that in this repo.

**Not taken: `word` renamed to `kind`.** The review preferred `kind` from `lib/sop-draft.ts`. `word` is
the house name for this exact shape — a discriminated union of the farm's own refusal-style words, as
`Block["word"]` and `ChargeWord` are, and as `settlement-sheet.tsx` binds them. Kept, and noted here
rather than left silent.

**A trap worth knowing.** The guard in `untranslated-text.test.ts` reads whatever sits between one tag
and the next as text — so a boolean operator written inline there fails the suite, and so does a comment
explaining one. Hence `AllFine` being its own component with its reasoning in a doc comment. This is the
same family as the angle-bracket trap `ventures.tsx` already carries two warnings about.
