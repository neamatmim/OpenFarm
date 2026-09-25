# The portal ready for its first Investor — tickets

These are the tickets from [the readiness spec](./spec.md). They build what the investor-portal map decided on 2026-09-25, in its tickets 03, 04, 05, 06 and 08, so that the Owner can hand the first real Investor a code once the lawyer's written opinion is in. The vocabulary is in the glossary's **Portal Preview**, **Welcome Letter**, **Code Slip** and **Portal Consent** entries. ADR 0009 holds the own address.

| #   | Ticket                              | Blocked by |
| --- | ----------------------------------- | ---------- |
| 01  | The join takes a code as printed    | —          |
| 02  | The Portal Preview                  | —          |
| 03  | Consent and the notice as Templates | —          |
| 04  | Portal Consent before any code      | 03         |
| 05  | The Welcome Letter and Code Slip    | 04         |
| 06  | Withdrawal says why                 | 04         |
| 07  | "আপনার তথ্য" in the portal          | 03         |
| 08  | "খামারে আপনার তথ্য"                 | 03         |
| 09  | The Agreement's data clause         | 03         |
| 10  | The portal's own address            | —          |
| 11  | Nothing kept on the phone           | 10         |

**There are four roots.**

- **01** is a one-line fix.
- **02**, the Preview, touches only reads.
- **03**, the Templates, is what the consent, the letter, the notice page, the copy paper and the Agreement clause all stand on.
- **10**, the own address, is infrastructure and stands alone.

**Before the lawyer's meeting**, build in this order, so the lawyer reads real screens rather than printed drafts:

1. 01
2. 02
3. 03
4. 07
5. 04
6. 05

Work one ticket per `/implement`, clearing context between them. Each ticket's status is on its own `**Status:**` line.

**Every ticket ends with somebody opening the page**, at phone width for the portal's pages. Web component tests are not collected by the vitest include glob.

**Settled on the map, and not to be re-decided:**

- **The Preview:**
  - It is the Owner's alone. It works for any Investor at any standing, with the portal open or shut.
  - It shows the portal's real pages under the Owner's address. It never signs in as them and never touches their session.
  - Every act is dimmed. A paper made there is the Owner's own Export, and it never lands in their activity.
  - Just looking leaves no Audit Event.
- **Consent:**
  - It is on paper, signed in front of the Owner, and filed with the Agreements, not scanned.
  - OpenFarm records the day, the Version and who recorded it.
  - **No code exists before consent is recorded.**
  - Nothing is ticked in the portal.
- **The letter and slip:**
  - The letter is Bangla, with English only on the title, the slip's labels and the standing notice.
  - The phone number is in the letter; the code is on the slip, printed in two groups of four.
  - The QR goes to the portal's front door.
  - The letter prints only from the code dialog, the slip alone for every later code, and nothing is reprinted.
  - Each print is an Export that never holds the code.
- **The notice:**
  - "আপনার তথ্য" is one text: a portal page open before sign-in, and the back of the letter.
  - Only the Owner sees the personal record.
  - The host and the backup store are named.
  - Requests are made to the Owner in writing, and answered within 30 days.
  - The standing notice's words are unchanged; a link is added after them.
- **Withdrawal:**
  - It is a Take away with its reason recorded.
  - It closes no Request to Join.
  - Coming back needs a new consent.
- **The own address:**
  - `investors.<farm-domain>`, where each address serves only its own people.
  - `/portal` redirects there.
  - The door points each person to their own address, after the password is right.
- **Nothing kept on the phone** on the Investor address.

**Not here:**

- the lawyer's written opinion, and the wording it changes: that comes in as Template Versions
- the farm's go-live (domain, certificates, the server)
- a breach plan
- notifications to Investors, and paying or signing in the portal
