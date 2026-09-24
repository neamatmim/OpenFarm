# 02 — Making a Request to Join

**What to build:** On a shown Venture, an invited Investor asks to join for a number of whole Units, with a note if they like. Until anybody answers, they can change it, withdraw it, and ask again after withdrawing. Every change is kept.

The Owner reads a Venture's Requests on its page: each with its history, and the totals beside the target and Floor. The Investor sees their own Requests on their portfolio.

**Blocked by:** 01.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 24–38 and 44–46. `CONTEXT.md`: **Request to Join**.

- [ ] A Request is whole Units from one up to the Venture's Units, and a note of a sensible length. Anything else is refused.
- [ ] The Investor sees the taka their Units come to, and is told the Request binds nobody, holds no Units and moves no money.
- [ ] One live Request per Investor per Venture. Asking again changes it; it never adds a second.
- [ ] The Investor can change the Units and note, and can withdraw. After withdrawing they can ask again while the Venture is still shown.
- [ ] Each thing the Investor did (made, changed, withdrawn) is kept with the Units and note as they then were and when, and is an Audit Event attributed to the Investor's account.
- [ ] A Request is refused, each with its own named refusal:
  - when the Venture is not Open, not shown, or past its decide-by day;
  - from a retired Investor;
  - from somebody already signed on that Venture;
  - from anybody whose portal access is taken away or while the portal is shut.
- [ ] The Owner's Venture page lists its Requests: Investor, Units, taka, note, when, and where each stands, with its history beneath.
- [ ] Totals beside the target and the Floor: Units signed, and Units asked for and waiting. Units promised joins them in 04.
- [ ] Nobody but the Owner reads another Investor's Request. A test proves an Investor asking about somebody else's is no such thing.
- [ ] The Investor's portfolio lists their own Requests and where each stands.
- [ ] Each refusal test is proven by switching its guard off.
- [ ] The demo seed adds one waiting Request on the shown Venture.
- [ ] Somebody opens the Venture-to-join page, the Investor's portfolio and the Owner's Requests list before this is called done.

## Checked before starting

- **Partial unique index for "live":** live means `waiting`, or `come_and_sign` once 04 exists. Write the state list now so 04 only adds the answers.
- **The history table** is the Owner's reading. The trail is the record. Write both in one transaction.
- **Investor-attributed trail entries** already exist for papers they open. Follow the same pattern.
- **Rate limits:** the portal's writes so far are `join` and the password change. A Request is cheap, but a sensible per-Investor limit on how often it can change is worth asking about. If one is added, test it one request at a time.
