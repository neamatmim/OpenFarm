# 05 — What is not approved is not kept

**What to build:** the clearing of what an unapproved Application held.

**Blocked by:** 04

**Status:** done (2026-11-08), but the privacy notice's wording is left for the advisers

- [x] **Lapse**: an Application undecided for 30 days is closed as lapsed by the daily sweep; its notice settles.
- [x] **Clear**: 30 days after it was declined or lapsed, its NID, bank account, address, email, Nominees and photos
      are cleared (photos deleted, fields nulled). Name, mobile, dates and the answer stay. A run of the sweep that
      finds nothing does nothing.
- [ ] **Privacy notice** (`theNoticeToRead`) and the Data Copy say so. An approved one's photos are in the Data Copy.
- [x] **Tests**: day 29 keeps, day 30 clears; an approved one is never cleared; the trail is not rewritten.

**As built:** `lapseAndClearApplications` in `api/src/application-answers.ts`, one step (`"applications"`) in
`theSweep`. Thirty days from sending to lapsing, and thirty from the answer to clearing. Clearing deletes the
photographs and empties every field about them except name, mobile, dates and answer, the consent paper included. The
trail never held those fields (03), so nothing about them survives there. The Data Copy says "Applied online" for an
Investor who came in this way: when, where the consent's code went, and which photographs are kept
(`appliedOnline` in `data-copy.ts`).

**Left open:** the privacy notice is a Template whose wording the lawyer approved, so I didn't add a line about
Applications to it. Question 4 on the advisers' sheet asks about the clearing. Once they answer, the Owner publishes a
new Version of the notice with a sentence for it.
