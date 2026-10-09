# Settings and lists survey — what the Owner sets, and what changing it does (2026-10-07)

Against main at 87b49dfe.

Most of it holds up. `farm.setParameters` takes only the fields it is sent and checks each one's bounds on the server. It judges the pairs that must agree (the AI window, quiet hours, the Investor cap and warning, keep days, milk days) behind the farm lock. Every Owner-only figure is refused to the Manager and hidden from what the Manager's screen loads. Each save is audited with its before. A Manager's change tells the Owner. A change to gestation or a calving lead re-times every expected calving and moves its open work. A Venture copies its floor and budgets when it opens, and freezes its wind-up at the first signing. Every refusal the Parameters screen can meet has Bangla words. The list rule in names.ts (Unicode, spacing, case, both languages, retired names included) is applied by feeds, drugs, diseases, breeds and categories.

The headline defects:

- **The Agreement paper prints today's wind-up days, not the Venture's.** After the first signing the Venture keeps its own figure. If the Owner then changes the farm's figure, the next Investor signs a paper with the new number. The buy-back still runs on the old one. (S1, proven, high)
- **Changing the profit split mid-Venture leaves one Venture on two splits.** The portal offers the new split. The server signs a second Investor on it. The Settlement is then blocked with `agreements_disagree`. (S2, proven, high)
- **Lowering the escalation time means the Owner is never told of work already late.** (S3, proven, medium)
- **A retired feed can be fed again.** Putting a Pen on a Ration that names it is not refused. (S4, proven, medium)
- **A Manager's change to the farm's identity or registration certificate is not told to the Owner,** though Parameter changes are. (S6, proven, medium)

Proofs were temporary tests in `packages/api/src/routers/zz-settings-*.test.ts`. Each went red as described below and was then deleted.

---

## S1. The Agreement paper prints the farm's wind-up days, not the Venture's — **Proven**, high

**What happens.** The first Investor's signing freezes the Venture's wind-up days from the farm's figure (`agreement-write.ts:160-169`). After that, `agreementLaidOut` still fills `{windUpDays}` from the farm's current figure. Both the paper printed to sign and the in-app offer do this.

In the test, Investor A signed with the farm at 30 days. The Owner then set it to 45. Investor B's paper said "a wind-up period of 45 days". A's copy, and the Venture itself, ran on 30.

The reverse also happens (traced). Suppose a paper is printed or offered at 30, then the figure is changed, then the first signing or approval happens. The Venture freezes the new figure, not the one on the paper.

**Why it matters.** An Investor signs a mudarabah paper naming a buy-back date the farm will not keep. The reprinted copy of his own Agreement will then show a different number from the paper he signed.

**What should happen.** Once anyone has signed, every paper and offer prints `windUpDaysOf(venture, farm)`. The first signing should freeze the figure on the paper being signed, or refuse if the farm's figure has changed since that paper was laid out.

**Where.** `packages/api/src/agreement-paper.ts:94`; `packages/api/src/routers/investor-statements.ts:167`; `packages/api/src/agreement-offer-store.ts:195`; `packages/api/src/agreement-write.ts:160-169`.

## S2. Changing the profit split mid-Venture leaves one Venture on two splits — **Proven**, high

**What happens.** `ventureInvestorsPercent` is meant to be a starting point only. It also does two other jobs:

- It is the split the portal tells every Investor an Open Venture is offered on (`venture-showing.ts:225-231`).
- It is where the Owner's sign sheet starts (`sign-agreement-sheet.tsx:667-683`).

The server checks a new Agreement's split only against the Farm's own Units (`assertTheFarmsSplit`), and only when the Farm holds some. It does not check it against the Investors already signed.

In the test, Investor A signed at 60%. The Owner set the farm's figure to 50%. The portal then offered the same Venture to a third Investor at 50%. A second Investor was signed at 50% without complaint. The Settlement showed `agreements_disagree`.

Where the Farm does hold Units, the portal still shows the farm's new figure, but signing is refused at it (traced).

**Why it matters.** A mudarabah partner is told the split before joining. Here he is told one that the Venture cannot settle on. The mistake surfaces only at Settlement, and is put right only by an Amendment every Investor must sign.

