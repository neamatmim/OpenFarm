# 05 — Approving, paying out and acknowledging, on screen

**What to build:** Nothing blocks it any more, so the Owner approves the Settlement — and watches the figures stop moving. Then she sends her own **Advance** back, pays each Investor what his frozen share says, takes the Farm's share out for the Farm's books, and the Venture reaches **Settled** in front of her.

As each Investor rings to say he had it, she records that against his payout, and the file shows who has confirmed and who has not.

The screen has to make the order plain — the Advance comes back before any capital does — and has to refuse in words she can act on: paying before approval, paying a man twice, paying anything other than what the paper says.

**Blocked by:** 04 (the Settlement on screen)

**Status:** done

- [x] Approving is one act, from the screen, and afterwards the figures shown are the frozen ones and not what the costing now says
- [x] The Advance is offered first, and paying an Investor before it has gone back is refused in words
- [x] Each Investor is paid with the day and the bank reference it went on, against the figure his paper says
- [x] The Farm's share leaves for the Farm's books, and the account closes at nothing
- [x] Who has been paid and who has acknowledged is shown, and an acknowledgement is recorded with anything he said
- [x] The Venture shows itself as Settled once the last of the money is out

## What was decided while building

**The frozen figures win, and "not approved" is only known once the farm has said so.** Both reviews found the same race independently: the sheet asked both questions at once and read "no approved Settlement" from an answer that had not come back yet. On an already-approved Venture that meant a window — and, if the frozen query failed, a permanent state — showing the live sum, "nothing blocks it", and an enabled **Approve** button over a Settlement approved last week. It now waits for the frozen answer before deciding which it is.

**The account has to be seen closing.** The frozen balance is what it held on the day and does not move as the money goes out, so a fully settled Venture read "the account should hold ৳1,250,005" under "everything has gone out". Both are shown now: what it held when approved, and what it holds today.

**The Advance-first rule is a refusal, not a disabled button.** The first version greyed out an Investor's send button until the Advance had gone back. The ticket asks for it to be *refused in words*, and a button that will not press explains nothing — so it presses, and the farm says why.

**A form opened for the next man starts empty.** The day and the bank reference were only cleared on success, so cancelling on one Investor and opening the next pre-filled his sheet with the previous man's reference. The same defect would have recorded one Investor as saying another's words.

**`CACHE_KEY` bumped.** `approvedSettlement` already existed, so a fortnight-old cached answer has shares with no name on them — which is a blank where the Owner needs to know who to telephone.

## Two things a reviewer was right to raise and I did not change

**Two of the three refusals are unreachable from this screen, by design.** The amount sent is always the frozen share, so "not what he is owed" cannot happen; and the pay buttons only exist once approved, so "not yet approved" cannot either. That is the screen doing its job rather than a gap — but it is worth saying plainly rather than leaving the box ticked.

**Still unseen.** As with ticket 04, nobody has looked at this rendered: signing in needs a password I did not enter, and there is no seeded Venture in a settling state. Compilation and two close readings are all that stand behind it, and between them those readings found six real defects.
