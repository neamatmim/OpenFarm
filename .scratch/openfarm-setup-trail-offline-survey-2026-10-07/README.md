# Survey of setup, the trail and working offline, 2026-10-07

Three reviewers each took one part: farm setup and settings; the trail (audit log, Corrections, the review queue, the Inspector View, exports); and working offline (the Outbox, Shed Phones with no signal, the cached screens). The survey ran against main at 90dd34a6. Each finding is marked:

- **Proven:** a temporary test went red against main, and the file was then deleted (25 tests across the three parts).
- **Traced:** read line by line through the code.

Findings are numbered within their part: S for setup, T for the trail, O for offline.

## Status

| Group | Status |
| ----- | ------ |
| A | Done on fix/held-work: a stint stretched by each thing recorded on it; the milk gate asked at the farm's clock too when the phone was behind; Pens judged as held when the work was done; an unproved PIN kept (`pin_not_proved`) not refused; `reviewQueue.takeIn` and what was held shown on Needs Review (`work_closed` refusal word). Opened on the seed: held milking shown, taken in onto Missed work |
| B | Done on fix/outbox-keeps-trying: never gives up on a transient failure; refusals read by oRPC code (the client had no HTTP status, so every refusal used to ride out 12 tries); `still_applying` retried; `phone_revoked` pauses; `sync.fromTheShelf` for a locked Shed Phone; `useOutboxSender` on every screen and the PIN screen; resume on sign-in; only the signed-in person's work carried, sign-out says what waits; pill says since when; Sent back names the cow, words ticks and sightings; a form's act held while its save settles; the service worker keeps every page the network gives (SHELL v11); `reviewQueue.waiting` for the tab count and `review_closed` on resolve. Opened on the seed: review tabs, Sent back card |
| C | Done on fix/farm-settings: Wind-up days frozen on the Venture at first signing (`venture.wind_up_days`, `windUpDaysOf`); a Manager's save handed back without the Owner's figures; why money waits kept (`money_event.awaiting_in_pieces`); names compared in NFC with spaces as one; a bare Pen name two Sheds share refused in the register (`pen_in_two_sheds`); Farm Account numbers kept in one form, `farmAccounts.bringBack`, retire asks first; no dairy animal into a quarantine pen and none marked while one stands in it (Fattening bulls still may — the isolation pen is a quarantine pen); Shed/Pen names refused in words; Parameters and Year Changes judged behind the farm lock, refusals worded. Migration 20261007050802. Not done: raising the Approval Threshold still lets go of nothing already waiting — the Owner approves it as before |
| D | Done on fix/the-trail: deaths and Sales name their animal in the trail, and a void writes her coming back on her own trail (the audit screen links both to her page); money snapshots keep hand, Farm Account and reference; the Day Turning filed as the farm's own (`asTheFarm`); "the reading is right" hands its event id on; a Vet corrects their own doses (`isHealthStep`); who-may-correct asked before the settled check; a void keeps its photographs (`voided_photo`, migration 20261007054345); the Manager offered only the farm's kinds of record; long references and leading-0 numbers kept as text in CSV; CSV file names stamped. Kept photographs shown on her page since 03d499e0 |

## The plan

| Group | Branch | Findings | What it is |
| ----- | ------ | -------- | ---------- |
| A | fix/held-work | O1–O5, T5 | Work done on a phone with no signal is kept rather than refused; the milk Withdrawal is asked on the farm's clock too; a held entry can be taken into the records from Needs Review and shows what it was |
| B | fix/outbox-keeps-trying | O6–O12, T6 | The phone does not hand work back for a weak signal; a locked Shed Phone and a signed-in-again phone send; sign-out warns; Sent back names the cow; one tap, one entry; the shell follows the last build |
| C | fix/farm-settings | S1–S12 | Wind-up days frozen at signing; a Manager's save hides the Owner's figures; names in NFC with spaces collapsed; Pen by shed/pen; account numbers in one form; a Farm Account brought back; refusals worded; Parameters and Year Changes behind the farm lock |
| D | fix/the-trail | T1–T4, T7–T12 | Deaths and Sales name the animal and a void brings her back in the trail; money snapshots keep hand and account; the Day Turning filed as the farm's; the doubted-weight resolve fixed; the Vet corrects their own doses; void keeps its photographs; audit kinds by Role; long references kept as text |

Order: A first (milk into the tank and lost work), then B, C, D.

## Decisions

