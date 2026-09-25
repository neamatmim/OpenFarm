# 06 — Withdrawal says why

**What to build:** Take away asks why: they withdrew their consent, a lost phone, or the Owner's own decision. "They withdrew their consent" records the day and how they asked, and marks their consent withdrawn. A withdrawn consent never counts again.

**Blocked by:** 04.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 29–31.

- [ ] `takePortalAway` takes a reason. `withdrew_consent` also takes the day and how they asked (`letter` / `message`), and marks the consent withdrawn.
- [ ] Other reasons leave the consent alone.
- [ ] A new invitation after a withdrawal needs a new signed consent. A test shows the old one is refused.
- [ ] Taking access away still closes no Request to Join, and a test still says so.
- [ ] The Portal section shows the reason and, for a withdrawal, the day.
- [ ] Somebody takes a seeded Investor's access away as a withdrawal, then invites them again through a new consent.

## Checked before starting

- `takePortalAway` is at `portal-store.ts:201-236`. It sets `revokedAt`, disables the user and deletes their sessions.
- The Request to Join rule is in `CONTEXT.md`: "taking their portal access away closes nothing".
