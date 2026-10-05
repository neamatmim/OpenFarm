# 01 — Words, ADR and the advisers' sheet

**What to build:** The words for this in CONTEXT.md, an ADR that says how it sits beside ADR 0007/0008, the farm's
switch, and a sheet the Owner hands the lawyer and the Shariah scholar.

**Blocked by:** —

**Status:** done (2026-10-05)

- [x] **CONTEXT.md, a new entry — Pay-in Note:** an Investor's word, from the **Investor Portal**, that they sent
      money towards one of their **Investment Agreements**: how much, the day, the way (bank transfer, cheque, deposit
      slip, **Mobile Money** into the **Venture Account**), the reference the bank or bKash gave, and a photo if they
      like. It moves no money and records no capital; only the Owner records capital, from the Venture Account.
      Answered **received** (the Owner recorded the capital from it) or **not found** (with a line). _Avoid_: payment,
      payment proof, claim, receipt (that is a buyer's paper), deposit. Grep first: "note" is already the free text on
      a **Request to Join** — the entry says the two apart.
- [x] **Change the Investor Portal entry:** "nothing taken, paid or signed through it" stays; add that, while the Owner
      has the switch on, an Investor may send a Pay-in Note for money they sent outside it.
- [x] **ADR 0018 — Investors may say they have paid; the portal still takes no money.** Amends ADR 0008's "takes no
      money" by adding the word, not the money. Why the Owner is told at once (a waiting Investor); why it is behind a
      switch.
- [x] **The switch:** `farm.pay_in_notes boolean not null default false`, the Owner's to turn on under Investors,
      beside the portal and Agreements-in-the-app switches. A migration, so move `LATEST_MIGRATION`, and migrate
      `OpenFarm` and `openfarm_seed` on merge. (Off, the server refuses a note with `pay_in_notes_off`: that is 02's,
      where the note is built.)
- [x] **The advisers' sheet** (`advisers-sheet.html`, as for the monthly plan): whether a note sent in the portal is
      "taking payment"; whether the way may include bKash into the Venture Account; keeping the slip's photo; and,
      for the Shariah scholar, a note answered "not found".

**Not here:** anything an Investor sees. That is 04.

**As built:** CONTEXT.md **Pay-in Note** (after Pay-in Code), and a sentence in **Investor Portal**; ADR 0018;
`farm.pay_in_notes` (migration `20261005122611_pay_in_notes_switch`, `LATEST_MIGRATION` moved); `investors.list`
returns `payInNotes`, `investors.setPayInNotes` (Owner only, personal session, audited); the switch is the fourth row
on Farm settings → Portal, asked about before it turns on. Bangla name **জমার খবর**, beside জমার কোড. Test
`routers/pay-in-notes.test.ts`: off by default, on and off again, Owner's alone (proved red with the guard off).
`advisers-sheet.html` has five questions, Bangla with English beneath, to print.
