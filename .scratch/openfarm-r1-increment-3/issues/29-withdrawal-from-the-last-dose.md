# 29 — Withdrawal, from the last dose actually given

**What to build:** Recording a dose puts the animal under Withdrawal — her milk until the dose plus the product's milk days, her meat until the dose plus its meat days — counted from the dose that was really given rather than from the course that was planned, because a course cut short and a course finished late are different animals. The milk gate has been standing since increment 1 with nothing behind it; this is what puts something there. Only the Vet may shorten or end a Withdrawal, with a reason, and the farm keeps both the reason and who gave it.

Meat withdrawal has nothing to refuse until the Sale SOP arrives in increment 4, so it is recorded and shown — her page and the Manager's queue say when she is fit for sale again — and increment 4's Sale reads the same date. Confirmed with the Owner 2026-09-12: a Manager selling a cow in the meantime must not be left without a warning.

**Blocked by:** 28

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 54 and 55; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) ("Withdrawal & gating").

- [x] A dose sets both Withdrawals from that dose, on the product's own days
- [x] Her milk goes to Discard while she is under milk Withdrawal — recorded, never lost — and the phone's gate holds offline on what it last knew
- [x] Her meat Withdrawal is on her page and in the Manager's queue, with the date she is fit for sale again
- [x] Only a Vet may shorten or end a Withdrawal, with a reason; the change is audited and the original stays visible
- [x] Tests cover a dose setting it, a course ending late, the milk gate, the Vet's exception, and everybody else being refused it

## How it was built

**Reckoned afresh from her Treatments, never pushed forward.** A dose given sets both holds from that dose on the product's own days, and the answer is worked out from every dose she has had each time one changes — because it has to survive a Correction. A dose corrected back to a skip shortens the hold again; a dose given late, or given days ago and only synced this morning, lengthens it. The latest end wins, whichever course or product it came from.

**What her doses alone say is kept beside what is in force.** Two columns (`milk_withdrawal_from_doses`, `meat_withdrawal_from_doses`) do two jobs: they are the figure a shortened hold was shortened _from_ — which is what a slaughter vet asks, so it is on her page rather than only in the trail — and they are how a fresh reckoning knows whether it found anything new. A phone sending the same dose twice finds the doses saying what they already said and leaves the Vet's word alone; a dose the farm had not seen before supersedes it, because the Vet shortened a hold on what was known then and a dose is new knowledge whenever it was given.

**The gate was already built; this put something behind it.** Her milk goes to Discard whatever the phone asked for, on the online path and through the Outbox alike — the phone's gate is its last sync and may be stale, the server's is the one that decides, and `forced` records that the answer was taken out of the milker's hands. The litres are recorded, never lost.

**Meat has nothing to refuse until increment 4**, so it is recorded and shown: her page says the day she is fit for sale and so does the Manager's queue, soonest first. Increment 4's Sale reads the same date.

**Shortening is the Vet's alone**, from their own account, with a reason kept on the animal and in the trail. Only ever shorter, and only where something already stands — inventing a hold would be the Vet doing the Drug List's job. `null` ends a hold outright and the call reports what is now in force rather than what used to be.

**A milk Withdrawal ending within the day** raises an immediate Alert to the Manager and the milkers of her Pen — the two the notification table names, because they are the people who decide where tomorrow's litres go. Once per cow per Withdrawal: the notice is about the Withdrawal, not the cow, so a course months later is a new thing to be told. Only for a hold the farm can name a dose for, and only when somebody has not already been told — a sweep with nothing to say opens no transaction.

## Cut, and owed