The Owner, 2026-10-07:

- O6: a phone never gives up on a dropped signal or a server restart. Only a real refusal from the farm comes back; the pill says how long work has waited.
- O3/T5: the Manager may take a held entry into the records from Needs Review (writing its Treatment and Withdrawal, or its litres), or set it aside with a note. Needs Review shows what was entered.
- S8: a Pen holding herd animals cannot be marked quarantine, and a herd animal cannot be moved into a quarantine Pen.
- T12: an exported CSV is stamped in its file name (farm Registration number, time); the rows stay clean, and the Audit Event names who.

Defaults taken without asking, as the obvious reading:

- S1: the Wind-up days are frozen on the Venture when its first Agreement is signed, as the paper says.
- O1: work done while the phone showed her switched in is hers, proved by her switch token, until the phone locked or someone else switched in, however long the signal was gone.
- O2: the Withdrawal gate counts every dose the farm had received before the milking reached it, whatever the phone's clock said; a milking dated before a dose that the farm already had is held.
- O5: a Pen reassigned after the work does not refuse it; the work is taken as the Pen stood when it was done.
- T9: a void keeps the photographs, as the glossary says a Correction never takes one away.
- T7: a Vet may correct their own health entries — doses, treatments, every clinical Step — at any time, as the glossary says.

## Farm setup and settings

Eleven temporary tests went red against main at 90dd34a6; all deleted.

### A. A setting that reaches past what it should

1. **Proven, high.** Changing the Wind-up days moves the Wind-up Period of Ventures whose Investors have already signed. The signed Agreement says "এরপর {windUpDays} দিনের গুটিয়ে আনার সময়…" (`domain/standard-templates.ts:109`, `agreement-paper.ts:94`), but the Venture list, progress notices and buy-back read today's farm figure (`venture-store.ts:188`, `routers/ventures/lifecycle.ts:405`, `routers/ventures/trading.ts:476-479`, `the-day-turns.ts:673`). A Venture signed for 30 days ended its Wind-up 2047-05-19; after the Owner set 5, 2047-04-24 — buy-back 25 days early. Keep the days on the Venture or its Agreement when signed.
2. **Proven, medium.** A Manager saving any Farm Parameter gets the whole farm row back (`routers/farm.ts:912`), including the Owner's figures (short lines, market price, Venture figures) that `farm.current` and the trail hide (`owners-figures.ts:1-4`, `routers/farm.ts:555-566`). The Manager got `cashShortTellMoney` and `ventureFloorPercent`.
3. **Traced, low.** Raising the Approval Threshold does not let go of money already waiting, and the Owner is shown the wrong reason: a ৳60,000 entry waiting under ৳50,000 is marked `inPieces` once the line is ৳100,000 (`routers/overview.ts:258-259`).

### B. Names that are the same thing

4. **Proven, medium.** `names.ts:9` trims and lowercases but never NFC-normalises (nor do the exact `name_bn` unique indexes). Feed, breeds, medicines, Categories, notifiable diseases (`farm-list.ts:156-204`, `standard-store.ts:66,187`). "খড়" with ড় one char vs ড+nukta made two feeds; "নেপিয়ার" two breeds. The standard list's "ধানের খড়" and "নেপিয়ার ঘাস" are in the two-char form, so "start with standard" can add a second straw. Inner spaces not collapsed. Counterparties were fixed (`counterparty-store.ts:9`), these weren't.
5. **Proven, medium.** The opening register matches a Pen by name alone (`routers/animals.ts:1872-1877,638`). Two Sheds each with "Pen 1" → animal quietly put in whichever was read last. Refuse a shared Pen name; ask "shed/pen".
6. **Proven, low-medium.** Farm Account numbers compared as typed (`routers/farm-accounts.ts:116,132-137`): 01788000333, ০১৭৮৮০০০৩৩৩, 01788-000333 all taken — one bKash number, three accounts.

### C. Retiring

7. **Proven, medium.** A Farm Account retired by mistake can never come back: one tap, no confirm (`components/money/farm-accounts.tsx:249-256`), no restore, and re-listing the number is refused "retired or not" (`routers/farm-accounts.ts:132-145`).
8. **Traced, low, Owner.** A Pen holding herd animals can be marked quarantine (`routers/sheds.ts:251-298` refuses only unmarking), and a non-quarantine animal may be moved into one (`herd-store.ts:310-329`). Intake then offers it, and bought bulls go in among herd cows. Refuse, or warn?

