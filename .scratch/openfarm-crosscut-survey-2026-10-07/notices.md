# Notices, end to end — crosscut survey 2026-10-07

Against main at 22b479da. Each finding is marked **Proven** (a temporary test in `packages/api/src` went red, and was then deleted) or **Traced** (followed line by line).

The plumbing holds up well. One table says who hears each kind, people who have left are skipped, the Owner hears when nobody else is left, quiet hours hold pushes until morning, and the digest is claimed once. The defects are at the edges of that table.

- **The safety text fires for the wrong animals.** A bull given an antibiotic gets "her milk withdrawal is ending", by push and in the app, and the Owner and the Manager get an SMS about it. A cow who died or was sold during her hold is texted about in the same way. When a hold starts again because the Vet raised a product's days, nobody is told.
- **Two notices flood.** Password guessing that goes on raises a new notice every five minutes. A server coming back after days down pushes every late milking at once.
- **Notices do not clear when their cause goes.** A Missing taken back by a Correction keeps its red notice for good. So does a voided death, a resolved review and a paid debt, along with a dozen other kinds.
- **The store's notices miss the Owner fallback.** Their sweeps check for a Manager first. On a farm with no Manager they never reach the Owner. Once a Manager is disabled, they write an Audit Event on every sweep.
- **Needs Review says nothing.** The notice for a doubted weighing or a late entry reads " in The whole farm needs a look".

### The safety notices and the milk hold

N1. **Proven, high.** A milk Withdrawal is raised, told and texted for any animal, fattening bulls included.

- **What happens:** a bull given a product with milk days triggers three notices:
  - `withdrawal_changed`, pushed to the Manager;
  - `withdrawal_ending`, to the Manager and the staff of his Pen;
  - two SMS, to the Owner and the Manager: "F-0001 — দুধ আটকে রাখার সময় শেষ হচ্ছে।".
- **Why it matters:** on a farm that is mostly fattening, most safety texts will be about bulls. Each one costs money. SMS ignores quiet hours, so many arrive at night. And it teaches the two people who must act on a real one to ignore them.
- **What should happen:** only a female on the dairy side who is still on the farm has a milk hold to tell about.
- **Where:** `health-store.ts:486-536` (`withdrawalsEndingSoon` filters on the date alone) and `health-store.ts:415-431` (`recomputeWithdrawal` raises `withdrawal_changed` for any animal).

N2. **Proven, medium.** A cow who dies or is sold during her hold is still told about and texted.

- **What happens:** she died a day after her dose. 2.5 days later the sweep raised `withdrawal_ending` for two people, and two SMS went out.
- **The gap:** the home lists drop animals who have left (`isOnTheFarm`, `instances-store.ts:1231`). The notice's query does not (`health-store.ts:486-536`).

N3. **Proven, medium.** A hold started again by the Vet raising a product's days is told to nobody.

- **What happens:** a cow dosed under 4 milk days was clear by day 5. The Vet then set the product to 10 days. Her milk is held until day 10, and `withdrawal_changed` was not raised (count stayed at 1).
- **Why:** `reachBackWithdrawalDays` calls `recomputeWithdrawal` without `givenNow` (`health-store.ts:439-470`, `drugs.ts:473`). Only a dose being given now tells (`health-store.ts:415-431`).
- **Same gap, traced:** a dose corrected back to a skip shortens or ends a hold silently. Yet `NOTICES` says a hold "being cut short" is the Manager's to know (`notice.ts:108-109`).
- **Result:** the Manager finds out when the milk gate refuses the tank.

### Floods and repeats

N4. **Proven, medium.** Password guessing that goes on raises a new notice on every sweep.

- **Why:** the notice id is the first wrong password inside the sliding hour (`the-day-turns.ts:652`). That moves every minute while somebody keeps guessing — and a slowed account still takes one try a minute.
- **What happened:** four sweeps five minutes apart gave four `password_guessed` notices for one login.
- **At night:** the kind does not wake the farm, so a night of it is held. Every one is then pushed at 05:00, each under its own tag, about 84 for seven hours.
- **Also:**
  - logins that are no account count too;
  - the words say "from more than one place", though five wrong passwords from one place count the same (`the-day-turns.ts:636-700`).
- **What should happen:** one notice for each run of guessing.

N5. **Proven, medium.** A server back after days down pushes every late piece of work at once.

- **Setup:** 5 Pens, a twice-a-day procedure, down from the evening of the 1st until 08:30 on the 5th.
- **What happened:** the first turn raised 40 pieces of work and pushed 35 `instance_overdue` to the Manager and 35 `instance_escalated` to the Owner. Each has its own tag, so they stack on the phone.
- **At farm scale:** with 20 Pens and the 7 days caught up, each sweep carries 200 (`instances-store.ts:890`).
- **Knock-on:** the in-app list returns the newest 50 (`routers/alerts.ts:13`). Older urgent notices — a notifiable disease, an animal missing — fall off it.
- **What should happen:** the catch-up is said once ("N pieces of work from the days the server was down"), and the backlog itself is not pushed.