**What should happen.** Once a Venture has an Agreement, its split is that Agreement's. The portal offer, the Projection (`offerProjectionOf`) and the sign sheet all show it. The server refuses a new Agreement or offer on any other split, with a word of its own.

**Where.** `packages/api/src/agreement-write.ts:122-127`; `packages/api/src/agreement-offer-store.ts:176-181`; `packages/api/src/venture-showing.ts:221-232`; `packages/api/src/settlement-store.ts:270`.

## S3. Lowering the escalation time means the Owner is never told of work already late — **Proven**, medium

**What happens.** The sweep tells the Owner of late work only when its escalation moment falls after the last sweep (`escalatedAtOf(instance) >= from`). The escalation moment is worked out from today's `escalationMinutes`. Lower it while work is late, and the new moment is already behind the sweep. That work is then never escalated.

In the test, work went late at 05:30 with escalation at 120 minutes. It was swept at 05:40 and 06:30. The Owner then set escalation to 15 minutes. Sweeps at 06:35, 07:30, 09:00 and 15:00 never told the Owner, though the work stayed late. With the figure left at 120, the Owner was told at 07:30.

**Why it matters.** Someone lowers the figure to hear sooner. Instead, the Owner never hears of the work already late. A farm with late milkings, or a Manager who lowers it on purpose, gets silence.

**What should happen.** The Owner is told of any open late work past its escalation moment that the Owner has not been told of, however far behind the sweep's window that moment lies. Or the setting change itself escalates what is already past the new line.

**Where.** `packages/api/src/instances-store.ts:1008-1014` (and `:972-976`).

## S4. A retired feed can be fed again — **Proven**, medium

**What happens.** A feed may be retired while no Pen is on a Ration that feeds it. `feed.rations.assign` then puts a Pen on such a Ration without complaint. It checks only that the Ration itself is not retired. Bringing back a retired Ration and assigning it is the same hole.

**Why it matters.** The Pen is now fed a feed that cannot be bought (`stock.ts:297`), counted (`stock-store.ts:557`) or warned of running low. Its store drifts out of sight. This is the exact case the retire guard exists to stop.

**What should happen.** `assign` refuses with `feed_retired` when the Ration's current Version names a retired feed, as saving a Ration does (`refuseFeedsNotFed`).

**Where.** `packages/api/src/routers/feed.ts:616-650` (only `known.retiredAt` at `:644`); the guard it gets round is at `feed.ts:276-300`.

## S5. Retiring a feed with stock in the store takes it out of every Stock Count — **Traced**, medium

**What happens.** `feed.items.retire` asks only whether a Ration feeds it, not whether stock is on hand. After that, a count neither asks for the feed nor accepts it. The Manager may retire feeds.

**Why it matters.** The store count is the Owner's check on the Manager (decision of 2026-10-04). A feed that is short can be retired before the count. The Owner is then never told under `storeShortfallTellMoney`. Only the trail shows it.

**What should happen.** Refuse to retire a feed with stock on hand until a count brings it to nothing. Or tell the Owner when one is retired with stock left.

**Where.** `packages/api/src/routers/feed.ts:276-300`; `packages/api/src/stock-store.ts:557-569`.

## S6. A Manager's change to the farm's identity or certificate is not told to the Owner — **Proven**, medium

**What happens.** `setParameters` tells the Owner of a Manager's change with `settings_changed`. `setIdentity` and `setCertificate` are also the Manager's to use, and tell nobody. In the test, the Manager changed the registration number and the Owner received nothing.

**Why it matters.** These details print on every transport card, receipt and Investor paper. A cleared registration number blocks every transport card. The Owner's decision of 2026-10-04 was to hear of the Manager's changes to the farm's settings.

**What should happen.** The same `settings_changed` notice is sent for a Manager's identity or certificate change.

**Where.** `packages/api/src/routers/farm.ts:653-695` (certificate), `:701-748` (identity); the notice helper is at `:336-361`.

## S7. Changing the days to a Pregnancy Check does not move a check already waiting — **Proven**, low

