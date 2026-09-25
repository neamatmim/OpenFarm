# 05 — Requests close when the Venture moves on

**What to build:** Requests never sit open on a Venture that has stopped gathering capital:

- Starting Buying or cancelling closes every live Request, answered or not.
- Taking the Venture out of the portal closes the waiting ones and leaves yeses standing.
- Retiring an Investor closes theirs.

Each close says why, and nothing is deleted.

**Blocked by:** 04.

**Status:** done on `feat/requests-close`

**Spec:** [joining spec](../spec.md), user stories 63–65 and 82–85. `CONTEXT.md`: **Request to Join**.

- [x] Starting Buying closes every waiting and yes Request on the Venture, with the reason. So does cancelling.
- [x] Taking the Venture out of the portal closes the waiting Requests only. A yes stays on the Investor's page, which keeps showing it even though the Venture is no longer offered.
- [x] Retiring an Investor closes their live Requests on every Venture.
- [x] Taking an Investor's portal access away closes nothing.
- [x] Each close runs in the same transaction as the act that causes it, is an Audit Event, and dismisses any open `join_requested` Notice.
- [x] Closed Requests are kept and still listed, for the Owner and for the Investor, saying why they closed.
- [x] Somebody opens the Investor's page after a hide with a yes standing, and after a close, before this is called done. **Opened on 2026-09-25** on the seed database, in Bangla:
  - **Hidden:** the Owner took কোরবানি ২০২৭ ভেঞ্চার out of the portal. মোঃ শাহজাহান সরকার's yes for 5 Units stood on the Owner's list and on his portfolio, with whom to call, though the Venture was no longer offered to him.
  - **Called off:** the Owner then called the Venture off. His Request read "বন্ধ: এই ভেঞ্চার বাতিল হয়েছে।" with no Withdraw button. The Owner's list said "ভেঞ্চার বাতিল হওয়ায় বন্ধ হয়েছে" beside the yes it had been.
  - **What it found:** an Investor told yes on a Venture taken out of the portal had no way to withdraw, because the only Withdraw button was on the Venture's page, which is gone once it is hidden. Every live Request on the portfolio list now has its own Withdraw button.
  - **Also noticed, not fixed here:** after a direct call to cancel, a reload more than a minute later still drew the old answer until the saved query cache was cleared. The app's own cancel form refreshes every read, so this may not reach anybody.
  - **The seed database** now holds that Venture as called off, until the next reseed.

## Checked before starting

- **Closing a waiting Request settles its Notice too.** Call `settleTheRequestNotice` (`packages/api/src/join-request-notice.ts`, from ticket 03) in the same transaction, or the Owner's Notice outlives the Request.

- **Start Buying** is `startBuying`, and **cancel** is `cancel`, in `packages/api/src/routers/ventures.ts`. Cancel already refunds inside its own transaction. The closing goes in there too, not after it.
- **Retiring** is in the investor router, and is refused while the Investor's money is in a running Venture. A live Request is not money, so it does not block retiring. It is closed by it.

## What was decided while building

- **Two columns:** `closed_because` (`venture_buying`, `venture_cancelled`, `taken_out_of_portal`, `investor_retired`) and `closed_at`, migration `20260925093233_why_a_request_closed`. The reasons are mirrored in the domain, with a twin test.
- **One closing function,** `closeRequests` in `packages/api/src/requests-to-join.ts`, takes the transaction and the trail of the act that causes it. Each close is its own Audit Event under whoever did the act, and each closed Request's Notice is taken down.
- **Retiring runs it through a new `andThen` hook** on the farm list's retire, on the same transaction.
- **The yes checks for "shown" and "retired" added in ticket 04 are gone.** Taking a Venture out of the portal and retiring an Investor now close the waiting Request in the same act, so there is never a waiting Request to be told yes in either case, and the checks could not be reached or proven. The ticket 04 test now expects `request_not_live` for both. The "already signed" check stays: signing by phone closes nothing.
- **A closed Request says why** on the Owner's list and on the Investor's page.
- **Starting Buying and cancelling now take the Farm lock** and read the Venture's state again behind it, as every other act on a Venture does through `actOnVenture`. Before this, a Request made at the same moment could be left waiting on a Venture that had just stopped gathering capital. The race test drives starting Buying and fails 3 times out of 3 without the lock. Cancelling takes the same lock, but no test drives it.
- **A close updates only a Request still live,** so it can never write over a withdrawal or an answer.
- **`closeRequests` is scoped to one Venture or one Investor,** never neither.
- **CONTEXT.md now says** retiring an Investor closes their Requests, and taking their portal access away does not.
- **Not decided here:** a Venture taken out of the portal and shown again lets somebody whose waiting Request was closed ask again, as a new Request. A yes that stood still stops them asking again.
- **No backfill:** Requests made before this migration on a hidden, cancelled or buying Venture, or from a retired Investor, stay live. There are none outside the dev and seed databases.
