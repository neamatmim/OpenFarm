# 07 — A Venture in the demo seed

**What to build:** Ventures in `pnpm db:seed`, so that every Venture screen has something on it. Two of
them: one part-way through its run, and one already **Settled** — because the Settlement, its payouts,
its Acknowledgements and the হিসাব নিকাশ are the screens nobody has ever opened, and they cannot be
opened without a Venture that has finished.

**Blocked by:** None.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — the seed is not specified, but every
figure it produces has to be one the spec's rules allow. [The map](../../openfarm-investor-projects/map.md),
"Not yet specified", lists this and calls it the cheapest thing on that list.

- [x] `pnpm db:seed` builds at least one Venture part-way through its run and one that has Settled
- [x] Both are built by driving the API with the farm's clock, as everything else in the seed is — no rows
      written by hand
- [x] The settled one passes all five of the Settlement's blocks honestly, rather than having them avoided
- [x] Its Investors have been paid and at least one has acknowledged, so the payout screen has both states
- [x] Venture cattle stand in the same Pens as the Farm's own, because that is the arrangement the whole
      costing was widened for
- [x] Somebody opens the Settlement, payout and Adjustment screens and looks at them
- [x] The seed's own closing instructions tell you how to run the app on it, correctly

## Checked before starting

**Nothing under `packages/api/src/seed/` mentions a Venture, an Investor, an Agreement or a Settlement.**
Eleven modules, 3289 lines, and not one of them. This is why no Venture screen has ever been looked at:
there is nothing to look at without building one by hand through the UI first, which takes about twenty
minutes and is thrown away when the seed is next reset.

**The seed drives the API, it does not write rows.** `packages/api/src/seed/index.ts` builds its own
database (`openfarm_seed`), migrates it, and hands it to `seedFarm`. `runtime.ts` opens each account the
way the sign-up form does and builds a `RouterClient` per person; `farm.as.manager.intake.record(...)` is
an ordinary API call against a `SeedClock` that the seed walks forward. So a Venture is seeded by calling
`ventures.open`, `investors.record`, `ventures.sign`, `ventures.keepAgreementPaper`,
`ventures.takeCapital`, `ventures.startBuying` and the rest, in that order, with the clock set back to
when each thing happened. Everything the app would refuse, it will refuse here too — which is the point.

**There are two places to hang work, and this needs both.**

- **Setup steps** run before the day loop, with the clock set wherever they like: `farm.ts:35-48` calls
  `openTheFarm`, `stockTheFarm`, `writeThePlaybook`, `registerTheHerd`, then `takeInBulls` at
  `start - 6`. A Venture that opened months before the history window belongs here.
- **Happenings** are `{ day, time, what, run }` (`history.ts:298`), collected by `scriptTheDays`
  (`script.ts:901`) from eleven parts and played in order by `liveTheDays`, interleaved with whatever the
  Playbook makes due that day. A Venture's Reimbursement, Bank Check, Advance and Sales belong here, as a
  twelfth part.

**`HISTORY_DAYS` is 90** (`farm.ts:23`, `SEED_DAYS` overrides it), and the day loop only runs
`start..today`. A fattening run is longer than that, so the **settled** Venture has to be built almost
entirely as a setup step with the clock walked back well before `start` — open, sign, take capital, buy,
weigh, sell, reconcile, settle, pay out — and only its tail, if anything, need fall inside the loop. The
running one can open before `start` and live through the loop.

**A Venture's bulls go in through the same door as the Farm's.** `takeInBulls` (`herd.ts:251`) records
a Buying Trip and then one `intake.record` per beast, and `intake.record` already takes `ventureId`,
`targetWindowStart` and `targetWindowEnd` — see `investor-statement-due.test.ts:120-133` for the shape.
So a Venture's lorry is `takeInBulls` with a Venture named, and the animals stand in the ordinary Pens.
The `Bull` record in `herd.ts` has no owner field; it will need one, or a set of Venture tags kept beside
the herd, so that `sellTheReady` and the Reimbursement know whose animals they are.

**The Float has to be drawn before the lorry and reconciled after it.** Cattle are bought from a
reconciled Buying Float, so the order per lorry is `ventures.drawFloat` → the Trip and its Intakes →
`ventures.reconcileFloat` with the cash that came back. An open Float is one of the five things that
blocks a Settlement.

