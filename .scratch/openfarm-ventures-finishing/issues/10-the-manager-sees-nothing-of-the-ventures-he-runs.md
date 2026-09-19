# 10 — The Manager sees nothing of the Ventures he runs

**What to build:** The part of a Venture the Manager is meant to see. The roles matrix gives him three
rows and the app honours none of them: he buys a Venture's cattle, feeds them, doses them and sells
them, and there is no screen anywhere that tells him a Venture exists.

**Blocked by:** None.

**Status:** ready-for-agent

**Spec:** [The roles matrix](../../openfarm-investor-projects/assets/venture-roles-matrix.md), three rows
quoted below. [Ventures spec](../../openfarm-investor-projects/spec.md), "Who may do what" — the Manager
sees the work and never the money between the Owner and her Investors. `CONTEXT.md` — **Venture**,
**Running Budget**, **Reimbursement**.

- [ ] A Manager can see, for a Venture, what the matrix gives him: its budgets, what it has spent, and
      what is going wrong — and none of what it does not
- [ ] An Animal's own page says which Venture owns her, to everyone the matrix says may read it
- [ ] Nothing on any of it names an Investor, a Unit, a split, a payout or a Venture's result
- [ ] A Staff member and a Vet see no change anywhere
- [ ] Somebody opens it as the Manager — not as the Owner — and looks at it

## Checked before starting

**The matrix gives the Manager three rows, and he has none of them.** Quoted exactly:

| Area                                                   | Owner | Manager                      |
| ------------------------------------------------------ | ----- | ---------------------------- |
| **Venture** — open, set target, Floor, budgets, Units… | C R U | R (budgets, spend, warnings) |
| **Which Venture owns an Animal** (set at Intake)       | R U   | C R U                        |
| **Monthly Reimbursement**                              | X     | R                            |

And against that: `/ventures` is `beforeLoad: onlyFor("owner")` (`ventures.tsx:641`), and there is no
other Venture route. Outside `components/ventures/`, only five files in the whole web app mention a
Venture, and every one of them is the Owner's or the Intake form.

**`ventures.herd` is built for exactly this and nothing calls it.** `routers/ventures.ts:2286`,
`requireRole("owner", "manager")`, no personal session needed — it returns the whole progress reading:
standing, sold and lost counts, how many are weighed, average weight at intake and now, the herd's daily
gain, days to the Target Window, and a row per Animal with her gain. It is the only Venture procedure
the Manager may call, it was written for him, and `grep -rn "ventures.herd" apps/web/src` finds nothing.
Increment 6's ticket 07 already flagged it: "If a Venture card should show how the cattle are doing
without producing a paper, it is already there and unclaimed."

**An Animal's page never says whose she is.** `apps/web/src/routes/_auth/animals/$tagNumber.tsx` does not
contain the word "venture", and neither does `routers/animals.ts` — `ownerVentureId` is written at
Intake (`routers/intake.ts:160`) and read afterwards only by `sale.ts` and `ventures.ts`. So a Manager
standing at a bull cannot tell whether she is the Farm's or an Investor's, though the matrix gives him
**C R U** on exactly that fact. Widening the animal read is part of this work; decide whether Staff and
Vet see it too — the matrix says they do not.

**What he must not see is most of the file.** Investors, Units, the split, payouts and the result are
Owner-only, and `ventures.list` carries all of them (`signedFor`, `capitalInBdt`, `paidOutBdt`). So this
cannot be "show him `ventures.list`" — it needs either a narrowed procedure or a narrowed view, and the
narrowing has to be on the server, because a field the client merely does not draw is still a field the
client was sent. `ventures.herd` is already narrow on purpose; check whether it is narrow **enough**
before adding to it.

**There is a reading with no screen and a screen with no reading.** Decide deliberately which shape this
takes — a Venture panel on the Manager's own page, a Venture section on the Fattening board, a row on
the Animal's page, or a page of its own — and say why in the commit. `apps/web/src/routes/_auth/home.tsx`
is the Manager's page; `fattening.tsx` is where he watches bulls grow, and `ventures.herd`'s per-Animal
rows are the same animals that board already lists.

**Both seeded Ventures have Manager-visible work on them.** কোরবানি ২০২৬ is settled with six sold
animals; ঈদ ২০২৭ is fattening with five standing, ৳1,71,238.73 left to feed with and three months of
Reimbursement behind it. Sign in as `manager@openfarm.test` — the seed's Manager — rather than reading
it as the Owner, because reading it as the Owner is how a screen that leaks gets called done.

**A caution five screens old now.** The Statements button, the Settlement button, the budget line and
the trouble list were each drawn for the wrong Ventures because the condition was the Venture's _state_
rather than what the thing is for. Ask what the Manager needs to know, then ask which Ventures can be in
that condition.
