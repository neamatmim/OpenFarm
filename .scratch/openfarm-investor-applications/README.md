# Investors apply online, by the Owner's link

The Owner, 2026-11-08: "i want to add a feature so that any investor could apply through online and we could approve
him as an investor."

Today somebody becomes an Investor only through a meeting. The Owner fills in the paper **Investor Details Form** with
them from their NID and bank papers, then types it in (`investors.record`). The Investor signs the **Portal Consent**
on paper in front of the Owner (`recordConsent`), and the Owner hands over the first code with the **Welcome Letter**
(`inviteToPortal`). Nothing of that can start online, and CONTEXT.md says so: "application (nobody applies; the Owner
invites)".

## Decided by the Owner (2026-11-08)

1. **Only somebody the Owner sends a link to may apply.** There is no public "apply to invest" page. The lawyer
   approved the portal "because it stays by invitation only" (ADR 0008), and an Investor is "known to the Owner
   personally or personally introduced". A link is an invitation to one person.
2. **The applicant fills in the whole Investor Details Form**: person or Organization (with its Signatory), name,
   address, NID, bank account, optional email, and up to three Nominees.
3. **Approving makes them an Investor and lets them in.** Their record is written from what they sent.
4. **Fully online.** The Portal Consent is agreed on the application, not signed on paper, and approving sends the
   first code by text. This reverses two rules: "signed on paper and in front of the Owner" (the glossary's **Portal
   Consent**) and "never the first code" by text (the Owner, 2026-10-09; `first_code_in_person` in
   `portal-store.ts`). Both still hold for everybody the Owner meets in person.

## Decided here, on recommendation (the Owner may overturn any of them)

5. **The consent is sealed with a code, not a tick box.** The applicant reads the Portal Consent wording in full and
   agrees by entering a code the farm texts to the phone on the link. That is the **Signing Code** idea of ADR 0022,
   and it also proves the phone is theirs before anything is sent to it. A tick box proves neither. The proof is kept
   as `signing-code.ts` keeps it: when, which way, from what address and browser, and the fingerprint of the wording.
6. **The Owner names the person when making the link**: name, mobile, person or Organization, and an email. The link
   opens only for that mobile, the phone cannot be changed on the form, and only that number gets the code. A link sent
   to the wrong person is useless to them.
   6a. **The link is sent by email** (the Owner, 2026-11-08), from the farm's own account (`EMAIL_SMTP_URL`), in Bangla
   and English as `sendNewCode`'s email is. Texting it and copying it to send another way stay available. A typed
   email is not a confirmed one: one wrong letter sends the link to a stranger. So the link names nobody until the
   code texted to the mobile is entered: before that it shows only the farm's name and "a code goes to the mobile
   ending ••34". The email they send on the form starts as the one the link went to; if they keep it, approving
   counts it as confirmed (the link was a secret sent there, as a confirmation code is), so later codes reach it too.
   Changed, they confirm it in the portal as today.
7. **Photos of the NID, front and back, are required** (the Signatory's for an Organization), and for an Organization
   its trade license and the paper that authorizes the Signatory too. The Owner never sees the card in person, so the
   photo is what their check is made against. Shrunk on the phone, as the Pay-in Note slip is.
8. **One link, one application, good for 7 days.** Sent once, a link is used up. The Owner may withdraw a link not yet
   used.
9. **The Owner is told right away** (an immediate notice, pushed), as for a Pay-in Note: somebody is waiting.
10. **The Owner approves or declines, with a line.** A decline is emailed and texted to them. There is no "send back to correct"
    in the first cut: the Owner declines with the reason and makes a new link.
11. **What is not approved is not kept.** An application declined, or left undecided for 30 days, loses its NID, bank,
    Nominees and photos 30 days after that. Its name, mobile, dates and outcome stay in the trail. An approved one's
    photos stay beside the Investor's record as the Owner's proof of the check, held as long as the record is.
12. **The Nominees typed are a draft, not a Nomination.** A Nominee is in force only once the Investor signs a
    Nomination for them. On approval the Owner is offered that Nomination in the portal, filled in, through the
    existing in-app Nomination flow (ADR 0022). One naming a minor is still signed on paper, by their Receiver.
13. **The Investor Cap is not checked here.** It is held at signing, as for a Request to Join.
14. **Built behind a switch, off by default** (`farm.investorApplications`), as Agreements in the app and Pay-in
    Notes were. It also needs the portal open, and the farm able to send texts (the code that seals the consent goes
    by text; email alone cannot prove the mobile they will sign in with). Emailing a link needs email set up too. The advisers see it before the Owner
    turns it on, since it replaces an in-person consent and NID check with an online one.

## Shape

| Today                                                | With applications                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Owner meets them and fills in the paper form         | Owner makes a link for them (name, mobile, email), and emails it          |
| Owner types the form in                              | They fill it in on their phone, with photos of their NID                  |
| Portal Consent signed on paper in front of the Owner | Portal Consent read in full and agreed with a code texted to their mobile |
| Owner checks the NID across the table                | Owner checks the NID photos on the application                            |
| First code handed over with the Welcome Letter       | Approving texts and emails the first code; Welcome Letter to send/print   |
| Nominees on the form, then a signed Nomination       | Nominees as a draft, offered as a Nomination in the portal                |

What it is **not**: no public page, no "invest now", no Units asked for, no money. An approved applicant is an Investor
with portal access, nothing more. Joining a Venture is still a Request to Join, then an Agreement.

## Tickets

| #   | Ticket                                                               | Blocked by |
| --- | -------------------------------------------------------------------- | ---------- |
| 01  | [Words, ADR and the advisers' sheet](issues/01-words-and-adr.md)     | —          |
| 02  | [The Owner makes an Application Link](issues/02-application-link.md) | 01         |
| 03  | [They apply](issues/03-they-apply.md)                                | 02         |
| 04  | [The Owner approves or declines](issues/04-approve-or-decline.md)    | 03         |
| 05  | [What is not approved is not kept](issues/05-not-kept.md)            | 04         |
| 06  | [The screens](issues/06-screens.md)                                  | 02, 03, 04 |
| 07  | [Seeded, and opened](issues/07-seed-and-open.md)                     | 06         |

05 and 06 may be built side by side. Nothing needs the advisers' answer to be built, only to be switched on.