### D. Refusals and two people at once

9. **Proven, medium-low.** A second Shed with the same name, or a second Pen of the same name in one Shed, is a raw `DrizzleQueryError … shed_name_uidx` (`routers/sheds.ts:71-89,125-166`) — English "Internal server error". Case-sensitive too.
10. **Proven, low-medium.** Several Farm Parameter refusals carry no refusal word (`routers/farm.ts:766-808`, `apps/web/src/lib/saying.ts:59-66`): AI window shut before open / over a day, quiet hours begin when they end, `"6:00" is not a time of day`, Investor warning above the cap.
11. **Proven, low.** Two saves at once can leave an AI window that shuts before it opens: each checks the farm as it read it, no lock (`routers/farm.ts:782-790`, written at 890). Manager start 17, Owner end 16 → 17–16.
12. **Proven, low.** The same Year Change sent twice at once is recorded twice (check outside the write, no unique index: `routers/financial-years.ts:105-133`, `db/schema/farm.ts:521-526`). Withdrawal matches by months (`domain/financial-year.ts:210-216`), so withdrawing one leaves the other in force while the screen says withdrawn.

### Checked and holding

- First run: advisory lock + re-check inside the write; refused once a farm exists. "Start with standard" Owner-only, idempotent, worded refusal for retired/bundle-counted feed.
- Owner-only Parameters refused for a Manager on server and hidden on screen; Manager's changes told to the Owner; `farm.current` hides the Owner's figures and Approval Threshold from Staff and Vet.
- Farm rename Owner-only, from her own phone, audited with what it said before.
- Parameter cross-checks hold; changed gestation/lead time re-times open calvings and their work.
- Retiring: feed refused while a Ration a Pen is on feeds it; retired breed refused for new animals, kept on Venture plan lines, hidden in picker; quarantine Pen with an animal in Quarantine cannot be unmarked; retired Farm Account refused for new money, kept where named.
- Year Changes Owner-only; ended years and lengths refused; every refusal worded.
- Farm Account statement check: refuses unfinished month and months before first reading, note required on disagreement, under farm lock.
- Eid dates: refuses a day that is no Eid; bringing along leaves Venture animals; stable order.
- Setup card read from records; SOPs published when made.
- Every farm list retires, never deletes; retire/restore twice writes nothing.
## The trail

Five temporary tests went red against main at 90dd34a6; all deleted.

### A. What the trail keeps

1. **Proven, medium-high.** The trail of a death or a Sale never says which animal it was, and a void never records her coming back. Snapshots carry no animal id or tag (`mortality-store.ts:13-24`, `sale-store.ts:13-40`), though `animals.ts:1132-1134` says they do; `comesBackFromAVoidedExit` (`herd-store.ts:1134-1156`) writes no Audit Event. A bull's trail after a voided death held only his Intake. The audit screen links only animal events to her page (`audit-trail.tsx:65-73`).
2. **Proven, medium.** A Correction to whose hand took the cash, or which Farm Account, keeps no old value: `moneySnapshotOf` (`money-store.ts:695-710`) has amount, method, approval — not `heldBy`, `farmAccountId`, reference. Before and after were identical. Same gap traced in Dispatch (`dispatch-store.ts:116-121`), feed arrival (`stock-store.ts:784-789`), Receivable Payment (`receivable-store.ts:425-435`), Wage Draw (`wage-draw-store.ts:231-237`). Money entered by hand is fine (`readEntered`).
3. **Proven, low-medium.** The Day Turning is filed as the act of whoever opened the app: `work.ensureDue` (`work.ts:180-182`), `alerts.sweep`/`digest` (`alerts.ts:21-36`) run under the request's person. A milker opening the app put "raised the day's work" in the trail as hers.

### B. The review queue

4. **Proven, medium.** "The reading is right" on a doubted weight fails whenever a later reading becomes doubted because of it: `letTheReadingStand` calls `judgeAgainAfter` without the resolve's event id (`review-queue.ts:17-38`); the new question gets `auditEventId: ""` (`effects/weigh-in.ts:195`) and the deferred FK fails at commit. 210, 260 (doubted), 215 → raw database error.
5. **Proven, medium.** A late entry in the queue says nothing about what it was, and its why is the server's English: `batch-store.ts:298-303` stores `message(error)`, `review-queue.ts:52-64` returns only that, `needs-review.tsx:106-115` shows it in quotes. No link, tag or litres; the held payload is never shown. `sync.test.ts` asserts only that the row exists.
6. **Traced, low.** The list stops at the oldest 100 and the tab count reads 100 (`review-queue.ts:15,63`, `review-queue/route.tsx:61`); a row closed by someone else first is refused in English (`review-queue.ts:122-124`).

