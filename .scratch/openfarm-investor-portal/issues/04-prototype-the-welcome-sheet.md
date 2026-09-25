# Prototype the welcome sheet an invited Investor is handed

Status: done

Assignee: Neamat Khan Mim

Type: prototype

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

When the Owner invites someone, a one-page Bangla sheet prints (settled while charting). It carries:
- the portal's address and a QR code to it
- their one-time code and its last day
- the steps: open, enter phone, code, choose a password
- what the portal is and is not (the standing notice)
- whom to call.

Make a rough printable version to react to. Decide:
- what it says, and in what order
- whether English sits beside the Bangla, as on the other papers
- where the code sits so it can be torn off or folded away
- whether the same sheet is printed again for a new code.

The address is a placeholder until ticket 05 settles it. Link the prototype from here as an asset.

## Resolution

Prototyped and then grilled with the Owner, 2026-09-25.
- **Prototype:** branch `prototype/welcome-sheet` (commit `2e6ad3e`, never merged). Run `pnpm dev:web` on that branch and open `/prototype/welcome-sheet?variant=A|B|C`. It holds three variants:
  - **A**, a letter with a tear-off code slip
  - **B**, big steps on a sheet that folds to hide the code
  - **C**, the same sheet for everyone plus a code card
- **Names:** **Welcome Letter** and **Code Slip**, in [`CONTEXT.md`](../../../CONTEXT.md). The Code Slip is the letter's tear-off, and is printed alone for every later code.

- **Base:** A's letter, one A4 page on the farm letterhead, addressed to the Investor by name. The code sits on a tear-off **Code Slip** at the bottom. The phone number is printed in the letter and never on the slip. For a week, the phone number and the code together open the door, so they never travel together.
- **Language:** Bangla throughout. English only on the title, the slip's labels and the standing notice, as on the Investor Statements. One letter for everyone; the portal's own language switch serves anyone who prefers English. C's two-column layout crowded out the Bangla.
- **Order, top to bottom:**
  1. letterhead, title, date
  2. "প্রিয় <name>": what the portal shows, and that nothing is signed or paid through it
  3. the steps, with the QR beside them: scan or type the address → tap **"খামার থেকে কোড পেয়েছেন? পাসওয়ার্ড ঠিক করুন"** → your mobile number (printed) → the code on the slip → choose a password → next time just phone and password
  4. help: whom to call; a forgotten password or a lost phone
  5. the farm never asks for your password
  6. the standing notice, in Bangla and English
  7. ✂ the Code Slip: name, the code in two groups of four, its last day, "once only, throw away after"
- **QR and printed address:** both go to the portal's front door (the sign-in page), not the code page. The letter is kept, so its address has to be the one used every time after.
- **Whom to call:** the same farm contact details the portal's account page shows, from one source.
- **When it prints:** only from the Owner's code dialog, while the code is on screen, because the farm keeps only a hash. There are two buttons:
  - **"Print the welcome letter"** for a first invitation: the letter with its slip.
  - **"Print the slip only"** for every later code (one that ran out, or a forgotten password), for someone who already has the letter.
  
  Nothing reprints: a lost or badly printed page means a new code.
- **The trail:** each print is an **Export** (welcome letter or code slip, for whom, by whom, when). It never holds the code, and it carries the usual stamp line. It records the button being pressed; the browser cannot know whether the printer worked.

**Work handed off with the build:** the join must strip spaces inside the code. Checked 2026-09-25: `takeUpInvitation` trims and upper-cases, so lower case already works. `K7QM 4PXA` typed as printed is refused as `wrong_code` and counts toward the lock-out.

**Still to come in:**
- the real address, from [Does the portal get its own address?](./05-does-the-portal-get-its-own-address.md); the prototype's `farm.example.bd/portal` is a placeholder. Settled since: `investors.<farm-domain>`, the bare address (ticket 05, ADR 0009)
- any line pointing to a privacy statement, from [What the portal tells an Investor about itself and about their data](./06-what-the-portal-tells-an-investor-about-itself-and-their-data.md)
- any consent line or form, from [How an Investor's consent is taken and proven](./08-how-an-investors-consent-is-taken-and-proven.md)
