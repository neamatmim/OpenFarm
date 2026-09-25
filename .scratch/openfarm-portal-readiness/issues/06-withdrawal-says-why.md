# 06 — Withdrawal says why

**What to build:** Take away asks why: they withdrew their consent, a lost phone, or the Owner's own decision. "They withdrew their consent" records the day and how they asked, and marks their consent withdrawn. A withdrawn consent never counts again.

**Blocked by:** 04.

**Status:** done on `feat/withdrawal-says-why`

**Spec:** [the readiness spec](../spec.md), user stories 29–31.

- [x] `takePortalAway` takes a reason. `withdrew_consent` also takes the day and how they asked (`letter` / `message`), and marks the consent withdrawn.
- [x] Other reasons leave the consent alone.
- [x] A new invitation after a withdrawal needs a new signed consent. A test shows the old one is refused.
- [x] Taking access away still closes no Request to Join, and a test still says so.
- [x] The Portal section shows the reason and, for a withdrawal, the day.
- [x] Somebody takes a seeded Investor's access away as a withdrawal, then invites them again through a new consent. **Done 2026-09-26 on the seed farm, as the Owner:**
  - ইঞ্জিনিয়ার রফিকুল ইসলাম, invited: "প্রবেশাধিকার তুলে নিন" asked "কেন তুলে নিচ্ছেন". "তিনি সম্মতি তুলে নিয়েছেন" brought up the day, which defaulted to today, and "কীভাবে জানিয়েছেন". It also said that a withdrawn consent never counts again.
  - The Portal section then read "প্রবেশাধিকার তুলে নেওয়া · সম্মতি তুলে নিয়েছেন ২৬ সেপ্টেম্বর, ২০২৬, সই করা চিঠিতে", with no consent line.
  - "নতুন কোড দিন" opened the consent sheet before any code. Marked signed, it gave a code with the slip only, since he has the letter.
  - The trail held the consent's `update` with `withdrawnOn` and `withdrawnHow`, and the access's `update` with `revokedWhy`.

## Checked before starting

- `takePortalAway` is at `portal-store.ts:201-236`. It sets `revokedAt`, disables the user and deletes their sessions.
- The Request to Join rule is in `CONTEXT.md`: "taking their portal access away closes nothing".

## What was decided while building

- **The reason is kept on the access** as `investor_access.revoked_why`: `withdrew_consent`, `lost_phone` or `owner` (`PORTAL_TAKEN_AWAY_WHY`).
  - Migration `20260925205233_why_access_was_taken_away` adds the column. It was applied to both dev databases (108).
  - Taking a code up clears the reason with `revoked_at`. Access taken away before this change has no reason, and says none.
- **The day and how they asked live on the consent** (`withdrawn_on`, `withdrawn_how`), as ticket 04 left them. The Owner's list reads the latest withdrawn consent (`lastConsentsWithdrawn`).
- **There are three reasons, not four.** The spec's "/ other" is covered by "my own decision". A fourth reason with a free-text note is not built; ask the Owner whether "other" meant one.
- **A withdrawal is checked before anything moves:**
  - refused with no consent in force (`no_consent_to_withdraw`)
  - refused for a day still to come (`withdrawn_in_the_future`)
  - refused for a day before they signed (`withdrawn_before_signed`)
  
  A refused withdrawal takes nothing away. Each refusal was proven by switching it off.
- **One transaction holds both changes**, each its own Audit Event: the access (`investor_access`, `update`) and the consent (`portal_consent`, `update`, with the day and how).
- **A withdrawal is recorded for anybody with a consent in force**, whatever their access:
  - Somebody already taken away, for a lost phone or the Owner's decision: the withdrawal becomes the reason.
  - A code that ran out: it is taken away with the withdrawal.
  - Take away shows for them too. Where there is no access left to take, it offers only the withdrawal.
- **Not reachable from the screen:** somebody who signed a consent and was never invited. The server records it, but the Portal section shows no Take away for them. The state only follows a consent recorded and a dialog closed before the code.
- **Marked once.** The update touches only a consent still in force, so two presses at once keep the first day. The sequential case is tested; the concurrent one is not.
- **"Withdrawal" is the glossary's word for a medicine's.** The consent's are named `ConsentWithdrawn`, `ConsentWithdrawnSaid` and `lastConsentsWithdrawn`.
- **Found while opening it: the trail's `before` was wrong for a first write.** `recordEvent` read a `null` before again after the change (`before ?? read`), so a first Portal Consent's trail said one was already in force. Commit `cb03488`, fixed at the source in the review:
  - A null snapshot is kept as read.
  - Proven red in `audit.test.ts`, and in the consent's own trail test against the old `audit.ts`.
- **Left as it was:**
  - A re-invited Investor still reads "taken away" until they take the code up, so the section shows the withdrawal beside the new consent. `revoked_at` is cleared only at take-up, as before.
  - `farmDay` checks the shape of a date, not the calendar. `2060-02-31` passes, as it does everywhere else.
