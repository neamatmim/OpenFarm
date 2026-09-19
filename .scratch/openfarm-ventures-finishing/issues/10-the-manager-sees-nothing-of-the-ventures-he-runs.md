# 10 — The Manager sees nothing of the Ventures he runs

**What to build:** The part of a Venture the Manager is meant to see. The roles matrix gives him three
rows and the app honours none of them: he buys a Venture's cattle, feeds them, doses them and sells
them, and there is no screen anywhere that tells him a Venture exists.

**Blocked by:** None.

**Status:** done

**Spec:** [The roles matrix](../../openfarm-investor-projects/assets/venture-roles-matrix.md), three rows
quoted below. [Ventures spec](../../openfarm-investor-projects/spec.md), "Who may do what" — the Manager
sees the work and never the money between the Owner and her Investors. `CONTEXT.md` — **Venture**,
**Running Budget**, **Reimbursement**.

- [x] A Manager can see, for a Venture, what the matrix gives him: its budgets, what it has spent, and
      what is going wrong — and none of what it does not
- [x] An Animal's own page says which Venture owns her, to everyone the matrix says may read it
- [x] Nothing on any of it names an Investor, a Unit, a split, a payout or a Venture's result
- [x] A Staff member and a Vet see no change anywhere
- [x] Somebody opens it as the Manager — not as the Owner — and looks at it

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

**An Animal's page already says whose she is, and this ticket was wrong twice about it.**
`animals.byTag` loads `owner: { columns: { id: true, name: true } }` and returns
`owner: theCost ? (herPage.owner ?? null) : null` (`routers/animals.ts:480,588`), where
`readsWhatSheCost` is `owner || manager` (`scope.ts:140`) — and
`apps/web/src/components/animal/animal-profile.tsx:183` draws it, with a comment already saying "the
server says nothing of it to anybody it is not the business of, so what arrives here is already the
right answer." Read as the Manager on the seeded farm, F-0021's header says **ঈদ ২০২৭ ভেঞ্চার**. Staff
and the Vet get `null` and see nothing.

_(Corrected twice, 2026-09-19. The ticket first said the server sent nothing — written on a grep of
`routers/animals.ts` for `ownerVentureId`, which the relational query calls `owner`. It then said the
page never drew it — written on a grep of `$tagNumber.tsx` for "venture", when the drawing is in
`animal-profile.tsx` and the field is `owner`. The repo's own rule covers this: verify a bug before
carrying it. A grep for one spelling in one file is not a verification, and saying it twice did not make
it truer. **This criterion was already met before any of this work started.**)_

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

## What was decided while building

**Half of this ticket was already built, and the ticket was wrong twice about it** — see the correction
above. The Animal's page has said whose she is all along, to the Owner and the Manager and to nobody
else. Read as the Manager on the seeded farm, F-0021's header says **ঈদ ২০২৭ ভেঞ্চার**.

**A panel on his own page**, chosen by the Owner (2026-09-19) over a section on the fattening board or a
page of his own: he sees it when he opens the app rather than having to remember to go anywhere, and it
mirrors the panel the Owner now has on hers.

**`ventures.running` is its own procedure, not `ventures.list` narrowed on the way out.** A field the
client merely does not draw is still a field the client was sent, and what is kept back is who trusted
the Owner with money, how much each put in and what any of them is owed. It carries the name, the state,
both budgets planned and left, what has been spent, the Running Budget warning, the Target Window, the
wind-up day and how many animals still stand — and nothing else.

**Proved by switching it off.** The test asserts the answer has no `signedFor`, `capitalInBdt`,
`paidOutBdt`, `balanceBdt`, `unitPriceBdt`, `units`, `targetCapitalBdt` or `floorBdt`. Adding
`unitPriceBdt` back to the handler turns it red; it was added, seen red, and removed again.

**Only the runs with animals to look after.** `AT_WORK` is buying, fattening and selling: one still Open
has bought nothing and one that is over has nothing left to feed, and neither is work he can do anything
about today. The seeded settled Venture is correctly absent from his list, and the Open one in
`ventures.test.ts` is asserted off it.

**`ventures.herd` is still unclaimed.** It returns the per-Animal reading — weights, gains, days to the
window — and this panel does not use it: what the matrix gives the Manager is budgets, spend and
warnings, and the per-Animal rows are the same animals `/fattening` already lists. Folding the two
together is a real piece of work and a different one; it stays unclaimed rather than half-used.