**The five blocks are in `settlement-store.ts:74-81`** and must be met, not dodged:
`agreements_disagree` (every Agreement on one Venture at the same percentage),
`an_animal_still_stands` (all sold, died or bought back), `a_price_is_missing` (no unpriced feed or
uncosted doses — the seed already prices its store, so this follows if the Venture's animals eat from it),
`a_float_is_open`, `a_reimbursement_is_owed` (a month of consumption not yet reimbursed), and
`the_bank_disagrees` — which means a **Bank Check for every month** of the Venture's life, so a Venture
that ran eight months needs eight of them.

**`sellTheReady` (`script.ts:814`) sells the Farm's bulls and knows nothing of Ventures.** It filters on
`bull.arrivedOn === addDays(start, -6)`, which is the Farm's own first lorry, so it will leave a Venture's
animals alone by accident rather than on purpose. Make that deliberate.

**The seed's closing instructions are wrong today.** `index.ts:104` prints
`DATABASE_URL=… pnpm dev`, and that does not reach the web process — the app comes up on the developer's
own database and every page 500s on a session that belongs to the other one. What works is
`cd apps/web && DATABASE_URL=… pnpm exec vp dev`. Fix the line while you are here; it is two minutes and
it is the first thing anybody does after seeding.

**Three screens to look at once it runs**, none of which anybody has: the Settlement sheet
(`settlement-sheet.tsx`, built by [finishing ticket 04](./04-the-settlement-on-screen.md), whose own
notes say "the layout, the spacing and how several blocks read together have not been seen by anybody"),
the payout and acknowledgement rows ([ticket 05](./05-approving-paying-out-and-acknowledging.md)), and
Adjustments ([ticket 06](./06-adjustments-on-screen.md)). The one screen that _has_ been opened —
the statements sheet, 2026-09-19 — gave up three defects in a sitting, so budget for finding some.

**Watch the runtime.** The seed takes about 310s today. A settled Venture is a second herd with its own
weigh-ins, so keep its animals few — six or eight — and do not give it a Playbook of its own.

## What was decided while building

**Two Ventures.** **কোরবানি ২০২৬** opens ten days before the history window, buys six bulls, runs the
ninety days, sells them at the haat before the month turns and settles on the fourth of the next —
৳২,১৪,৭৪০ profit, split ৳১,২৮,৮৪৪ to three Investors and ৳৮৫,৯০৮ to the Farm, all three paid and **two
of the three acknowledged**, deliberately, so the payout screen shows both halves of what it is for.
**ঈদ ২০২৭** is still Fattening with five bulls, an Owner's Advance of ৳৬০,০০০ outstanding and its Target
Window next February.

**When a Venture may settle is not a free choice.** A Settlement covers every month it ran **including
the one it is settled in**, and a month still running cannot be reimbursed — so a Venture whose animals
were still eating this month can never close at all. Its animals have to be gone before the month turns.
`closingDays()` works the selling and settling days back from the first of the current month for exactly
that reason, rather than counting back from today.

**Four things the app refused, and was right to.** Each cost a run and each was a real rule:

- **`float_over`** — the Float has to cover the beasts **and the day itself**, the broker and the lorry
  and keeping the men. `reconcileFloat` balances to the taka.
- **A Venture left in Buying never reaches Selling.** `startFattening` is not automatic.
- **`ready.confirm` refuses a beast inside her meat withdrawal.** The lumpy-skin vaccine keeps one off
  the market for twenty-one days, so the Venture's selling day has to clear the campaign at `start + 40`.
- **`a_price_is_missing`** — twice, for two different reasons, both of them pre-existing seed bugs that
  only a Settlement could have exposed. See below.

**Two bugs in the seed itself, neither of which mattered until something settled.**

- The **Fodder Price was set at 07:30 and the first napier cut came in at 06:30 the same day**. A Harvest
  keeps the price in force when it was recorded, so 1810 kg stayed unpriced for good. Harmless in the
  farm's own reports; enough to stop any Venture ever settling. The comment above it already said "said
  before the first cut comes in" — the intent was right and the time was wrong.
- **The seed named its medicines but never bought any.** `drugs.add` gives a product its withdrawal
  days; only `drugs.purchase` gives a dose a cost. Every dose the farm had ever given charged the animal
  nothing, so eighteen of them sat uncosted on the Venture's bulls. The medicines now arrive with a
  price and a dose count, which also means every Margin on the farm is truer than it was.

**The Settlement was unreachable once a Venture settled.** `ventures.tsx` only drew the button while the
state was `selling` — so the approved figures, the payouts and the Acknowledgements, which are the
questions asked *afterwards*, had no way back to them. The same mistake as the Statements button, made
in the same file, for the same reason: the row was chosen by the Venture's state rather than by what the
thing is for. Fixed here, because it is the reason this ticket's last criterion could not be met.

**And the screens gave up a real one.** A settled Venture's account held ৳৯,০০১.০১, where the glossary
says "a settled account reads nothing". It is its Selling Trip, to the taka: charged in the Settlement,
paid by the Farm, and reimbursed by nobody. Written up as
[ticket 08](./08-nothing-ever-pays-for-a-ventures-selling-trip.md), and left for the Owner, because
which of the three ways out is right is a decision about money rather than a bug to patch.

**The runtime did not suffer.** 266s against about 310s before, with eleven more animals — the medicine
purchases and the Venture paperwork cost less than the noise between runs.
