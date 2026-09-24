# Joining a Venture through the Investor Portal — tickets

Tickets from [the joining spec](./spec.md). ADR 0008 allows invited Investors to see a Venture still gathering capital, to say they want to join, and to be told how to pay for what they have signed. The glossary's **Request to Join** and **Pay-in Code** entries hold the vocabulary.

| #   | Ticket                                   | Blocked by |
| --- | ---------------------------------------- | ---------- |
| 01  | Showing a Venture in the portal          | —          |
| 02  | Making a Request to Join                 | 01         |
| 03  | The Owner is told                        | 02         |
| 04  | The Owner answers                        | 02, 03     |
| 05  | Requests close when the Venture moves on | 04         |
| 06  | The Pay-in Code                          | —          |
| 07  | Signing answers its Request              | 04, 06     |
| 08  | How to pay                               | 06         |
| 09  | Requests on the Investor's page          | 02         |

There are two roots. **01** is the surface everything on the Investor side sits on. **06** is the Pay-in Code, which touches only the Owner's existing signing and capital forms and can be built in parallel. Work one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.

**Every ticket ends with somebody opening the page.** Web component tests are not collected by the vitest include glob. The last ventures set left three screens nobody had seen. Each ticket that adds to the demo seed says what it adds, so the next one has something to look at.

**Settled, and not to be re-decided** (the design session of 2026-09-25, and the five rules the Owner confirmed after the spec):

- The Owner shows a Venture to every invited Investor who is not retired, or to nobody. There is no per-person choice.
- An Investor is never shown a projection, a past result, how many Units are left, who else asked, or the Investor count.
- A Request to Join binds nobody and holds no Units. Only a signed Agreement does.
- The Owner alone hears about Requests, by a Notice carried by the Digest. It is **not** a Needs Review, which is the Manager's.
- A yes is capped: the Venture's Units, less the Units on signed Agreements, less the Units on other yeses still waiting to be signed.
- The Investor Cap warns at the yes and refuses only at signing, as now.
- Bank details are shown only for an Agreement already signed, never beside an open Venture.
- After "not this time", that Investor may not ask again on the same Venture.
- After a yes, the Investor may withdraw but not change the Units.
- Retiring an Investor closes their live Requests. Taking away their portal access does not.
- After the decide-by day: no new Request and no new yes; yeses already given can still be signed.
- Nothing is paid or signed in the portal, and no capital is taken without a stamped Agreement.

Not here:

- notifications to Investors;
- paying or signing in the portal;
- the Owner's "see as they do" preview (portal-map ticket 03);
- the lawyer's written opinion (portal-map ticket 07).