- **Milk drawn before the dose but synced after it is still discarded.** The gate asks whether the recording instant is inside the hold, and a Withdrawal has no start — so litres genuinely drawn at five, before an eight o'clock dose, are poured away if they arrive afterwards. That errs on the safe side and costs money; giving a Withdrawal a start instant would fix it and is an Owner decision about which error the farm prefers.
- **The meat Withdrawal ending raises no Alert.** The notification table's row is "Withdrawal ending tomorrow | Manager + milkers of that Pen", which is a milk decision; meat ending is planning information and lives on the queue and her page. Increment 4's Sale is where it starts mattering hour by hour.
- **"Withdrawal set / shortened" is not an Alert either.** The table has that row; the farm records both on the animal and in the trail, and nobody is buzzed. Worth its own ticket with ticket 33's SMS work rather than a corner of this one.
- **Ticket 33 wants the Owner told by SMS.** In-app this notice goes to the Manager and the milkers, per the table. 33 decides who a text message reaches.
- **The visiting Vet's scope is still unmodelled** (recorded in ticket 27): `requireOnly("vet")` admits any Vet, and the roles matrix gives a withdrawal override to the in-house Vet only.
- **A dose that does not move the end leaves a shortening standing.** Two doses at the same instant, or a second dose of a shorter-withdrawal product, say nothing new about when she comes off — so the Vet's exception about that hold still describes it. Deliberate.

## Review outcomes folded in

Two-axis review of `1d3b6c9`; both axes found safety-relevant things, and all of it is in the final commit.

- **Both axes — a dose the farm heard about late was swallowed.** The first cut kept the Vet's dates whenever no dose had been _given_ since the shortening, so a dose given before it and synced after it set no hold at all: free when she should be held, with no Needs Review either, against ADR 0002's promise that a late entry is kept and flagged rather than dropped. Rebuilt around what the doses say, which is the whole reason those two columns exist. Tested through `sync.batch`.
- **Both axes — "end it now" reported the old date back.** `milkUntil ?? her.milkWithdrawalUntil` turns `null` into the existing hold, so the API told the farm nothing had happened. Tested.
- **Spec — "shorten" could invent a hold** where none stood, because the guard only refused a later date when an earlier one existed. Tested.
- **Standards — the Owner's and Manager's "under withdrawal" tiles counted meat-only holds** after the read was widened to cover both, and the queue lost its soonest-first order. Each screen now counts and sorts by the hold it is about.
- **Spec — the wrong people were told.** Owner and Manager, where the notification table says Manager and the milkers of her Pen.
- **Spec — the sweep opened a transaction on every call** while any cow sat inside the window, even when everyone had already been told. It now asks first.
- **Standards — the notice claimed to be about an animal** with an id no animal row carries, against the sweep's own rule that a trail entry must find its way back. It is about a Withdrawal now, and her id and tag travel in the params.
- **Standards — `WithdrawalView` re-declared two fields of `LactationView`**, so a spread order decided which won. A Withdrawal is not part of a lactation; the lactation view no longer mentions one.
- **Spec — the Vet could only shorten the milk hold**: the API took `meatUntil` and no screen offered it. It does now, and each field only appears where something is actually held.
- **Spec — "the original stays visible"** was only true of the audit trail. Her page shows what her doses alone said.
- Plus: the "inclusive of the instant" wording was wrong in both twins (she comes off at the instant it names); a comment claimed cleared Drug List days would still hold her; the module docblock had drifted below an import; and a mutable `let` was being filled from inside an audited callback that already returns its value.

**Defended rather than reverted:** the spec axis called the `home.ts` milking-session window fix scope creep, and it is — it is not withdrawal work. It stays because it is a real bug my test collision surfaced: the window had no upper bound, so a Session dated in the future by a skewed phone clock (ADR 0002 keeps it) became the last bar on the Owner's tile, showing the farm tomorrow's half-empty figure as today's. Leaving a known wrong number on the Owner's home screen to keep a diff tidy is the wrong trade.

## Honestly

The intermittent failures I had been reporting for two tickets have a mechanism now, and it was mine: a test that sweeps on a clock later than the rest of the suite's data makes the whole farm's backlog overdue at once, floods every Manager's fifty-notice inbox, and breaks assertions in files it never touches. This file's dates now sit just after the farm was created and it retires the milking round it publishes. Three consecutive clean full runs, and the two rules are written down in the session's memory so the next ticket does not pay for them again.
