# 33 — SMS for the two safety Alerts

**What to build:** Two Alerts are worth a text message as well as a push: a Withdrawal ending, and a notifiable Diagnosis. Both cost money or break a legal deadline if they are missed, and a push that does not arrive has cost nobody anything — which is fine for the rest, and not fine for these two. The gateway is injected the way web push is, so the farm's own provider is configured at go-live and the path is built and tested before the account exists. Confirmed with the Owner 2026-09-12.

This also closes the last row the notification table still owes: sync problems reach the person whose entries were rejected, immediately.

**Blocked by:** 29, 32

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 92; [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md).

- [x] An SMS transport is injected like the push one, silent by default, with the farm's gateway configured at go-live
- [x] Withdrawal ending and a notifiable Diagnosis go by SMS to the Manager and the Owner, on top of push and in-app
- [x] Nothing else goes by SMS, and the farm's delivery table is still the one place that decides
- [x] A rejected entry tells the person who recorded it, immediately, in the app
- [x] Tests watch the gateway and assert what was sent, to whom, and in which language

## How it was built

**The gateway is injected exactly as web push is**: an interface, silent by default, the farm's own provider read from the environment at go-live with credentials the Owner holds. So the path was built and tested before any account exists, and a farm without one sends nothing and is none the worse for it — the in-app Alert is the record either way. It has the same five-second timeout as the push transport, for the same reason: this is called from the sweep every phone on the farm runs, and a gateway that will not answer must not become a farm that will not answer.

**One table decides.** The farm's delivery table now carries three facts per kind: when a notice goes, whether it is also worth a text, and whether it may wake the farm. A second list is how a farm ends up texting people about a feed digest. The wording map is typed _from_ the table, so a kind marked for texting and given no words is a compile error rather than silence on somebody's phone.

**Every message is written down before it is sent.** That does two jobs. It is the farm's evidence that it told the people it is supposed to tell — these are the two notices that cost money or break a deadline, and "we did text you" should not rest on anybody's memory. And it is how the farm knows it has already said this: a notice reaches the app for every person it concerns, but one Withdrawal ending is one thing to be texted about.

**Each recipient reads their own language.** A safety message somebody has to translate in their head is a safety message read slowly.

**People have numbers.** Your own always; somebody else's if you run the farm, because a Manager writing the Owner's number down from a scrap of paper is how a farm actually collects these — but never the Owner's, which is the Owner's own, because a Manager who could redirect or blank it could quietly stop the safety messages arriving.

**And two more rows of the notification table are paid**: an entry the farm would not take tells the person who recorded it, at once, in the app; and a Withdrawal starting or being shortened tells the Manager, because that is where tomorrow's milk goes.

## Cut, and owed

- **"Instance claimed / reassigned | new assignee | digest"** is still unimplemented. There is no reassign procedure to hang it on — the roles matrix's "pin/reassign" is a later ticket's — so the notice would have nothing to announce.
- **"Sync paused — login needed"**, the other half of the rejected-entry row, stays a banner on the phone. The server never learns that a phone is signed out; the phone is the only thing that can say so, and it does, in the sync banner.
- **Nothing records what a text cost.** The farm pays per message and cannot yet see its bill from the app. Increment 6 is where money lives.

## Review outcomes folded in

Two-axis review of `aadedf5`.

- **Standards — no timeout on the gateway call.** The transport this mirrors sets one deliberately; a hung gateway would have blocked the sweep every phone calls. Fixed, and the send is wrapped so nothing about a text message can take down the work that raised the notice.
- **Standards and spec together — nothing recorded what was texted**, which is also why the same Withdrawal could be texted about twice: the messages were derived from newly-raised in-app rows, and telling somebody new about an existing hold raised another. One table answers both.
- **Standards — `setPhone` never scoped to the Farm.** `.where(eq(user.id, whose))` reaches any user row in the database, so a Manager here had standing over a person who is not theirs. Scoped now, and the Owner's own number is the Owner's alone.
- **Standards — the audit had no `before`**, on the one field where a Manager may overwrite the Owner's. A trail that cannot show what was replaced is no help.
- **Spec — a refused entry buzzed a pocket at two in the morning.** Quiet hours are 22:00–05:00 with safety alerts excepted, and only the two safety kinds now cross them. Everything else still reaches the app at once: the quiet is on the phone, not on the record.
- **Spec — my commit message overclaimed.** It said this "closes the last row the notification table still owes". It did not: "Withdrawal set / shortened" was parked here by ticket 29 and I had not built it. Built now, and the two rows that genuinely cannot be built yet are written down above instead of being quietly counted as done.
- **Standards — the wording map could veto the table** silently; it is derived from the table now.
- Plus: the casts are gone, `interface Worth` is `Textable`, and the sync router no longer rebuilds the notice the batch already built — which is how its count and reason had been getting lost.
