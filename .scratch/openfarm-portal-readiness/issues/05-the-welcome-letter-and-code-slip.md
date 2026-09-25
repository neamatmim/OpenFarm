# 05 — The Welcome Letter and Code Slip

**What to build:** The code dialog prints the Welcome Letter for a first invitation, and the Code Slip alone for every later code. The letter is Bangla, on letterhead, addressed to the Investor. It has the QR to the portal's front door, the steps, their phone, whom to call and the standing notice. The notice "আপনার তথ্য" is on its back, and the code is on a tear-off slip. Each print is an Export that never holds the code.

**Blocked by:** 04.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 22–28.

- [ ] "Print the welcome letter" shows for a first invitation, and "Print the slip only" for any later code. Both are gone once the dialog closes.
- [ ] The letter follows the settled order and variant A of the prototype. English appears only on the title, the slip's labels and the notice.
- [ ] The phone number is in the letter and never on the slip. The code is printed in two groups of four.
- [ ] The QR and printed address are the portal's front door, read from one place (`/portal` on this origin until ticket 10).
- [ ] Step 2 quotes the join button's exact words from the i18n messages, not a copy.
- [ ] The notice Template prints on the back, above the tear line, or as a second page.
- [ ] Whom to call comes from the same farm contact details the portal's account page shows.
- [ ] Each print writes an `export` Audit Event (welcome letter or code slip, for whom, by whom), and a test shows the code is not in it.
- [ ] Somebody prints both from Chrome's print preview on A4, scans the QR with a phone, and tears the slip off a printed page.

## Checked before starting

- The prototype: branch `prototype/welcome-sheet`, `apps/web/src/prototype/welcome-sheet.tsx`, variant A. It draws the QR with `uqr` (`encode`), which main doesn't have yet.
- Printing: `apps/web/src/lib/print-alone.ts` builds a same-origin `srcdoc` from the page's stylesheets and `outerHTML`, so an Investor's name is escaped.
- The join button's words are `portal.haveCode` in `packages/i18n/src/messages/bn.ts`.
- The existing papers' letterhead and footer: `components/ventures/paper-document.tsx`.
