# Survey of home, notices and the day turning, 2026-10-06

Three reviewers each took one part: the home tiles against the pages they link to; notices and push; the day turning and backups. Each finding is marked:

- **Proven:** a temporary test went red against main at 2d64f22a, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. The sweep and who hears

1. **Proven, medium-high.** A notice with nobody to tell writes an Audit Event on every turn and every app open, for two days, and reaches nobody. The sweep counts as untold anything with no alert row, and an empty audience raises no rows. It happens for:
   - a dose not prescribed on a farm with no in-house Vet;
   - a head count differing on a farm with no Manager;
   - a Withdrawal ending with no Manager and nobody on her Pen.

   One dose comes to about 576 Audit Events. `the-day-turns.ts:486-504`, `dose-not-prescribed-store.ts:113-152`, `head-count-store.ts:143-153`, `notice.ts:91-94,165-170`.

2. **Proven, medium.** One telling that throws stops the whole sweep: overdue and escalated work, missing animals, head counts, stock, Receivables and SMS retries. `the-day-turns.ts:674-701`.
3. **Proven, medium.** A farm day the server was down for is never raised. That day's milkings never exist. A weekly or monthly job falling on it is skipped for the week or the month. CONTEXT.md:85 says a sleeping server catches up. `instances-store.ts:165-249`.
4. **Proven, medium.** A dose that starts a milk hold tells the Manager nothing, though `NOTICES` and `raiseWithdrawalChanged` say it does. `notice.ts:95`, `health-store.ts:762-769`.
5. **Proven, low-medium.** A refused entry's notice prints the server's English message inside Bangla, e.g. "১টি এন্ট্রি খামার নেয়নি — sequence 7 is already used…". `batch-store.ts:274,307,434`, `notice-words.ts:279-282`.
6. **Traced, medium.** Only three kinds clear themselves when their cause goes. Overdue work since done, a Missing animal since Found, a Lot used up, a Reimbursement paid and backups recovered all stay until tapped. The list returns the newest 50, so urgent old ones fall off it. Alerts are never pruned. `routers/alerts.ts:13,64`.
7. **Traced, low.** A second Needs Review on the same record raises no notice: the unique index drops it. `db/schema/alert.ts:50`.
8. **Proven, low.** The day's raising is filed in the trail under the UTC date, which is yesterday's. `the-day-turns.ts:248`.

## B. Push

1. **Proven, high.** A push held over quiet hours is dropped, never sent in the morning. This covers a death at 23:00, early overdue work, a lock-up head count, the machinery alerts and Pay-in Notes. The glossary says a death waits for morning. `push-send.ts:39-45`, `push.ts:100`.
2. **Proven, high.** `expired_dose_given` is never pushed, because its rows never reach `pushRaised`. `effects/treatment.ts:174-214,375`.
3. **Proven, medium-high.** A signed-out browser keeps getting that person's pushes, Owner-only money included. The next person to sign in on that browser cannot subscribe. `push-store.ts:25-54`, `lib/sign-out.ts`.
4. **Proven, medium-high.** A Shed Phone's push stays with the first milker who subscribed. A PIN Switch's re-subscribe is refused with CONFLICT, and the error is swallowed. `push-store.ts:193-201`, `shed-phone.tsx:292-303`.
5. **Traced, low.** The digest can be lost: it is claimed and committed before the push is sent. `push-send.ts:99-129`.
6. **Traced, low.** A push opens `/work` for anything but work and deaths. A backup alert should open `/farm/backups`, a Missing animal or a dose should open the animal, and a note should open the Venture. `push.ts:44-56`.

## C. Home tiles

1. **Proven, high.** The Owner's "Withdrawal ending" list names cows whose milk hold ended days ago, while their meat hold runs on, with a past date shown. Her list is not filtered as the Manager's is. `overview.ts:224-234`.
2. **Proven, medium.** The "awaiting approval" figure counts every Purse and every date, but links to `/money`, which opens on this month and the Farm's Purse. So the Owner lands on "0 waiting". A Venture's waiting money is a dead end there. `money-store.ts:989-1006`, `owner-queue.tsx:142`.
3. **Proven, medium.** Late work over 30 days old drops off both homes, which then say nothing is late, while the Overdue page still lists it. `overview.ts:81-86`, `home.ts:73-78`.
4. **Traced, medium.** "Farm Accounts out" links to `/farm#farm-accounts`, but the section moved to `/farm/money`. `farm-accounts-out.tsx:55-58,73`.
5. **Traced, low.** The Manager's "cows held" figure opens the whole herd, not `held=milk`. `home.tsx:144-149`.
6. **Traced, low.** "Lost in 30 days" counts a stillborn calf as died, while the panel beside it calls it born dead. `overview.ts:99-107,291`.