### C. Corrections

7. **Proven, medium-low.** A Vet cannot correct their own dose, or any Step but a Pregnancy Check: only that counts as clinical (`domain/sop.ts:1067-1068`, `corrections/step-completion.ts:204`), and a Vet has no other standing (`domain/corrections.ts:62-63`). The glossary gives the Vet "always on their own health entries".
8. **Traced, low.** The settled-Venture check runs before who-may-correct (`correction.ts:410-433`): Staff, or a Manager past 30 days, are told to raise a Settlement Adjustment they cannot, and are handed the settled Venture names.
9. **Traced, low.** Voiding a death deletes its photographs, voiding a Sale its receipt photo; the trail keeps neither (`corrections/mortality.ts:57`, `corrections/sale.ts:154-158`). The glossary says a Correction never takes a photograph away; the death photo shows the tag of the animal that really died.

### D. Screens and exports

10. **Traced, low.** The audit screen offers the Manager the Owner's kinds of record (Venture, Venture Movement, Internal Sale, Nomination, Bank rate, Head price…; only "investor" dropped, `audit.tsx:76-78`) and shows "no events".
11. **Traced, low.** A digits-only reference opens as a number in a spreadsheet; long bank references in the accountant's CSV lose digits past the 15th (`csv.ts:100-110` guards formulas only).
12. **Traced, low, Owner.** CSVs carry no stamp (farm, Registration number, time, user), though the glossary says every Export is stamped; today only the Audit Event and papers carry it.

### Checked and holding

- Audit Events cannot be changed, deleted or emptied (`kept_as_written` triggers); routers never write outside `audited`; stores' own transactions write their events.
- A Shed Phone batch entry is filed under whoever recorded it, by switch token, phone named.
- Corrections: row locked, `changed_since`; reason required; widest Role recorded; Staff 2 hours from receipt; only the Owner changes `managerCorrectionDays` and voids; before/after read inside the transaction; each supersedes the latest event; races told changed since.
- Audit list: Manager cannot read Owner's own records or Investors'; settings reach him without the Owner's figures; Staff and Vets see their own; day filters on the farm's day.
- Review queue resolve closes only an open row.
- Inspector View: Owner or Manager, own phone; no money, Ventures or Investors; narrowed to the farm; every paper and CSV an Export event with the Registration number.
- CSV: BOM, CRLF, quoting; `= + - @`, tab, CR made inert.
- All 278 refusal words the server sends have words on the web.
- Investor export events filed under the Owner's records.
## Working offline

Nine temporary tests (5 api, 4 web) went red against main at 90dd34a6; both files deleted.

### A. Work the farm refuses, or never writes, after the phone held it

1. **Proven, high.** A milker who loses signal mid-shift has her work refused "not yours" once someone else PINs in next. A stint lasts 5 min past the last keep-awake (which fails silently offline); work is accepted up to 10 min after the stint ends (`PROOF_AFTER_MS`). A cow milked 10 min after the signal went was taken; 40 min after, rejected "Recorded under somebody who did not enter their PIN on this phone for it". `routers/sync.ts:22-24,55-65`, `device.ts:174-193`, `routers/devices.ts:304-315`.
2. **Proven, high.** A slow phone clock lets a treated cow's milk into the tank. The gate is asked at `min(phone, farm)` and counts only doses given before then. Dosed 04:30 (4-day hold, by the Manager online), milked 05:30 on a Shed Phone a day slow → `destination: bulk, forced: false`, litres dated the day before. A `clock_skew` review is raised, but the milk is booked to the tank. The existing test seeds `milkWithdrawalUntil` with no dose rows, so never meets this. `milk-store.ts:136-146`, `domain/src/milk.ts:47-59`, `entries/entry.ts`.
3. **Proven, high.** A dose given offline on work the Manager then closed as Missed writes no Treatment and no Withdrawal: kept "This work is missed", `milkWithdrawalUntil` null, milk to the tank. Its Needs Review can only be closed with a note; `reviewQueue.resolve` cannot take a held entry in (only doubted weigh-ins). Same for kept milkings. `entries/step-completion.ts:300`, `routers/review-queue.ts:74-135`, `routers/work.ts:724-761`.
4. **Proven, medium-high.** Work whose offline PIN was never proved (PIN held in memory only, tab discarded) comes back `rejected` (`not_yours`), though the glossary says Waiting for a PIN is kept. `entry_rejected` goes only to whoever sent the batch; nothing reaches the Manager's queue; no router reads rejected `sync_entry` rows. `routers/sync.ts:60-65`, `batch-store.ts:421-441`, `notice.ts:116`, `lib/device.ts`.
5. **Proven, medium.** A Staff member's Pens reassigned after the work but before sync → `rejected` (`pen_not_yours`). The world moved after the work; should be kept or taken. `completion-store.ts:106-117`, `entries/entry.ts:31-42`.

