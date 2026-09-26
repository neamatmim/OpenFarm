# OpenFarm investor portal: the first real Investor in — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-investor-portal/`)

Charted: 2026-09-25

## Destination

The way is clear for the **first real Investor to sign in to the portal from their own phone**. Every decision that has to be made before that day is made. What is left is doing it: the farm going live, the lawyer's answer in hand, and the switch turned on for one person. The map is done when no ticket remains and opening the portal to that Investor is a step, not a question.

## Notes

- **What already exists** (built 2026-09-24/25, all merged; [ADR 0007](../../docs/adr/0007-investors-sign-in-to-a-read-only-portal.md), CONTEXT.md's **Investor Portal** entry):
  - A read-only portal, by invitation, switched off by default.
  - Sign-in by phone and password from a one-time code.
  - A portfolio with a capital account, allocation, Venture cards, papers and money.
  - Venture pages with a stage track, figures, herd, spend, key dates and papers.
  - An account page with masked details, password change and devices.
  - A 12-hour sign-in and a notice on every page.
  - The Owner's view of each Investor's activity.
  - The app's own shell.
- **Settled while charting (2026-09-25)**, not re-asked:
  - **The first real Investor waits for the lawyer's written answer** to the platform question: ticket 11, [Take the structure to a lawyer and a Shariah scholar](../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md). The build went ahead on the Owner's decision; letting a real person read real figures does not.
  - **The farm's own go-live** on the Singapore server is not deployed yet, and is out of this map. This map assumes it and decides only what the portal adds on top.
  - **A password is enough.** There is no second factor; the rate limit and the 12-hour sign-in stand.
  - **The Owner gets a read-only "see as they do" preview** of any Investor's portal.
  - **An invited Investor gets a printed Bangla Welcome Letter**: the address, a QR code to it, their code, the steps, and whom to call.
  - **Notifications to Investors come later**, as their own effort.
- **Domain vocabulary** is in [`CONTEXT.md`](../../CONTEXT.md). Grep it before naming anything.
- **Skills**:
  - `/grilling` + `/domain-modeling` for grilling tickets.
  - A background research agent for research tickets.
  - `/prototype` for the prototype ticket.
- **Research** findings are written at `docs/research/<name>.md` on a `research/<name>` branch, then merged to main. The ticket links them.
- **Assets** go in `assets/` and are linked from the ticket, never pasted into it.
- **Standing constraints**: stay read-only per ADR 0007. Don't relax the "no capital without a stamped Agreement" guard until ticket 11 is answered.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- **The lawyer's answer, verbal (2026-09-25),** on [Bring the portal as built to the lawyer](./issues/07-bring-the-portal-to-the-lawyer.md). The ticket stays open for the written opinion. Invitation-only makes three things acceptable: the portal as built, invited Investors seeing Ventures still raising capital and saying they want to join, and showing how to pay by bank. Paying inside the portal was not approved. Recorded as [ADR 0008](../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md).

- **Joining a Venture through the portal, designed (2026-09-25)** in a `/grill-with-docs` session; the glossary's **Request to Join** and **Pay-in Code** entries and its **Investor Portal**, **Investor Cap** and **Venture Account** entries hold it. The Owner shows a Venture, and then every invited Investor who is not retired sees its terms and rules, never a projection, a Units-left count or anybody else's business. A Request to Join is whole Units and a note, binds nobody, and can be changed until the Owner answers "come and sign" (capped by Units still free) or "not this time". The Owner alone hears it, as one Notice carried by the Digest. Signing is in person as now, and the Agreement names its Request. Bank details, the amount owed and a Pay-in Code show only on a signed Agreement. The Cap warns at the yes and refuses only at signing. Nothing is sent to the Investor. It is built now, behind the switch, and the screens went onto [ticket 07](./issues/07-bring-the-portal-to-the-lawyer.md) for the written opinion. Specced as [Joining a Venture through the Investor Portal](../openfarm-joining-a-venture/spec.md), ready for an agent, and broken into [nine tickets](../openfarm-joining-a-venture/README.md).

- [What the portal must withstand once strangers can reach it](./issues/02-what-the-portal-must-withstand-once-strangers-can-reach-it.md) — OWASP ASVS 5.0 L1 review. Five must-fixes before the first Investor: a password written into the server log by a mistyped `join` (live for staff too), portal answers left in the phone's cache after sign-out, sign-in naming Investor phones without the password, no per-address limit on `join`, common passwords accepted. A subdomain reduces four findings and removes none. Framing and printed papers are already sound.
- [What Bangladesh's data-protection law asks of the portal](./issues/01-what-bangladesh-data-protection-law-asks-of-the-portal.md) — the Personal Data Protection Act 2026 is in force but has no regulator or regulations yet. It asks for consent the farm can prove, a notice, the rights to a copy, correction and erasure, a register, and breach reporting. There is no registration and no data-localisation rule, and NID and bank details are not "sensitive". The portal lacks the notice, the consent and a way to ask.
- [What "see as they do" shows, and what it must never do](./issues/03-what-see-as-they-do-shows-and-what-it-must-never-do.md) — the **Portal Preview**: the Owner alone reads any Investor's real portal pages, from the Owner's own sign-in, for any standing and with the switch open or shut. A band on every page marks it. Every act shows dimmed, a paper is the Owner's own Export, nothing lands on the Investor's side, and viewing is not audited.
- [Prototype the welcome sheet an invited Investor is handed](./issues/04-prototype-the-welcome-sheet.md) — the **Welcome Letter**: one Bangla A4 letter, with English only on the title, the slip's labels and the notice. The QR goes to the portal's front door. The code is on a tear-off **Code Slip**, kept apart from the printed phone number. It prints only from the code dialog: the letter the first time, the slip alone for every later code. Each print is an Export that never holds the code. Hands off: the join must accept a code with a space in it. Prototype on branch `prototype/welcome-sheet`.
- [Does the portal get its own address?](./issues/05-does-the-portal-get-its-own-address.md) — yes: `investors.<farm-domain>`, decided before the first Welcome Letter prints ([ADR 0009](../../docs/adr/0009-the-investor-portal-has-its-own-address.md)). Each address serves only its own people: `/portal` redirects, and the door points each person to their own address once the password is right. The portal keeps nothing on the phone, so the browser wipes it at sign-out. Hands off per-address auth and a strict CSP.
- [What the portal tells an Investor about itself and about their data](./issues/06-what-the-portal-tells-an-investor-about-itself-and-their-data.md) — a Bangla privacy notice, "আপনার তথ্য", is [drafted](./assets/06-your-data-notice-draft.md). It is a portal page open before sign-in, and the back of the Welcome Letter. Requests go to the Owner in writing, as a letter or a message from the number on file, answered within 30 days. There is no acknowledgement in the portal. The standing notice is unchanged, with a link added. Hands off an Owner-only "খামারে আপনার তথ্য" copy paper.
- [How an Investor's consent is taken and proven](./issues/08-how-an-investors-consent-is-taken-and-proven.md) — the **Portal Consent**: a Bangla sheet signed in front of the Owner at the Welcome Letter's handover, filed on paper, with its day and wording version recorded. No code is given before it. The Investment Agreement gains a data clause and nominee lines, the notice goes to every Investor at signing, and withdrawal is a Take away with its reason. For the lawyer: the clause, the sheet, and s.40.

- [Bring the portal as built to the lawyer](./issues/07-bring-the-portal-to-the-lawyer.md) — **the written opinion is in hand (2026-09-26), with no changes needed.** The portal as built, joining through it and how to pay are all approved; paying inside the portal stays out. Real Investors may now be let in, one at a time, by the Owner's switch and invitation.

## Not yet specified

- ~~**What the lawyer's answer changes.**~~ Nothing: the written opinion (2026-09-26) approved the portal as built.
- **The day the switch is turned on for one person.** Whether a written readiness check comes first: the preview read through, the Welcome Letter printed, the notice approved, support ready. It may turn out to be nothing more than the tickets above, all closed. Part of what is left to _do_ is now known: the exposure review's five must-fixes, handed off as work when the map closes, not decided here. All five were fixed on 2026-09-25, outside the map: the password in the log first, because it was live for staff, then the other four together. The remaining go-live checks are not code: the proxy must set `X-Forwarded-For`, static assets must carry the security headers, and the Investor address needs its DNS name, certificate and nginx block (ticket 05). The privacy notice needs the host's and the backup store's names (ticket 06). The build work handed off from tickets 03, 04, 05, 06 and 08 is specced as [The portal ready for its first Investor](../openfarm-portal-readiness/spec.md), in [eleven tickets](../openfarm-portal-readiness/README.md). It covers the Preview, the consent step, the Welcome Letter, the notice page, the copy paper, the Agreement clause, the own address and the wipe.
- **A breach plan.** The Act (s.20) and the Cyber Security Act 2026 (s.9(4)) both require reporting. Who the farm tells, and what OpenFarm must be able to show, is no longer blocked: the lawyer's written opinion is in (ticket 07), and it can be charted when the Owner wants it.

## Out of scope

- **The farm's own go-live** (server, domain, HTTPS, backups): the whole farm's step, not the portal's. Decided while charting.
- **Notifications to Investors** (a statement ready, a payout sent): a later effort once people use the portal. Decided while charting.
- **Signing through the portal**, meaning Agreements, Venture Schedules and Amendments signed electronically. It reopens ADR 0007 and waits on the lawyer's e-signature questions in ticket 11.
- **Paying inside the portal** (card, mobile financial services, a gateway). The lawyer did not approve it on 2026-09-25, so capital still arrives by bank into the Venture Account. See [ADR 0008](../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md).
