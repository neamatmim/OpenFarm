# What the portal tells an Investor about itself and about their data

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

Every portal page carries one line: it shows the Investor's own Agreements and nothing else, is not an offer, and moves no money. Decide what else an Investor is told, and where. Questions to settle:
- Does the portal need a privacy statement: what the farm holds, why, where it is kept, for how long, and how to have it corrected?
- Does the Investor acknowledge anything on first sign-in? ADR 0007 has them do nothing through the portal, so an acknowledgement would be a first.
- Does the standing notice change?

The law's findings (ticket 01) set the floor. The wording that results goes to the lawyer (ticket 07).

The law's floor is now known (ticket 01, section 13 of the research note): the s.5(2) and s.15(2) notice — what is held and from where, why, 12 years and why, a Singapore server run by a host, who the farm is, the Investor's rights, and complaint to the Authority — and a written way to ask for a copy, a correction or erasure. How consent itself is taken is ticket 08's.

## Resolution

Grilled with the Owner, 2026-09-25. The wording is drafted as [`assets/06-your-data-notice-draft.md`](../assets/06-your-data-notice-draft.md): Bangla, with an English working copy, for the Owner to correct and the lawyer to review on ticket 07. No ADR: it is easy to change, and it follows the law's floor rather than a trade-off.

- **A privacy notice, "আপনার তথ্য"**, one text in two places:
  - **In the portal:** a page open before and after sign-in, linked from every page (after the standing notice) and from the account page.
  - **On paper:** the back of the Welcome Letter, above the tear line so the Code Slip takes none of it. A second sheet handed with the letter if the printer is single-sided. It arrives with the code, before the Investor ever signs in.
- **It covers the research's eight points** (section 13), with these choices:
  - **Who sees it:** only the Owner sees the personal record, and staff see the animals, never the Investor. Checked: every `investors.*` procedure is Owner-only, and Managers reach only a Venture's herd, trips and floats. Also named: the bank, for payouts, and the tax authority, if the law asks.
  - **Where it is kept:** the Singapore host and the nightly encrypted off-site backup store (`scripts/backup.sh`: `age`, then `rclone`), each named with its country. The names are filled in at go-live; no real Investor is invited until they are.
  - **How long:** twelve years after the last Venture settles. The lawyer confirms it.
  - **Complaint:** to the National Data Management Authority, in the lawyer's wording, since the Authority has not been found to exist.
- **How to ask for a copy, a correction or erasure:**
  - In writing to the Owner: a signed letter, or an SMS or WhatsApp from the mobile number on file. A message from any other number is confirmed by calling back the number on file.
  - An answer within thirty days.
  - Erasure's limit is stated: the Agreements and money records are kept twelve years.
  - Withdrawing consent ends portal access at once, and the papers continue on paper.
  - No request form in the portal (ADR 0007).
- **No acknowledgement on first sign-in**, and no forced first page. The notice is already on paper, and consent is ticket 08's.
- **The standing notice's words are unchanged.** The lawyer saw them on 2026-09-25, and the law contradicts nothing. One link follows them: "আপনার তথ্য খামার কীভাবে রাখে".

**Work handed off with the build:**
- the "আপনার তথ্য" page and its links
- the back of the Welcome Letter
- **"খামারে আপনার তথ্য"**: an Owner-only, unmasked Export made from the Investor's page. It holds everything the farm has on them (record, Agreements, movements, papers made, Requests, portal activity, the Audit Events that changed their record), with the notice's points as its first page. It answers s.11 in minutes. It is never made in the portal.

**For the go-live checklist:** the two company names, and their countries, on the notice.
