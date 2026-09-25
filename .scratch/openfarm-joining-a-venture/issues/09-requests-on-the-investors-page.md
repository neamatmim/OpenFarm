# 09 — Requests on the Investor's page

**What to build:** On the Owner's page for one Investor:

- that person's Requests across every Venture, with where each stands;
- their portal activity, which now includes each Request they made, changed and withdrew, beside the papers they opened.

**Blocked by:** 02.

**Status:** done

**Spec:** [joining spec](../spec.md), user stories 86 and 87. `CONTEXT.md`: **Request to Join**, **Investor Portal**.

- [x] The Investor's page lists their Requests across Ventures, newest first with a tie-break, each saying where it stands and why it closed if it did.
- [x] Their portal activity lists the Requests they made, changed and withdrew, with when, beside the papers they read.
- [x] Only the Owner sees either.
- [x] Somebody opens an Investor's page with Requests on two Ventures before this is called done.

## Checked before starting

- **The Investor's page** is `apps/web/src/routes/_auth/investors/$investorId.tsx`. The activity is `portalActivity` in `packages/api/src/portal-store.ts`.

## Decided while building

- **`investors.requests`** is Owner-only and reuses `theirRequests`, the Investor's own read. It is narrowed to the one Investor, ordered by `createdAt` then `id` (newest first), and carries the state, the Owner's answer and the close reason. Nothing new was written for it.
- **`portalActivity` gains `requested`,** built by `whatTheyDidToTheirRequests` in `requests-to-join.ts`. It reads the Request's own history table, not the trail: what their own account made, changed or withdrew, with the Units, when and the Venture's name. It is the latest first, with an `id` tie-break, and capped like the papers.
- **The page:**
  - The Agreements tab has a "Requests to join" section under the Agreements, hidden when they never asked. Each Request leads to its Venture's Investors tab, `#requests`.
  - The overview's portal panel lists their Request actions under the papers they read, five shown, as the papers are.
  - The state, close-reason and "what they did" words and tones are exported from `venture-requests.tsx`, not copied.

## Opened, 2026-09-25

As the Owner, আবুল হাশেম মিয়া's page on the seed server:
- **Agreements tab:** Requests on two Ventures, newest first. সই-উত্তর যাচাই ভেঞ্চার (signed, "এসে সই করুন: ৩টি ইউনিট"), then কোরবানি ২০২৭ ভেঞ্চার twice: not this time, with the Owner's line, and an earlier one withdrawn.
- **Overview:** the portal panel lists "২টি ইউনিট চেয়েছেন", "তুলে নিয়েছেন" and "৪টি ইউনিট চেয়েছেন" on কোরবানি ২০২৭ ভেঞ্চার, with when, under the papers read. The সই-উত্তর Request is not there, rightly: it was inserted into the seed database for the ticket 07 check, not made in the portal.