## D. Restore and the watch on the server

1. **Traced, medium.** The disaster restore cannot be done as the runbook is written, for two reasons:
   - `restore.sh` and `verify-restore.ts` refuse any database not named scratch.
   - The dump carries no grants, so the app would be refused on every table until the Owner re-runs "The app's own login".

   `restore.sh:31-38`, `backup.sh:132`, `restore-drill.md`.

2. **Traced, low.** A drill can fail on a good copy: the held counts are taken before `pg_dump`'s snapshot. `backup.sh:96-113`.
3. **Traced, needs the Owner.** A stopped timer or a dead app is never reported, because only a turn that runs and fails raises `day_not_turning`. The backup-overdue check lives in the same app.

## Checked and holding

- The day lock holds.
- The production build carries the turn task.
- Concurrent turns do not raise twice.
- Schedule slots, the digest and quiet hours are on the farm clock.
- The backup script fails on a failed dump.
- No push is sent inside its transaction.
- Audiences resolve to current holders.
- Milk, month net, Monthly Costs, Receivables and Missing tiles agree with their pages.
- New home fields default in the cache.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.
- A3: a farm day the server was down for has its work raised on catch-up, already late. A weekly or monthly job falling on it is raised too.
- A1: a notice with nobody in its audience falls back to the Owner, and the sweep then stops repeating it.
- B: pushes held over quiet hours go out when quiet hours end. Signing out stops that browser being pushed. A Shed Phone's push follows whoever is PIN-switched in.

Defaults I'm taking, as the obvious reading:

- A6: a notice clears itself once its cause is gone. Overdue or escalated work clears when it is done or called off. A Missing animal clears when Found or written off. A backup or day-turning alarm clears when the next one succeeds.
- A7: a Needs Review raised again after the first was dismissed raises a new notice.
- C2: the home figure links to where each waiting entry can be found. The Farm's own money goes to the money page on its month. A Venture's goes to that Venture.
- C3: late work stays on the homes however old. "Nothing late" is not said while the Overdue page lists any.
- C6: a stillborn calf is said as born dead in "Lost in 30 days", as the panel beside it says.
- D3: the outside watch (a systemd `OnFailure=` and a ping on the last turn) goes into the runbook. Only the Owner deploys it.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/sweep-and-audience | Done (a notice whose people are gone falls back to the Owner — not news of one's own act or work, nor `mortality_undiagnosed`; each telling in the sweep stands alone and a failure reports the sweep gone wrong; `farm.work_raised_on`, migration 20261006174856, raises a missed day's scheduled work on the next turn, up to 7 days; a dose starting a milk hold tells the Manager; a refused entry's notice says why in the reader's words; `settled-notices` clears late work done, Missing found, backup and day alarms put right; a dismissed judgement raised again; the day's raising filed under the farm day. Untested: the Missing, backup and day-turning clearing) |
| B     | fix/push-delivery | Done (a push claims `carriedAt`; each awake sweep carries immediate notices uncarried a day or less — night pushes in the morning, `expired_dose_given`; migration 20261006182921 marks those already sent; sign-out revokes the browser, a revoked browser or the same Shed Phone moves to whoever subscribes; the digest claimed and carried in one transaction; pushes open where the list leads) |
| C     | fix/home-tiles | Done (Owner's Withdrawal-ending list milk-held only; late work unwindowed with `overdueTotal`; money page opens on `from`/`to` in its address, waiting money's figure on the Farm's oldest waiting day, each row on its own day or its Venture's money page; Farm Accounts → /farm/money; cows held → held=milk; stillborn said as born dead) |
| D     | fix/restore-and-watch | Done (`restore.sh --into-new-database` restores only into an empty database and runs `scripts/app-login-grants.sql`, shared with the deploy runbook — checked in a throwaway Postgres; `OPENFARM_WATCH_URL` pinged after each whole turn, `the-watch.ts`, and the runbook's outside watch with `OnFailure=`. D2 left: counting inside the dump's snapshot would leave the job's own row out of the copy; a drill tripped by the few seconds' window passes when run again) |
