# 05 — The Welcome Letter and Code Slip

**What to build:** The code dialog prints the Welcome Letter for a first invitation, and the Code Slip alone for every later code. The letter is Bangla, on letterhead, addressed to the Investor. It has the QR to the portal's front door, the steps, their phone, whom to call and the standing notice. The notice "আপনার তথ্য" is on its back, and the code is on a tear-off slip. Each print is an Export that never holds the code.

**Blocked by:** 04.

**Status:** done on `feat/welcome-letter`, apart from somebody printing both on A4, scanning the QR and tearing the slip (below)

**Spec:** [the readiness spec](../spec.md), user stories 22–28.

- [x] "Print the welcome letter" shows for a first invitation, and "Print the slip only" for any later code. Both are gone once the dialog closes. "First" came to mean "never handed a letter" (below).
- [x] The letter follows the settled order and variant A of the prototype. English appears only on the title, the slip's labels and the notice.
- [x] The phone number is in the letter and never on the slip. The code is printed in two groups of four.
- [x] The QR and printed address are the portal's front door, read from one place (`/portal` on this origin until ticket 10).
- [x] Step 2 quotes the join button's exact words from the i18n messages, not a copy.
- [x] The notice Template prints on the back, above the tear line, or as a second page.
- [x] Whom to call comes from the same farm contact details the portal's account page shows.
- [x] Each print writes an `export` Audit Event (welcome letter or code slip, for whom, by whom), and a test shows the code is not in it.
- [ ] Somebody prints both from Chrome's print preview on A4, scans the QR with a phone, and tears the slip off a printed page. **Still to do, by hand.** What was seen on 2026-09-26, on the seed farm as the Owner:
  - ইঞ্জিনিয়ার রফিকুল ইসলাম, never invited: consent sheet → "তিনি আজ সই করেছেন" → the code as `ZSZT DAX2` with "স্বাগত চিঠি ছাপুন".
  - The farm had not written who keeps its records, so the first press was refused with the words pointing to «খামারের তথ্য কে রাখে», and the code stayed on screen. Once they were written, the press opened Chrome's print dialog, and the trail gained a `welcome_letter` Export with no code in it.
  - Laid out on screen: page 1 in the settled order, the QR beside the steps, the tear line and the slip at the foot (name, code in fours, last day, no phone), and «আপনার তথ্য» on page 2.
  - His next code offered "শুধু কোডের স্লিপ ছাপুন". The slip printed alone in its cut border, and a `code_slip` Export was recorded.
  - After the review, ডাঃ নুরুল আমিন, who was invited before the letter existed, was offered the letter with his next code.
  - Not yet done: Chrome's print preview read on A4, the QR scanned with a phone, and the slip torn off paper. The QR points at `localhost` until the portal has its own address (ticket 10).

## Checked before starting

- The prototype: branch `prototype/welcome-sheet`, `apps/web/src/prototype/welcome-sheet.tsx`, variant A. It draws the QR with `uqr` (`encode`), which main doesn't have yet.
- Printing: `apps/web/src/lib/print-alone.ts` builds a same-origin `srcdoc` from the page's stylesheets and `outerHTML`, so an Investor's name is escaped.
- The join button's words are `portal.haveCode` in `packages/i18n/src/messages/bn.ts`.
- The existing papers' letterhead and footer: `components/ventures/paper-document.tsx`.

## What was decided while building

- **`investors.handOver({ id, paper })`** lays out everything round the code:
  - the letterhead
  - the Investor, and the phone they sign in with
  - whom to call
  - the day, and a stamp line in Bangla
  - on the letter, the notice for its back

  It records an Export on the Investor, `welcome_letter` or `code_slip`, with the Registration number. The code is never sent to the server, so neither the Export nor the logs can hold it. The code is set on the page from the dialog's own state.
- **Which paper goes with a code is read from the trail** (`codePaperFor`). It is the Welcome Letter until they have a `welcome_letter` Export, and the Code Slip after. `inviteToPortal`'s answer carries it as `paper`.
  - The first version asked only whether an access row existed. The review showed three people that shut out of the letter for good:
    - anybody invited before the letter existed
    - anybody whose first dialog closed with nothing printed
    - anybody sent off to write the notice's facts
  - A second letter is refused (`letter_handed_over`). A lost or spoilt page means a new code, and that code goes with the slip.
- **Printing is refused:**
  - without an open code (`no_code_to_hand_over`)
  - for the letter, while the notice has a fact unwritten (`notice_unwritten`). The notice is printed whole or not at all.
- **A code given to somebody whose access was taken away counts as open** until they take it up. `codeIsOpen` is now shared by the standings and the print. The first version refused their slip.
- **Whom to call is `farmToCall`**, the same function the portal's account page reads.
- **The address is `lib/portal-address.ts`.** The QR and the printed address use the front door (`/portal`), and the dialog's line uses `/portal/join`. Ticket 10 changes that one file.
- **English appears only as the letter's `LABELS`**: the title and the slip's labels. The standing notice is `portal.notice` in both languages. "Scan" is in Bangla only. The letterhead is the shared **Farm Identity** (`letterheadOf`, now in the domain), with its own bilingual labels as on every paper.
- **The sign-in's 12 hours** is `PORTAL_SIGN_IN_HOURS` in the domain, which the letter words in Bangla.
- **The pages:**
  - The letter prints edge to edge (`@page` margin 0) on a 296 mm page, so the slip sits at its foot. The notice follows on a page of its own.
  - The slip alone prints at a 12 mm margin.
- **`uqr` was added to the lockfile by hand**, as 8 lines. `pnpm add` also moved oxfmt and oxlint to newer versions.
- **Proven by switching off:** `no_code_to_hand_over`, `notice_unwritten` and `letter_handed_over` each turn their test red.