**What happens.** A service raises its Pregnancy Check at once, due `pregnancyCheckAfterDays` later. Calving work is re-timed when its Parameters change. Checks are not. In the test, a check was raised at 45 days (due 16 February). After the figure was set to 35, the check was still due 16 February.

**Why it matters.** The Vet comes on the old day for every cow served before the change. Only cows served afterwards follow the new figure, so the herd runs on two timings for six weeks.

**What should happen.** As calving work is: when `pregnancyCheckAfterDays` changes, move the open check work of each standing attempt to the new day, on the trail.

**Where.** `packages/api/src/routers/farm.ts:918-934` (only calving is re-timed); `packages/api/src/instances-store.ts:300-308`.

## S8. Re-timing calvings reads the farm as the request found it, not as it stands — **Traced**, low

**What happens.** The holding-together checks read the farm afresh behind the lock (`standing`). Re-timing calvings works from `{ ...context.farm, ...changes }` instead. If the Owner saves the dry-off lead while the Manager saves gestation, the second save re-times every calving with the first one's old lead.

**Why it matters.** Calving work then sits on a lead the farm no longer has, until the next change. It is rare, because it needs two saves at once.

**What should happen.** Use `pregnancyTimesOf({ ...standing, ...changes })`.

**Where.** `packages/api/src/routers/farm.ts:913-930`.

## S9. A registration that expires before it was issued is accepted — **Proven**, low

**What happens.** An issue date of 2066-01-01 with an expiry of 2060-01-01 saves without a word.

**Why it matters.** One slip of the year marks the farm's registration as expired. It raises renewal work and an "expired" warning on the inspector view.

**What should happen.** Refuse it with a word of its own. When only one of the two dates is sent, judge it against the one stored.

**Where.** `packages/api/src/routers/farm.ts:226-242`, `:724-748`.

## S10. A copy of a stamped Agreement shows the farm's name and registration as they are today — **Proven**, low

**What happens.** `agreementCopy` lays the copy out from today's farm. After a rename, a paper headed as a copy of the stamped original carries the new name. Receipts and transport cards do the same (`papers.ts:395`, `:452`). The record of a printed paper keeps only the registration number (`export-store.ts:75-83`).

**Why it matters.** A copy that differs from its original in the farm's own name and registration is weak evidence in a dispute.

**What should happen.** An Agreement copy uses the farm's details in force on the stamped day. Other papers either do the same, or say "farm details as of today".

**Where.** `packages/api/src/routers/investor-statements.ts:265-280`.

## S11. "Start with the standard lists" adds a disease the farm already has under another spelling — **Proven**, low

**What happens.** In the test, the farm had "খুরা রোগ" (Foot-and-mouth disease). The standard health list then added "ক্ষুরা রোগ" as a second entry. `addDiseases` skips a standard disease only when its Bangla name matches exactly. Feeds and drugs check both languages through `nameTaken`, and the disease's own other names include "খুরা রোগ".

**Why it matters.** One disease appears twice on the Vet's list. Only one report is raised (`health-store.ts:698` takes the first match), so this is a messy list, not a missed report.

**What should happen.** Skip a standard disease that any entry already answers to: by Bangla, by English or by one of its other names.

**Where.** `packages/api/src/standard-store.ts:234-265`.

## S12. A breed typed with a double space is refused as unknown — **Proven**, low

**What happens.** `breedNamed` only trims the typed name and lowercases it. It does not collapse inner spaces, so "Red  Chittagong" finds no breed and the register row is refused.

**What should happen.** Compare through `sameName`, as names.ts says.

**Where.** `packages/api/src/breed-store.ts:142-157`.

## S13. Farm Accounts are retired and brought back outside the list rule — **Proven**, low

**What happens.**

- Retiring an account already retired moves its retired day to today (January became March in the test) and writes a second event.
- An id that is not the farm's is retired without complaint.
- Bringing back an open account also writes an event.

**Why it matters.** farm-list.ts promises that a second tap is not a second event. Here the trail shows a retirement on the wrong day.

**What should happen.** Use `retireFromList` and `bringBackToList`.

**Where.** `packages/api/src/routers/farm-accounts.ts:177-237`.

