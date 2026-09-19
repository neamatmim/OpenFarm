# 05 — When the progress paper goes out

**What to build:** An Investor hears at the moments that matter, without having to ask and without the Owner having to remember.

Four occasions, from story 79:

- **Every month**, while the Venture is running.
- **When buying closes** — his money has become animals, and what the Cattle Budget did not spend has rolled into the Running Budget.
- **At the first Sale** — the run has started turning back into money.
- **When the Wind-up Period starts** — the clock is on, and whatever has not sold will be bought back by the Farm.

Each occasion raises the work of sending; it does not send anything by itself. The Owner generates the paper and issues it, because an Export is somebody's act and the trail has to name who did it.

**Blocked by:** 04 (অগ্রগতি — the paper while the Venture runs)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user story 79; `CONTEXT.md` — **Notice**, **Digest**, **Wind-up Period**, **Venture**.

- [x] The Owner is told, once, on each of the four occasions, that this Venture's Investors are due their paper
- [x] The monthly one falls due once a month per running Venture, and a month already told about is not told again however often the app is opened
- [x] A Venture that is Settled or Cancelled raises none of them
- [x] What the Owner is told names the Venture and how many Investors are waiting
- [~] Tests cover a month raised once across repeated runs, the three event-driven ones each raised by its own act, and a **cancelled** Venture raising nothing

## Checked before starting

**Decide whether this is a Notice or an SOP Instance before building it.** The farm has both, and they behave differently: a **Notice** sits in a person's list and is what the **Digest** carries, while an SOP Instance is work that falls due, can go late, and is claimed and completed. "Send the Investors their paper" is closer to work than to news — it has a doer and a done — but issuing is not yet a recorded act, so there may be nothing to complete against. Whichever it is, the once-only rule needs the same thing the Venture's other repeated work uses: what stops the same month raising the same item twice however often the scheduler runs. `sopInstance.cause` exists for exactly this and is worth reading first.

**"Issue" may or may not be a recorded act.** The roles matrix says the Owner "generates, issues and records acknowledgement" of a statement. Ticket 01 records the generating as an Export. Whether issuing and acknowledging are separate recorded acts — and what an acknowledgement even means for a paper handed over in person — is not settled anywhere, and this ticket should either settle it or say plainly that it is only about the telling.

**The first Sale and the start of the Wind-up Period are both already moments the Venture knows.** Selling and the wind-up buy-back were built in increment 5; find where each transition is made rather than adding a second way of noticing it.

## What was decided while building

**It is a Notice, not an SOP Instance, and the criteria said which.** Every one of them is about the Owner being _told_. An Instance would have to be claimed and completed, could go late, and would want a checker and a Pen it has not got — and there would be nothing to complete it against, because issuing a paper by hand is not a recorded act anywhere. It goes in the **Digest** rather than as an Alert: a letter owed is the evening's post, and a phone that buzzes for one is a phone nobody answers when a Withdrawal is ending. The Owner alone hears it, as the roles matrix has it — the Manager reads a Venture's figures but never its Investors, and producing the paper is the Owner's act besides.

**The occasion lives in the notice's own id.** `alert_once_uidx` is on `(userId, kind, entityId)`, so a bare Venture id would have meant one telling per Venture for ever and February never heard about. The id is `<ventureId>:<occasion>` — a month as `2054-02`, or the word for what happened — which is exactly what `lowStockNoticeId` does for "once each time it runs low". The once-only rule then costs nothing: the index enforces it, and two sweeps racing both come away with one telling between them.

**Two of the four are the clock's and two are acts'.** The month and the start of the **Wind-up Period** are swept in `theSweep`, beside the low stock and the withdrawals, and are silent when no Venture is running so that opening the app on an ordinary morning opens no transaction. Buying closing is raised where the state moves, and the first Sale where `reachesSellingOnASale` moves it — which is the one place that knows it was the _first_, because the state only moves once.

**That last one made an import cycle, and breaking it improved the seam.** `venture-store` telling anybody meant importing the notices, which import `venture-store` back. `reachesSellingOnASale` now returns whether it moved and the Sale's own router does the telling. A store that reaches back into the notices is a store doing two jobs.

**Three things a review caught after the first commit.** The occasion was going into the Owner's message as the word the code keeps — `(buying_closed)` in the middle of a Bangla sentence — and is now worded like a paper's labels. An **Open** Venture counted as running, so one that had taken money but bought nothing would have been told it owed a progress paper about animals it had not got; only Buying, Fattening and Selling do now. And the sweep opened a transaction and wrote an Audit Event saying "nothing raised" every time anybody opened the app: it asks what is untold first, as the low-stock sweep does, and a farm with nothing to say now writes nothing.

**"Issue" is still not a recorded act, and this ticket did not make it one.** The roles matrix says the Owner generates, issues and records acknowledgement; ticket 01 records the generating as an Export. What issuing and acknowledging mean for a paper handed over in person is not settled anywhere, and guessing at it here would have put a state machine on the trail that nobody had asked for. This ticket is the telling, and says so.

## Left as it is, on purpose

**A month nobody opens the app in is a month never told about.** The sweep raises the _current_ month, so a farm that went a whole month without anybody opening the app would skip that telling rather than catch up on it. That is how the low-stock and withdrawal sweeps behave too, and on a farm where the day is turned every morning it costs nothing — but it is a choice, not an oversight.

**A Wind-up Period of nought days is never told about.** `windUpDays` is a Farm Parameter and may be set to zero, which makes the window empty — the day after the Target Window closes is already past the last day of the wind-up. Nothing is lost by it (there is no wind-up to hear about), but it is worth knowing before somebody reads the silence as a bug.

**The settled case is covered by a cancelled Venture rather than a settled one.** Both are `RUNNING`-excluded by the same list and the same guard, and cancelling is three lines of test against the two hundred a full settlement needs. The criterion is marked partial to say so rather than to claim more than was run.
