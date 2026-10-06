# Survey of animal health, 2026-10-06

Three reviewers each took one part: Diagnoses, Prescriptions, doses and Withdrawal; the medicine store; and the health screens. Each finding is marked:

- **Proven:** a temporary test went red against main at 8e0f3dec, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. Withdrawal holds the right animals for the right time

1. **Proven, high.** A dose given after the Vet shortened a hold is ignored if its end is not the latest one, so the shortened date stays in force.
   - Example: a 28-day-meat dose on 1 Oct; the Vet shortens meat to 7 Oct; on 6 Oct a 7-day dose follows. She can be sold on 8 Oct, inside the second drug's withdrawal.
   - Milk has the same hole. `health-store.ts:340-371`, `sales.ts:214`.
2. **Proven, high.** Changing a product's Withdrawal days on the Drug List changes nobody until she is dosed again, and then it applies to all her old doses too. The treatment register reads the new days for everyone, so it disagrees with the gate.
   - Example: two cows get the same 3-day dose; the label is corrected to 30 days. Cow 1 is clear on day 3 and can be sold; cow 2, dosed again, is held for 30 days. `drugs.ts:427-457`, `health-store.ts:312-314`, `registers/treatment.ts:85-90`.
3. **Proven, high.** A dose can be dated before its Prescription was written, and the Withdrawal is counted from that date.
   - Example: a phone with its clock reset sends a dose as 20 Sep for a course written on 20 Oct. It is applied, unflagged, and her 28-day hold is already over. `effects/treatment.ts:262`, `entries/entry.ts:211-214`.
4. **Proven, medium.** Correcting a dose to a skip throws away the Vet's shortening and lengthens the hold, without telling anyone. `health-store.ts:372-384`.
5. **Traced, high.** The Shorten dialog sends every field. A blank one goes as "end it now", so shortening milk ends her meat hold. The fields start blank, not at the dates in force. `animal-acts.tsx:458-497`, `withdrawals.ts:53-55`.
6. **Traced, low.** "Fit for sale from {date}" shows a day, but the hold ends at the dose's hour, so on that morning a sale is still refused. `overview-tab.tsx:277-288`.
7. **Traced, low.** The Withdrawal Summary lists only the last 30 days of treatments, but a product may hold for up to 365 days. It can say "NOT CLEAR" over an empty list. `domain/health.ts:184`, `papers.ts:255-260`.

## B. Doses and courses

1. **Proven, medium.** A course's dose can be recorded days before it is due. A wrong tap ends the course early, and the Withdrawal is counted from the wrong day. `step-completion.ts:301`.
2. **Traced, medium.** A skipped dose shows to the Vet as still owed, for good, so the Vet never learns to prescribe again. `course.tsx:59-70`, `vet.tsx:44-53`.
3. **Traced, low-medium.** A dose not prescribed from an expired Lot is never warned of; only a course's dose is. `dose-not-prescribed-store.ts:27-100`.
4. **Gap.** A Prescription cannot be stopped or corrected, so a course the Vet gives up stays raised as work and goes Overdue.

## C. The medicine store

The four count defects share one root cause: a Medicine Count stores the book's `expected` figure for that day, and Stock on Hand sums `counted − expected` only to adjust the doses gone. The count does not win. `medicine-stock.ts:94-121`, `medicine-count-store.ts:28-82`.

1. **Proven, high.** A dose given before a count, but written down after it, comes off the shelf twice. Example: 10 bought, the count finds 8, then a dose dated before the count is written down. The list says 7; the shelf has 8.
2. **Proven, high.** Correcting an earlier count wipes out what a later count found. Example: April counts 8, May counts 8, April is corrected to 10. The list says 10.
3. **Proven, medium.** Doses a count finds over the book never show on the Drug List, and low-stock notices use the wrong figure.
4. **Proven, medium.** Doses given from a box nobody recorded are not caught by the count, and the next count asks for a reason for doses that are not missing.
5. **Proven, medium.** After a count writes off an expired Lot, the next dose is still warned of as coming from it. `medicine-stock.ts:182-187`.
6. **Proven, medium.** Doses are taken from a Lot bought after they were given, so which Lot is expiring is wrong. `domain/lots.ts:37-48`.
7. **Traced, medium-high.** A Medicine Purchase cannot be corrected, though CONTEXT.md says it can. A typo (100 doses for 10, ৳10,000 for ৳1,000) stays in stock, Lots, every later dose's cost and the Money Event.
8. **Traced, low.** A dose's cost and a count's shortfall use two different prices. A count may list the same product twice, and then what is stored and what the notice says disagree. `domain/costs.ts:331-359`, `medicine-count-store.ts:77-79`, `entries/step-completion.ts:85`.