## S14. Sheds and Pens cannot be retired — **Traced**, low

**What happens.** There is no retire, no restore and no retired column on `shed` or `pen`. A torn-down Pen stays in every picker for ever.

**What should happen.** Add retire and restore. Refuse to retire while the Pen holds animals or a Ration, or is the quarantine Pen.

**Where.** `packages/api/src/routers/sheds.ts`; `packages/db/src/schema/herd.ts:39-80`.

## S15. Money Categories, Farm Accounts and notifiable diseases cannot be renamed — **Traced**, low

**What happens.** Breeds, feeds, drugs, sheds and Pens each have a rename. These three lists do not. A typo in a Category name ("বিদুৎ বিল") is put right only by making a new Category and retiring the old one, which splits a year of money across two names.

**What should happen.** Add an audited rename that refuses a name already taken (`assertNameFree`). For Categories, it also refuses a standard name.

**Where.** `packages/api/src/routers/money-entries.ts:203-460`; `farm-accounts.ts`; `notifiable-diseases.ts`.

## S16. Withdrawing a Year Change is not judged behind the farm lock — **Traced**, low

**What happens.** A withdrawal is judged outside the write and without the lock, though recording a change takes the lock. A change recorded meanwhile can stand on top of the one withdrawn. A second withdrawal at the same time still writes an event.

**What should happen.** Judge it inside the write, behind the farm lock.

**Where.** `packages/api/src/routers/financial-years.ts:155-205`.

## S17. Changing the currency, time zone or first year-start month on the server re-reads every record — **Traced**, low

**What happens.** At boot, `OPENFARM_CURRENCY`, `OPENFARM_TIME_ZONE` and `OPENFARM_YEAR_STARTS` are checked to be valid. They are not checked against the values the records were kept under, because nothing stores those. `OPENFARM_YEAR_STARTS` is read fresh each time. Changing it re-cuts years that have ended, which gets round "an ended year keeps its length".

**Why it matters.** A mistyped setting on a server rebuild silently rewrites history.

**What should happen.** Record all three at first boot. Refuse to start when they differ, unless told plainly to.

**Where.** `packages/api/src/farm-locale.ts:24-52`; `packages/api/src/year-store.ts:12-22`.

## S18. Digest times typed in Bangla digits, or without a leading zero, are refused — **Traced**, low

**What happens.** "০৭:০০" and "7:00" are refused as "not a time of day". The screen says why in Bangla, but the farm reads Bangla digits in times elsewhere (`latinDigitsOf`, `lib/course-times.ts`).

**What should happen.** Turn the digits to Latin and pad a one-digit hour before sending.

**Where.** `apps/web/src/components/farm-parameters.tsx:619-623`; `packages/api/src/routers/farm.ts:839-850`.

## S19. A Bangla figure or a decimal in a number box is answered by the browser, not the farm — **Traced**, low

**What happens.** A `type="number"` box reads "৩০" or "1.5" as nothing, and Save lights up. Nothing wrong is saved: the browser blocks it with its own message, in its own language.

**What should happen.** Use a text box with a numeric keyboard, read through `latinDigitsOf` as the Shed Phone screens do, and refused in the farm's words.

**Where.** `apps/web/src/components/farm-parameters.tsx:619-627`, `:735-749`.

## S20. Saving the farm's name and address together can lose the typed name — **Traced**, low

**What happens.** The name and the address are saved by two calls, and each success clears the whole form. If the address saves and the rename is refused, the typed name is gone while the refusal shows. An emptied name box gets the general "look at each box" words rather than "the name cannot be empty".

**Where.** `apps/web/src/routes/_authenticated/farm/index.tsx:89-100`.

---

### Owner choices

