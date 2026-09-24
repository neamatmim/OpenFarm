# 07 — Signing answers its Request

**What to build:** When the Owner records an Agreement, they can pick the Request it answers from that Investor's live Requests on the Venture. The Request then reads **signed**. The paper's Units stand even when they differ from the yes. An Agreement can still be recorded with no Request at all, for somebody who joined by phone.

**Blocked by:** 04, 06.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 66–68. `CONTEXT.md`: **Request to Join**, **Investment Agreement**.

- [ ] Signing takes an optional Request, refused unless it is that Investor's live Request on that Venture.
- [ ] The Request becomes `signed` in the signing's own transaction, and its Notice, if any, is dismissed.
- [ ] The Agreement records the Units on the paper. A test signs for fewer and for more than the yes, and the Agreement's Units are the paper's.
- [ ] Signing with no Request behaves exactly as today; the existing signing tests stay green.
- [ ] A signed Request's Units stop counting as "promised" and count as "signed" in the Owner's totals.
- [ ] The Investor's page shows the Request as signed, and leads to their Agreement.
- [ ] The Owner's sign form offers that Investor's live Requests to pick, with the yes's Units beside each.
- [ ] Somebody signs from a yes and from nothing before this is called done.