## D. The health screens

1. **Proven, medium.** The Shorten and "dose not prescribed" dialogs read the time on the phone's clock, not the farm's. `animal-acts.tsx:461,464,578`.
2. **Proven, medium.** Several refusals reach a Bangla Vet in English: `not_shorter`, `retired`, the input check, and "observation corrected". `animal-acts.tsx:441`, `prescriptions.ts:225`, `diagnoses.ts:79-84`.
3. **Proven, medium.** The Prescribe form sends a blank "Days" as 0. Times typed in Bangla digits or as "8:00" are refused, and its Bangla hint shows English digits. `prescribe-sheet.tsx:19-23,90-96`.
4. **Traced, medium.** Saying how a diagnosis ended fails silently when refused, and a mis-tap can't be put right, because the correction dialog has no outcome field. `health-tab.tsx:64,84-95`, `vet-concluded.tsx:43-75`.
5. **Traced, medium.** A visiting Vet gets an error toast on every Health tab, because "doses owed" is loaded for them. `health-tab.tsx:295-297`.
6. **Traced, low-medium.** Vet Cases vanish from an animal's page once she has left, so an open Case can't be closed. `health-tab.tsx:396-399`.
7. **Traced, low.** A course can be written only from the Vet page, and only for that Vet's diagnoses from the last 14 days. `health-tab.tsx:102-148`.
8. **Traced, low.** English digits in Bangla: Default Withdrawal Days, and the register's course "3/6". `drug-products.tsx:47-48,581`, `registers/treatment.ts:80-82`.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.
- A2: each dose keeps the Withdrawal days in force when it was given. Raising a product's days on the Drug List also reaches back to doses already given (the safe side). Lowering them applies to new doses only; to free an animal early, the Vet shortens her hold.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/withdrawal-holds | Done (a shortening caps only the doses learnt of before it — `treatment.learnt_at`, `animal.*_withdrawal_shortened_to`, migration 20261006084248, `holdInForce` in domain; a dose keeps the days it was given on, raised days reach back via `reachBackWithdrawalDays`; a dose is never dated before its work was raised; the Shorten dialog sends only the hold changed, opens at the dates in force, on the farm's clock; fit for sale to the hour; the Summary lists any dose still holding her) |
| B     | fix/doses-and-courses | Done (a course's dose from half-way after the one before, else `dose_not_due_yet`; a skipped dose carries `skippedBecause` and is owed no more; the expired-Lot notice reaches a dose not prescribed; `prescriptions.stop` with a reason calls off the doses still owed — `prescription.stopped_*`, migration 20261006090044 — open to a visiting Vet within scope, and a Stop button on the Vet's courses) |
| C     | fix/medicine-store | Done (the store replayed in time order — `medicineStoreOf` in domain/medicine-store: a dose from the Lot first to expire among those bought by then, a count resets the shelf, found doses kept; `lotOfDose` names a dose's own Lot; the count's book and price from the same replay and `dosePriceOf`; a product counted twice refused `counted_twice`; `drugs.correctPurchase` puts a purchase and its Money Event right, with a Correct act on the purchase list) |
| D     | fix/health-screens | Done (dose-not-prescribed time on the farm's clock; `not_shorter`, `retired`, `no_withdrawal_days` and `observation_corrected` worded; the Prescribe form reads Bangla digits and short hours (lib/course-times) and waits for times and days the farm takes; the outcome buttons say a refusal, and the Vet's correction can put the outcome right; no doses-owed read for a visiting Vet; Cases listed and closable after she leaves; Bangla digits in Default Withdrawal Days and the register's course. D7 — a course from the animal page — left: it needs its own form) |