### Notices that stand after their cause is gone

N6. **Proven, medium.** A Missing taken back by a Correction keeps its red notice for good.

- **What happens:** the Correction deletes the Missing row (`missing-store.ts:74-87`). The sweep that clears notices looks the Missing up by id, finds nothing, and so never clears it (`settled-notices.ts:84-117`).
- **What happened in the test:** after the round was corrected to "well", both the Owner's and the Manager's urgent "not found" notices were still showing.
- **What should happen:** a Missing that no longer exists counts as settled.

N7. **Proven / Traced, medium.** The 2026-10-06 rule that a notice clears once its cause is gone reached five kinds; the rest stand until tapped.

- **Proven:** a death voided by the Owner keeps `mortality_recorded` (Owner) and `mortality_undiagnosed` (Vet) showing for an animal back on the farm.
- **Traced:** none of these has any clearing code:

  | Kind                                                             | Its cause, gone                                                                      |
  | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
  | `needs_review`                                                   | review resolved (`review-queue.ts:167,276`), or the doubt lifted (`weigh-in.ts:163`) |
  | `receivable_overdue`                                             | paid or written off                                                                  |
  | `reimbursement_due`                                              | paid                                                                                 |
  | `monthly_sum_missed`                                             | paid late                                                                            |
  | `investor_statement_due`                                         | the paper made                                                                       |
  | `low_stock`, `lot_expiring`, `lot_expired`, `medicine_low_stock` | restocked or used up                                                                 |
  | `sold_under_cost`, `large_shrink`                                | Sale voided or its price corrected                                                   |
  | `cash_short`, `store_shortfall`, `medicine_short`                | count taken back (`cash-store.ts` `removeCashCount`)                                 |
  | `notifiable_diagnosis`                                           | the Vet corrects the Diagnosis                                                       |
  | `withdrawal_ending`                                              | the hold lengthened by a later dose                                                  |
  | `monthly_copy_failed`                                            | a good monthly copy since                                                            |

- **The only clearing code:** `settled-notices.ts`, `money-store.ts:675`, `join-request-notice.ts:55` and `pay-in-notes.ts:~170`.

### Who hears

N8. **Proven, medium.** On a farm with no Manager, the store's notices never reach the Owner.

- **Kinds:** `low_stock`, `lot_expiring`, `lot_expired` and `medicine_low_stock`.
- **Why:** the sweep's pre-checks return nothing when there are no Managers (`stock-store.ts:445-448`, `lot-notices.ts:176-179`). `tell()`'s Owner fallback is never reached.
- **What happened:** medicine under its level with only an Owner and a Vet gave no notice at all.
- **Why the existing test passes:** `nobody-to-tell.test.ts` calls `tell()` directly, skipping the sweep.

N9. **Proven, medium.** Once a Manager is disabled, the same per-person pre-checks count them as never told.

- **What happens:** every sweep — every five minutes, and on every app open — writes an Audit Event and tells the Owner nothing new.
- **What happened:** three sweeps gave three `store` events.
- **Why:** `holdersOf` does not skip disabled people (`alerts-store.ts:20-36`); `tell()` does.
- **Same pattern:**
  - `receivable-store.ts:632` (Owner and Manager);
  - for a disabled second Owner: `investor-statement-notice.ts:~186`, `reimbursement-store.ts:204` and `monthly-sums-store.ts:160`.
- This is the 2026-10-06 home survey's A1 problem again, through a different path.

N10. **Traced, low.** A Role taken away leaves its notices behind.

- **Pens and work:** `setRoles` revokes the Role but keeps Pen Assignments and pinned or claimed work. Only disabling clears them (`membership.ts:207-232` against `265-310`). A milker made Manager-only still hears `withdrawal_ending` for her old Pen.
- **Old notices:** `alerts.mine` reads by person alone (`routers/alerts.ts:55-66`). A Manager moved to Barn Staff keeps reading buyers' debts in his list.

N11. **Traced, low.** A Shed Phone keeps the last person's pushes after Lock.

- **What happens:** the push subscription moves only on a PIN Switch made with signal (`shed-phone.tsx:303-313`).
- **Why it matters:** a person holding Barn Staff and also Manager or Owner leaves their notices showing on the barn phone's lock screen until the next milker switches in online. For an Owner that includes what a death cost and Pay-in Note amounts.

### Words

N12. **Proven, medium.** Needs Review says nothing for anything but a Step.

