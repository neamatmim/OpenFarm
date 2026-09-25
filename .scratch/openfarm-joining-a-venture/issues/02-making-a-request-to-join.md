# 02 — Making a Request to Join

**What to build:** On a shown Venture, an invited Investor asks to join for a number of whole Units, with a note if they like. Until anybody answers, they can change it, withdraw it, and ask again after withdrawing. Every change is kept.

The Owner reads a Venture's Requests on its page: each with its history, and the totals beside the target and Floor. The Investor sees their own Requests on their portfolio.

**Blocked by:** 01.

**Status:** done on `feat/request-to-join`

**Spec:** [joining spec](../spec.md), user stories 24–38 and 44–46. `CONTEXT.md`: **Request to Join**.

- [x] A Request is whole Units from one up to the Venture's Units, and a note of a sensible length. Anything else is refused.
- [x] The Investor sees the taka their Units come to, and is told the Request binds nobody, holds no Units and moves no money.
- [x] One live Request per Investor per Venture. Asking again changes it; it never adds a second.
- [x] The Investor can change the Units and note, and can withdraw. After withdrawing they can ask again while the Venture is still shown.
- [x] Each thing the Investor did (made, changed, withdrawn) is kept with the Units and note as they then were and when, and is an Audit Event attributed to the Investor's account.
- [x] A Request is refused, each with its own named refusal:
  - when the Venture is not Open, not shown, or past its decide-by day;
  - from a retired Investor;
  - from somebody already signed on that Venture;
  - from anybody whose portal access is taken away or while the portal is shut.
- [x] The Owner's Venture page lists its Requests: Investor, Units, taka, note, when, and where each stands, with its history beneath.
- [x] Totals beside the target and the Floor: Units signed, and Units asked for and waiting. Units promised joins them in 04.
- [x] Nobody but the Owner reads another Investor's Request. A test proves an Investor asking about somebody else's is no such thing.
- [x] The Investor's portfolio lists their own Requests and where each stands.
- [x] Each refusal test is proven by switching its guard off.
- [x] The demo seed adds one waiting Request on the shown Venture.
- [x] Somebody opens the Venture-to-join page, the Investor's portfolio and the Owner's Requests list before this is called done. **Opened on 2026-09-25** on the seed database. As আবুল হাশেম মিয়া: the portfolio's Requests section, then the Venture's page in Bangla. There the Units were changed 4 → 6 (the taka line followed), the Request was withdrawn (the form came back empty) and made again for 5, each with its toast. Both pages were seen at 570px, the narrowest the window goes, with no sideways scroll; a real phone width is still unseen. As the Owner, in Bangla and English: the Investors tab lists the withdrawn Request with its three steps beneath it and the new one waiting, beside Signed 0 and Asked for and waiting 5 Units · ৳2,50,000, the target and the Floor. No console errors. Opening the page found one defect: the Investor's line was dated by when the Request was made, not last changed. Fixed.

## Checked before starting

- **Partial unique index for "live":** live means `waiting`, or `come_and_sign` once 04 exists. Write the state list now so 04 only adds the answers.
- **The history table** is the Owner's reading. The trail is the record. Write both in one transaction.
- **Investor-attributed trail entries** already exist for papers they open. Follow the same pattern.
- **Rate limits:** the portal's writes so far are `join` and the password change. A Request is cheap, but a sensible per-Investor limit on how often it can change is worth asking about. If one is added, test it one request at a time.

## What was decided while building

- **The rules live in `packages/api/src/requests-to-join.ts`**, run through `actOnVenture`, so a Request takes the same Farm lock and state check as every other act on a Venture. The procedures are `portal.requestToJoin`, `portal.withdrawRequest`, `portal.myRequests` and `ventures.requests`.
- **The trail files each act against the Request** (`request_to_join`), `create` when made and `update` when changed or withdrawn, under the Investor's account and no Role. `request_to_join` is added to the Owner-only trail, so the Manager cannot read Requests through the audit list.
- **The state list is written in full now:** `waiting`, `come_and_sign`, `not_this_time`, `withdrawn`, `signed`, `closed`. Live means `waiting` or `come_and_sign`, and the partial unique index says the same. The answer columns and the close reason come with 04 and 05.
- **Changing a Request that has been answered is refused** with `request_already_answered`. Nothing can answer one until 04, so that refusal has no test yet. 04 owes it one.
- **Three new refusals the spec did not list:**
  - `request_not_live`, for withdrawing a Request that is not live. Live is `waiting` or `come_and_sign`, so an Investor told yes can still withdraw, as the settled rules say.
  - `no_such_request`, for somebody else's.
  - `asked_twice_at_once`, when two taps race to make the first Request. The race test goes red without it.
- **The portal door's refusal is shared.** Access taken away and a shut portal both answer `not_an_investor`, as every portal read already does, rather than a name of their own.
- **The live states and the note limit are in the domain** (`packages/domain/src/request-to-join.ts`) for the screens. The schema keeps its own copy for the column and builds the partial index from it, and `requests-to-join-states.test.ts` holds the two together.
- **An Investor is never told the Venture's Units,** not even in the server's English refusal.
- **The glossary's Request to Join entry says** "until the Owner answers it the Investor may change the Units or withdraw it". The settled rules allow withdrawing after a yes, and the code follows them. The glossary sentence reads more narrowly than the rule.
- **A note is at most 300 characters.**
- **No rate limit.** A Request is an invited, known person's act, every change is kept and in the trail, and the door already counts sign-ins. Ask again if the trail ever fills.
- **The Investor is never told the Venture's Units**, so the form does not cap the number. The server refuses too many with `units_beyond_venture`, worded for the Investor.
- **The seed opens the portal**, invites আবুল হাশেম মিয়া (phone 01711-223344, the seed password) and has them ask for 4 Units of কোরবানি ২০২৭ ভেঞ্চার the evening before today.