1. **Once anyone has signed for a Venture, should every later paper and offer print that Venture's own wind-up days and split, whatever the farm's figures say now?** Recommended: yes. A paper laid out before a change to either figure should be printed again before it is signed.
2. **Should every Investor in one Venture be held to the first Agreement's split, refused otherwise?** Recommended: yes. The only way to a new split is an Amendment that moves them all.
3. **Should the Manager keep setting the escalation time and the quiet hours?** Both decide when the Owner hears of late work and of pushes. Recommended: make escalation the Owner's, as the other checks on the Manager are. Leave quiet hours with the Manager, told to the Owner as now.
4. **Should a feed with stock still in the store be retirable, and by the Manager?** Recommended: refuse until a count brings it to nothing. The Manager keeps the right to retire empty feeds.
5. **Should a Manager's change to the farm's identity or certificate be told to the Owner?** Recommended: yes, with the same `settings_changed` notice.
6. **Should a reprinted Agreement copy show the farm as it was on the stamped day?** Recommended: yes for Agreement copies. Receipts and transport cards may print "farm details as of today".
7. **Should torn-down Pens be retirable, or only renamed?** Recommended: retirable, refused while the Pen holds animals or a Ration.
8. **Should a pregnancy check already waiting move when the days to the check change?** Recommended: yes, as calving work does.

### Checked and holding

- **Bounds and pairs.** Every Parameter has whole-number bounds on the server. The AI window (opens before it closes, at most a day), quiet hours (not the same), the Investor warning (not past the cap), keep days and milk days are judged against the farm as it stands behind the lock. Two people saving at once cannot leave a pair that does not hold.
- **Owner-only figures.** Each is refused to the Manager by name: Venture figures, keep and cull, Returns, Monthly Costs day, Receivable days, missing write-off, approval line, Manager correction days, and every "when a short count is told" line. The Venture figures, the short-count lines and the market price are left out of `farm.current` and of the Manager's answer from the save. The Owner-only groups are not drawn for the Manager.
- **Audit and telling.** Every Parameter save is audited with its full before. A Manager's save tells the Owner with `settings_changed`; the Owner's own saves tell nobody. Market price (low ≤ high), the portal switches and the Default Withdrawal Days (the Vet's alone) are each audited with their before.
- **Gestation and calving leads.** A change re-times every expected calving worked from a service. A date given at intake stays. Open dry-off and calving-prep work moves to the new day, on the trail. A cow who calved, aborted or left has no expected calving to re-time.
- **Approval line.** Raising it releases nothing already waiting, and lowering it re-opens nothing approved. The Owner still answers what waits.
- **Correction windows.** These are read when the correction is asked for. Shortening one closes what is now past it, which is what a window is for.
- **Quiet hours mid-flight.** What was held is pushed once the farm wakes, each push once, within a day. A digest time inside quiet hours waits for the farm to wake. Two such times collapse into one.
- **Thresholds mid-flight.** The cash, medicine and store short lines, milk unaccounted, feed price jump, arrival short and shrink lines are each judged at the moment of the count or entry. Changing one later does not re-tell or un-tell anything already told.
- **Venture figures.** Floor and budgets are copied when the Venture opens. The wind-up is frozen at the first signing, and the wind-up itself keeps it. The Farm cannot take Units after an Investor has signed.
- **Investor cap.** It is checked at every signing. Lowering it below today's count stops newcomers and leaves no one out.
- **Lists.** names.ts treats Unicode forms, spacing and case as the same name, in both languages, retired names included, with a "bring it back" refusal for a retired one. The database's unique indexes catch two identical adds at once. A retired drug cannot be newly prescribed, given unprescribed or counted, but an open course goes on. A Ration cannot be saved with, or retired from under, a fed feed. Categories that records use, and Wages, cannot be retired. A retired breed keeps its animals and takes no new ones. Standard breeds are matched by key, so a renamed one is not added again. Running "start with standard" again adds nothing already there.
- **Eid dates.** Announcing a day moves no one. "Bring along" moves only the Farm's own animals, each on the trail; Venture animals wait for an Amendment.
- **Identity and locale.** Rename is the Owner's alone, audited, and never empty. Who keeps the data is the Owner's alone. A bad currency, time zone, country or year-start month stops the server at boot. Year Changes are the Owner's alone, recorded behind the lock, and refused into an ended year.
- **Screens.** Every refusal the Parameters save can give has Bangla words. An old cached `farm.current` without a new figure shows an empty box and sends nothing unless typed in. An empty box cannot be saved.
