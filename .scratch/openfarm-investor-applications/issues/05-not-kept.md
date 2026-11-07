# 05 — What is not approved is not kept

**What to build:** the clearing of what an unapproved Application held.

**Blocked by:** 04

- [ ] **Lapse**: an Application undecided for 30 days is closed as lapsed by the daily sweep; its notice settles.
- [ ] **Clear**: 30 days after it was declined or lapsed, its NID, bank account, address, email, Nominees and photos
      are cleared (photos deleted, fields nulled). Name, mobile, dates and the answer stay. A run of the sweep that
      finds nothing does nothing.
- [ ] **Privacy notice** (`theNoticeToRead`) and the Data Copy say so. An approved one's photos are in the Data Copy.
- [ ] **Tests**: day 29 keeps, day 30 clears; an approved one is never cleared; the trail is not rewritten.
