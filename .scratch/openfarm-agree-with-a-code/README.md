# Papers agreed in the app with a one-time code — tickets

These build what the map [OpenFarm: signing in the app instead of on paper](../openfarm-sign-in-the-app/map.md) decided
on 2026-10-08, in [The route, paper by paper](../openfarm-sign-in-the-app/issues/07-the-route-paper-by-paper.md). The why
is [ADR 0022](../../docs/adr/0022-papers-are-agreed-in-the-app-with-a-one-time-code.md).

| #   | Ticket                                              | Blocked by |
| --- | --------------------------------------------------- | ---------- |
| 01  | The Portal Consent's signing clause                 | —          |
| 02  | An Investor's email, confirmed once                 | —          |
| 03  | Agreeing with a one-time code                       | 01, 02     |
| 04  | Withdrawing an agreement before it is approved      | 03         |
| 05  | A মনোনয়নপত্র offered in the app                     | 03         |

**Two roots, 01 and 02**, which may go side by side. 03 is the heart: every in-app agreement sealed by a code, with its
proof kept. 04 and 05 hang off it and may go side by side once it is in.

Work one ticket per `/implement`, clearing context between them. Each ticket's status is on its own `**Status:**` line.

**Every ticket ends with somebody opening the page**, in both languages, the portal at phone width; and in the *other*
UI language too, since the browser holds one catalog ([[a-catalog-holds-one-language]]).

**Settled, not to be re-decided:**

- One meeting to join (NID checked, portal code handed over, Portal Consent signed on paper); everything after it in the
  app, except a মনোনয়নপত্র naming a minor. Stamped paper stays available for every paper.
- **A code by SMS and by email**, entering either seals; in-app agreeing works for an Investor once a channel is set up
  for them — paper until then.
- **The stamp risk is accepted** (Stamp Act ss.35, 62); nothing in the app tries to stamp an in-app Agreement.
- The farm's switches stay the Owner's to turn on, never an agent's.

**Out of scope:** paper Agreements stamped by e-challan without an endorsement (Stamp Act s.32) — its own effort.
