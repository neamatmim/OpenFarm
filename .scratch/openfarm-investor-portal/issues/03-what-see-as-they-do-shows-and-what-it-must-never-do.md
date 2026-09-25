# What "see as they do" shows, and what it must never do

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

The Owner is to see any Investor's portal as they would read it, from the Owner's own sign-in (settled while charting). Decide its shape and its limits:

- Where it opens from (the Investor's page, the list) and how it is marked as a preview.
- Whether it shows the Investor's account page too: masked details, devices.
- Whether making a paper in the preview is an Export like any other, and under whose name.
- Whether it works while the portal is shut, or for someone never invited.
- What it must never do: sign in as them, touch their session or password, or open a door an Investor could use.

It is the Owner's check before inviting anyone, and what the lawyer is shown (ticket 07).

## Resolution

Grilled with the Owner, 2026-09-25. Named **Portal Preview** in [`CONTEXT.md`](../../../CONTEXT.md); the button says "See as they do". No ADR: easy to reverse, and not surprising.

- **When it works:** for any Investor on file, whatever their portal standing (never invited, invited, code ran out, in, taken away), retired ones included, with the portal open or shut. It shows what they would read if they were in today. A retired Investor's Ventures raising capital are empty, as the portal would show them.
- **Where it opens:** a "See as they do" button in the Portal section of the Investor's page, beside Invite. Not on the Investors list.
- **What it is:** the portal's own pages, not a lookalike: the same shell, sidebar, pages and notice line, all navigable. It lives under the Owner's own address (under the Investor's page), never `/portal`.
- **How it is marked:** a band on every page that cannot be dismissed: a preview of this person's portal as they would see it today, which they cannot see and which reaches nothing of theirs. It has a "Back to <name>" button.
- **The account page:** included, with the NID and bank account masked as they see them, and the farm's contact details. The devices list shows their real sign-ins, or none.
- **Acts:** every act shows but is dimmed, saying "Only <name> can do this, from their own sign-in":
  - changing the password
  - signing other devices out
  - making a Request to Join
  - changing or withdrawing a Request
  
  Their existing Requests show as they read them, and are answered only from the Owner's side.
- **Papers:** opening an Investor Statement in the preview makes an ordinary Export under the Owner's name. It is the same paper the Owner can make from the Agreement, with no watermark. The trail notes that it was made in that Investor's preview. It never appears in their activity as a paper they read.
- **Who:** the Owner alone, from a personal sign-in, the same as the Investor activity view.
- **It must never:**
  - sign in as them, or put their session in the Owner's browser
  - touch their sign-in (no password, no signing out of devices, no code)
  - leave a trace on their side (no "last in" hour, no activity entry)
  - make, change or withdraw a Request for them
  - open a door an Investor's sign-in could reach, even for their own id
  - show anything they would not see, including Owner-only figures or unmasked details
- **Viewing** leaves no Audit Event; only papers do.
- **The shell:** the language and theme switches work, since they belong to the device. The user menu shows their name, with "Back to <name>" in place of Sign out. The "ask the farm" line shows as theirs.
- **The lawyer** is shown the preview on the Owner's screen (ticket 07). There is no lawyer sign-in.

Nothing is left to decide. Building it is work handed off when the map closes, or sooner if the Owner wants it before the lawyer's meeting.
