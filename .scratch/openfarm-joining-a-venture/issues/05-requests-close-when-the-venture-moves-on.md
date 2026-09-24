# 05 — Requests close when the Venture moves on

**What to build:** Requests never sit open on a Venture that has stopped gathering capital:

- Starting Buying or cancelling closes every live Request, answered or not.
- Taking the Venture out of the portal closes the waiting ones and leaves yeses standing.
- Retiring an Investor closes theirs.

Each close says why, and nothing is deleted.

**Blocked by:** 04.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 63–65 and 82–85. `CONTEXT.md`: **Request to Join**.

- [ ] Starting Buying closes every waiting and yes Request on the Venture, with the reason. So does cancelling.
- [ ] Taking the Venture out of the portal closes the waiting Requests only. A yes stays on the Investor's page, which keeps showing it even though the Venture is no longer offered.
- [ ] Retiring an Investor closes their live Requests on every Venture.
- [ ] Taking an Investor's portal access away closes nothing.
- [ ] Each close runs in the same transaction as the act that causes it, is an Audit Event, and dismisses any open `join_requested` Notice.
- [ ] Closed Requests are kept and still listed, for the Owner and for the Investor, saying why they closed.
- [ ] Somebody opens the Investor's page after a hide with a yes standing, and after a close, before this is called done.

## Checked before starting

- **Start Buying** is `startBuying`, and **cancel** is `cancel`, in `packages/api/src/routers/ventures.ts`. Cancel already refunds inside its own transaction. The closing goes in there too, not after it.
- **Retiring** is in the investor router, and is refused while the Investor's money is in a running Venture. A live Request is not money, so it does not block retiring. It is closed by it.