- **What it reads:** " in The whole farm needs a look" / "পুরো খামার-এ দেখা দরকার".
- **When:** for a doubted weighing, a late Shed Phone entry, a phone's clock or sequence gap, and a heat that came in after its window. These carry no procedure or Pen.
- **What is missing:** no tag, no weight, no phone named. The weighing and entry notices have nowhere to lead either.
- **Where:** `notice-words.ts:121-122`, `batch-store.ts:168-218`, `effects/weigh-in.ts:185-205,340-353`, `the-day-turns.ts` (`flagHeatsThatArrivedTooLate`).
- **What should happen:** name the animal and the weight or the phone, and lead to `/review-queue/needs-review`.

N13. **Traced, low.** Feed and medicine are named in Bangla to an English reader, though an English name is kept.

- **Kinds:** `low_stock`, `feed_price_jump`, `lot_*`, `medicine_low_stock`, `expired_dose_given` and `dose_not_prescribed`.
- **Where the English name is kept:** `feed.ts:37`, `health.ts:39`.
- **The contrast:** procedures and money categories use `named(bn, en)` (`notice-words.ts`, `stock-store.ts:487`, `effects/treatment.ts:186`). An English-reading Vet gets the product in Bangla.

N14. **Traced, low.** Smaller wording faults:

- `still_here_after_eid` says "(0 of them a venture's)" when there are none.
- `password_guessed` claims "more than one place" (see N4).
- A "YYYY-MM-DD" fact is read as UTC midnight and printed in the farm's zone (`notice-words.ts` `saidDate`, `i18n/format.ts:82`). The Reimbursement month does the same with `T06:00Z`. That is right in Dhaka, but a day or a month early on a farm west of UTC, which `OPENFARM_TIME_ZONE` allows.

### Where it leads

N15. **Traced, low.** Procedure notices lead Barn Staff and the Vet to a page they cannot open.

- **What happens:** `sop_published`, `sop_retired` and `sop_restored` go to whoever does the work. They lead to `/sops` or `/sops/$id/card`, which sit behind `onlyFor("runsTheFarm")` (`sops/route.tsx:315-318`, `alert-list.tsx:95-105,152-158,323-334`).
- **Result:** a milker tapping "Open the procedures" is sent home.

N16. **Traced, low.** Some pushes and list links open the wrong page:

| Notice                                                     | Opens                                         | Should open                       |
| ---------------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| `monthly_copy_failed` push                                 | `/work` (`push.ts:44-79`)                     | Backups, as the list does         |
| `pen_sores_seen` push                                      | `/work`                                       | Observations, as the list does    |
| `password_guessed` push                                    | `/work`                                       | — (the list leads nowhere either) |
| a feed Lot's expiry, in the list                           | the medicines page (`alert-list.tsx:195-196`) | the feed store                    |
| `entered_twice` and `money_awaiting_approval`, in the list | `/money` on this month                        | the entry's own month             |

### Owner choices

- **The two safety notices never push.**
  - `withdrawal_ending` and `notifiable_diagnosis` have no push words (`notify.ts:192-201`); that was deliberate in bc1b4d63. So `wakesTheFarm` governs nothing (`push-send.ts:50-54`).
  - They reach a pocket only by SMS, only for the Owner and the Manager, and only once a gateway is set up.
  - The milkers of her Pen are in the audience but only ever see it in the app.
  - The glossary says "the safety ones ignore quiet hours" (CONTEXT.md:488), which reads as a push. Either push them, waking the farm, or reword the glossary.
- **A count is told to whoever made it.** A cash count the Owner made herself comes back to her as `cash_short`. Store and medicine counts likewise go to whoever counted.
- **The Investor statement's occasion is always in Bangla**, even for an English-reading Owner. This was done on purpose (`investor-statement-notice.ts:50-66`).
- **The digest push always opens `/work`.**

### Checked and holding

- **Who hears:**
  - People who have left are skipped in `tell()`, and the Owner fallback fires when nobody is left (except news of one's own act).
  - A visiting Vet is kept out by `holdersOf`'s scope.
  - Kinds about Owner-only matters have Owner-only audiences. The Vet's death notice carries no cost.
- **Dismissing:** it is per person; nobody dismisses another's notice.
- **Pushes:**
  - A push is claimed once (`carriedAt`).
  - Quiet hours hold pushes, which are carried in the morning if a day old or less.
  - Notices raised on the office path are carried by the next sweep, within five minutes. The Shed Phone sync pushes its own (`sync.ts:235`).
- **The digest:** on the farm's clock, each person's own notices, in their language, claimed and carried in one transaction.
- **SMS:** one per person per thing, retried for a day, Owner and Manager only, disabled people skipped.
- **Words:** checked by a script, every placeholder in the app, push, digest and SMS words is filled for every kind except Needs Review (N12). Numbers come out in Bangla numerals through `translate`, and money in the farm's currency sign.
- **What already clears:** late work done, a Missing found, backup and day-turning alarms put right, money approved, Requests to Join answered, Pay-in Notes settled.
- **The machinery alarms** are told once per stretch.
