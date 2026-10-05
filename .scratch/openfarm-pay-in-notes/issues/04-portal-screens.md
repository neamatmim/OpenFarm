# 04 — The portal's screens

**What to build:** "I have sent it" where the Investor is told what to pay, and their notes with where each stands.

**Blocked by:** 02

- [ ] **Where:** on **How to pay** (`components/portal/how-to-pay.tsx`) and **Still to pay** (`still-to-pay.tsx`), an
      "I have sent money" button while the switch is on and something is owed. Hidden, not dimmed, when off.
- [ ] **The sheet:** amount (filled with what is due — the next Monthly Sum, or what is still owed — and editable),
      the day (today by default), the way, the reference (labelled by the way: transfer reference, cheque number, slip
      number, bKash TrxID), an optional photo (camera or gallery, shrunk before upload). Above it, the Pay-in Code and
      the Venture Account, and the same warning in both languages: the farm only ever asks for money into this account.
- [ ] **Their notes** on the Agreement's page and on Money, as a card with a track — **sent → received**, or **not
      found** with the Owner's line, or **closed** — change and withdraw while it waits (withdraw asks first). What is
      still owed says "৳50,000 of it you told us you sent on 3 Oct, being checked" while a note waits, so the figure
      does not look ignored.
- [ ] **Words:** Bangla and English in the catalogue; numbers, months and the TrxID label worded where the string is
      built, Bangla numerals in Bangla. The footer line "no money moves through it" stays as is.
- [ ] **Preview:** the Owner's portal preview shows the same cards, read-only.
- [ ] **Old cached answers:** the portal draws a persisted cache first, so a missing `payInNotes` field defaults to
      none.