### B. The phone gives up, or never sends

6. **Proven, high.** After ~10 minutes of weak signal or a server restart (`MAX_ATTEMPTS = 12`, backoff 2 s→60 s, flush every 15 s), the whole queue moves to "Sent back": 30 milkings in the test. Raw English "Failed to fetch" on a Bangla screen, "Done with this" the only button, no send again. The give-up writes `lastSync` ("Last sent 05:09" when nothing was taken). If only a reply was lost, retyping records twice. `lib/outbox-client.ts:60-62,78`, `lib/outbox.ts:587-612,548`, `routes/_authenticated/outbox.tsx:83-90`.
7. **Traced, medium.** A personal phone paused as "signed out" stays paused after signing in again; `resume()` only from the pill's small retry icon and the Shed Phone PIN screen; the pause is stored. `components/sync-banner.tsx:201-222`, `routes/shed-phone.tsx:304`, `lib/outbox.ts:390-398`.
8. **Traced, medium.** A locked Shed Phone never sends: flushing lives in `SyncBanner`, rendered only behind a PIN. Manager sees the milking undone/overdue and may close it Missed (→ 3); it later goes under the next person (→ 1, 4). `components/sync-banner.tsx:67-125`, `lib/shed-phone.ts:116-134`.
9. **Traced, medium-low.** Work queued on a shared personal device under one person is refused once another signs in ("recorded by somebody else…"); sign-out gives no warning. `lib/sign-out.ts:31-38`, `components/user-menu.tsx:153-156`, `lib/outbox-client.ts:84-87`, `routers/sync.ts:67-73`.

### C. What the screens show

10. **Traced, low-medium.** "Sent back" cannot name the cow of a refused Move or sighting (`animalOf` reads `animalTag`; they carry `tagNumber`); falls back to raw kinds "animal_move", "observation", "instance_claim"; a step answer shown as "true". `routes/_authenticated/outbox.tsx:22-34`.
11. **Traced, low.** A double tap with no signal queues a sighting or Move twice: offline branch not awaited by `FormDialog`. `components/report-sighting.tsx:52-63`, `components/page-kit.tsx:706-712`, `components/animal/move-dialog.tsx:61-66`.
12. **Traced, medium-low.** With no signal the app opens on the build from when the service worker was installed: `shellFor` never refreshes the shell cache from the network; only a `SHELL` bump does. A `CACHE_KEY` rename without a `SHELL` bump leaves the old code with no kept cache (empty pen board). They agree today (v10 2026-10-04, key 2026-10-03), but it rests on a manual bump. `public/sw.js:12,30-38,98-121`.

**Owner:** how long a phone keeps trying before handing work back (never / days); whether the Manager can take a held entry into the records from Needs Review.

### Checked and holding

- 14-day cached answers: every query field added or retyped since `CACHE_KEY` was renamed (751fa76f) is defaulted or filtered.
- Idempotency: frozen Batch keeps key and entries; replay mid-apply answered from stored batch; seen entry id answered as before; sequence clashes kept.
- Order: oldest first, each in its own savepoint; claim-steps-finish in one send works; "somebody else took the work first" keeps the shift.
- Whose name: taken at recording; switch token from any farm phone proves its stint; up to a week before the PIN proved accepted; work before someone left still theirs.
- World moving: sold/dead since kept as late; fast clock clamped; far-out clock raises one `clock_skew`.
- Same Step twice same answer changes nothing; different answer kept as late.
- Service worker caches no API call, replays no write; authenticated pages `ssr: false`.
- 413 covered by the runbook's `client_max_body_size 8m`.
