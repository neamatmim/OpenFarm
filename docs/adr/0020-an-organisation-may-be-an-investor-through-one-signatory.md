---
status: accepted
date: 2026-10-08
---

# An Organisation may be an Investor, through one Signatory

Until now an Investor was a person in the schema, in CONTEXT.md and on every paper: one name, one NID, Nominees for their death, a portal sign-in of their own. On 2026-10-08 the Owner asked how to take in somebody joining a Venture on behalf of a company. The only way then was to write that person down under their own name. That put the company's share in their name, paid it to their bank account, and through their Nominees left it to their family. The Owner said the lawyer and the Shariah scholar had already agreed to an organisation joining a Venture, so there is no advisers' sheet. Their agreement is the Owner's word. It is not a written opinion filed in this repository.

**An Investor is a person or an Organisation, chosen when they are written down and never changed.** An Organisation acts through one **Signatory**. The Owner decided four things:

- **One towards the Investor Cap,** as a person is. `countedInvestors` already counts Investor records rather than the people behind them, so it is unchanged. A Signatory who also invests in their own right is a second Investor and counts again.
- **One Signatory:** name, mobile, NID and role. The Signatory signs for and on behalf of the Organisation and signs in to the portal for it. Changing the Signatory is the Owner's own act, with the authority that names the new one, and the Audit Event keeps who it was.
- **What is written down about the Organisation:** its name, address, trade licence number, RJSC registration number, TIN, the bank account it is paid into, and its authority (the board resolution or letter naming the Signatory, and its date).
- **No Nominee and no Nomination.** The share is the Organisation's and outlives any Signatory. Its papers carry a line saying so in place of the Nominee and heirs clauses.

Claude's recommendation, taken with the Owner's word to build it:

- **The phone on an Organisation's record is its Signatory's mobile.** The Investor's phone is already the mobile the portal login is made from (`investor-login.ts`), and one mobile is already one account. Making the Signatory's mobile the record's phone leaves the portal's invitation, sign-in and refusals as they are. It also keeps the same-Investor rule (name and phone) meaningful: the Organisation's name on its Signatory's mobile. A second phone for the Organisation's office was not taken up.
- **Changing the Signatory is not putting the record right.** `investors.update` puts the same Signatory's details right, their mobile included, as it does a person's. `changeSignatory` stands a different person in their place. It takes away the portal sign-in and ends the Portal Consent in force, both said to have ended because the Signatory changed (`signatory_changed`), because both belonged to the person leaving. It also lets go of their portal account, so the new Signatory opens one in their own name. The new Signatory signs a Portal Consent before being invited. Agreements already signed stand, because the Organisation signed them.
- **The kind never changes.** An Organisation's Agreements, papers and payouts are worded for an Organisation. Turning it into a person afterwards would leave signed papers that disagree with the record. One written down as the wrong kind is retired and written down again, as a wrong name with Agreements on it would be.

**Consequences:**

- CONTEXT.md gains **Organisation** and **Signatory**. **Investor**, **Investor Cap**, **Nominee**, **Investor Portal** and **Portal Consent** say how each applies to an Organisation.
- `investor.kind` and the Organisation's and Signatory's columns arrive in one migration, and `signatory_changed` joins the reasons portal access is taken away and a consent ends in another. The plan is in `.scratch/openfarm-organisation-investors/`.
- The standard Templates gain a Version each that words the parties, signature lines and Portal Consent for an Organisation and leaves out the Nominee and heirs clauses for one. The Owner records the lawyer's approval on those Versions, as before.
- Known limit: a Signatory who is also an Investor in their own right on the same mobile can be given the portal for only one of the two records (`phone_has_portal`). Nothing is built around this unless the Owner meets it.

**Revisit** if the Owner meets an Organisation that must have two people able to sign, or a Signatory who must reach their own record and the Organisation's from one mobile.
