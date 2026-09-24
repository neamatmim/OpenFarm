---
status: accepted
date: 2026-09-24
---

# Investors sign in to a read-only portal, by the Owner's invitation, while the farm has it switched on

The Venture spec gave Investors documents and never a login — "an Investor has no login and never will" — because
the legal research found the farm stays clear of licensing partly by not running a platform, and the lawyer has
been asked whether even keeping investor records in OpenFarm makes it one (Payment and Settlement Systems Act 2024
s.15(2); the investor map's ticket 11, which also asks "would a future investor login?"). On 2026-09-24 the Owner
decided to build the portal before that answer comes back. It is their decision, recorded as theirs; the lawyer's
question stays open, and the portal is built so that the answer can switch it off without undoing anything.

What the portal is, and is not:

- **Read-only.** An Investor reads the Ventures they are in, how the animals are doing, and their own three papers
  (the joining letter, progress, the settlement). Nothing is taken, paid, signed or offered through it: no
  sign-up, no "invest now", no payment collection, no referral — still story 96 of the spec.
- **By invitation, one person at a time.** The Owner invites an Investor and hands them a one-time code in person;
  the Investor chooses their own password with their phone number and the code. No account exists for anybody the
  Owner has not invited, and the Owner can take access away.
- **Switched off until the Owner switches it on,** as a farm setting. Off, no Investor signs in and no invite is
  taken up — which is also how the farm answers a lawyer who says no.
- **Not a Membership.** An Investor's account holds no Role on the farm and can never be given one; every farm
  procedure already refuses somebody with no Role, and the portal's own procedures refuse anybody who is not the
  Investor the account was made for. What an Investor reads is narrowed to their own Agreements before anything is
  assembled, as the statements always were.

**Consequences**: CONTEXT.md's Investor and Investor Statement entries change; `packages/auth`'s door admits an
Investor's account only from inside the farm's own invite-taking, never from the public sign-up; every paper an
Investor opens is an Export in the trail, attributed to them, as the Owner's printing of it always was. Revisit when the lawyer answers: if the portal is a platform,
switch it off and keep the documents; if it is not, record the answer in ticket 11 and here.

**2026-09-25:** the lawyer answered, verbally, that the portal as built is acceptable because it is by invitation only. On the same basis, [ADR 0008](./0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md) lets invited Investors see Ventures still raising capital and how to pay. The portal still takes no money and signs nothing.
