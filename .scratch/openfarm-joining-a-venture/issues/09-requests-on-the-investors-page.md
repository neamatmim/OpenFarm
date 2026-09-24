# 09 — Requests on the Investor's page

**What to build:** On the Owner's page for one Investor:

- that person's Requests across every Venture, with where each stands;
- their portal activity, which now includes each Request they made, changed and withdrew, beside the papers they opened.

**Blocked by:** 02.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 86 and 87. `CONTEXT.md`: **Request to Join**, **Investor Portal**.

- [ ] The Investor's page lists their Requests across Ventures, newest first with a tie-break, each saying where it stands and why it closed if it did.
- [ ] Their portal activity lists the Requests they made, changed and withdrew, with when, beside the papers they read.
- [ ] Only the Owner sees either.
- [ ] Somebody opens an Investor's page with Requests on two Ventures before this is called done.

## Checked before starting

- **The Investor's page** is `apps/web/src/routes/_auth/investors/$investorId.tsx`. The activity is `portalActivity` in `packages/api/src/portal-store.ts`.
