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
  - **An invited Investor gets a printed Bangla welcome sheet**: the address, a QR code to it, their code, the steps, and whom to call.
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

- [What the portal must withstand once strangers can reach it](./issues/02-what-the-portal-must-withstand-once-strangers-can-reach-it.md) — OWASP ASVS 5.0 L1 review. Five must-fixes before the first Investor: a password written into the server log by a mistyped `join` (live for staff too), portal answers left in the phone's cache after sign-out, sign-in naming Investor phones without the password, no per-address limit on `join`, common passwords accepted. A subdomain reduces four findings and removes none. Framing and printed papers are already sound.
- [What Bangladesh's data-protection law asks of the portal](./issues/01-what-bangladesh-data-protection-law-asks-of-the-portal.md) — the Personal Data Protection Act 2026 is in force but has no regulator or regulations yet. It asks for consent the farm can prove, a notice, the rights to a copy, correction and erasure, a register, and breach reporting. There is no registration and no data-localisation rule, and NID and bank details are not "sensitive". The portal lacks the notice, the consent and a way to ask.

## Not yet specified

- **Joining a Venture through the portal**, allowed by ADR 0008. Its shape is undecided:
  - What an Investor sees of a Venture still raising capital, with no projections.
  - What "I want to join" records: Units asked for, a note?
  - How the Owner is told, and how it becomes a stamped Agreement signed in person.
  - Whether every invited Investor sees every Venture raising capital, or only those the Owner chooses.
  - Where the Venture Account's bank details and the payment reference are shown.

  This is a design effort of its own, best run as a `/grill-with-docs` session and then `/to-spec`.

- **What the lawyer's answer changes.** A "no" switches the portal off and keeps the papers. A "yes, with conditions" may change the notice, what is shown, or who may be invited. That can't be ticketed until the answer exists.
- **The day the switch is turned on for one person.** Whether a written readiness check comes first: the preview read through, the welcome sheet printed, the notice approved, support ready. It may turn out to be nothing more than the tickets above, all closed. Part of what is left to *do* is now known: the exposure review's five must-fixes, handed off as work when the map closes, not decided here. All five were fixed on 2026-09-25, outside the map: the password in the log first, because it was live for staff, then the other four together. The remaining go-live checks are not code: the proxy must set `X-Forwarded-For`, and static assets must carry the security headers.
- **A breach plan.** The Act (s.20) and the Cyber Security Act 2026 (s.9(4)) both require reporting. Who the farm tells, and what OpenFarm must be able to show, can be asked once the lawyer has said whether the Authority's reach is live (ticket 07).
- **Support once someone is in.** Most of it is settled: a new code for a forgotten password, the Owner taking access away for a lost phone. Whether anything else needs deciding shows only once the address and the welcome sheet are settled.

## Out of scope

- **The farm's own go-live** (server, domain, HTTPS, backups): the whole farm's step, not the portal's. Decided while charting.
- **Notifications to Investors** (a statement ready, a payout sent): a later effort once people use the portal. Decided while charting.
- **Signing through the portal**, meaning Agreements, Venture Schedules and Amendments signed electronically. It reopens ADR 0007 and waits on the lawyer's e-signature questions in ticket 11.
- **Paying inside the portal** (card, mobile financial services, a gateway). The lawyer did not approve it on 2026-09-25, so capital still arrives by bank into the Venture Account. See [ADR 0008](../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md).
