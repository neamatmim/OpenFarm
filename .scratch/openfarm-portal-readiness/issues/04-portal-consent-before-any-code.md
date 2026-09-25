# 04 — Portal Consent before any code

**What to build:** The invite dialog prints the Portal Consent sheet first. The Owner marks it signed today, and only then does a code exist. Consent is recorded on the Investor's access with its day, the wording's Version and who recorded it.

**Blocked by:** 03.

**Status:** done on `feat/portal-consent`

**Spec:** [the readiness spec](../spec.md), user stories 17–21.

- [x] `investor_access` records consent: the Version id, the day signed, who recorded it, the day withdrawn, and how the withdrawal came.
- [x] `inviteToPortal` refuses without a current, unwithdrawn consent, with a reason the dialog shows. **Prove it by switching the guard off.**
- [x] Invite and new code both run in this order: print consent → "They signed it today" → the code. An access with no consent (one made before this) takes the same step.
- [x] Recording consent is an Audit Event naming the Version. It never holds a code.
- [x] The Investor's Portal section says when consent was signed, and on which Version.
- [x] The demo seed records consent for its portal Investor.
- [x] Somebody invites a seeded Investor from start to finish in Bangla, and the code never shows before the consent is marked. **Done 2026-09-26 on the seed farm, as the Owner:**
  - ডাঃ নুরুল আমিন, never invited: "পোর্টালে আমন্ত্রণ" opened the consent sheet, with his name and phone, him signing first, and the Owner countersigning, each with a date line, and "সংস্করণ ২ / Version 2" in the foot.
  - No code showed until "তিনি আজ সই করেছেন". Then "তাঁর কোড" opened.
  - The Portal section read "সম্মতি সই ২৬ সেপ্টেম্বর, ২০২৬ · ভাষার সংস্করণ ২ · কোডের মেয়াদ …".
  - After the migration was regenerated, his access had no consent on file: the access-made-before-consent case. "নতুন কোড দিন" opened the sheet again and showed no code.

## Checked before starting

- The invite and new-code store function is `inviteToPortal` (`portal-store.ts:118-194`). It makes the code with `newInviteCode` and refuses a retired Investor.
- The dialog is `CodeDialog` in `components/investors/portal-access.tsx:175-222`. The code lives only in component state (`given`).
- `investor_access` is in `packages/db/src/schema/venture.ts:143-161`.
- What the trail keeps of access never includes the code (portal-store.ts:51). Keep it that way.

## What was decided while building

- **Consent lives in its own table, `portal_consent`, not on `investor_access`.** The Owner chose this, 2026-09-26. The access row exists only once an invitation is made, and consent comes before any invitation. A table also keeps the history: a withdrawn consent stays on file beside the next.
  - The table keeps the Version signed (`version_id`), the day (`signed_on`), who recorded it and when, and the withdrawal (`withdrawn_on`, and `withdrawn_how`: `letter` or `message`), which ticket 06 fills.
  - One consent is in force at a time, held by a partial unique index, so a second press of "They signed it today" meets "signed already".
- **`invitable` (`packages/api/src/portal-invitable.ts`) is one check for the consent, its sheet and the invite**: on file, not retired, a Bangladeshi mobile number, and no other Investor's portal on it. A consent is never kept for somebody who could not then be given a code.
- **`investors.consentSheet`** lays out the consent for one Investor in the wording in force, with its Version in the foot. It is an Export (`portal_consent`) on the Investor, holding the Version and never a code.
- **`investors.recordConsent`** records a consent signed today. Its Audit Event holds the day and the Version, by number and id.
- **`inviteToPortal` refuses without a consent in force (`no_consent`)**. That covers an access made before this change, which signs before its next code.
- **The list carries `portalConsent`**, and the Portal section says "সম্মতি সই {day} · ভাষার সংস্করণ {n}". "ভাষার সংস্করণ" is the Templates page's own word for a Version of the wording.
- **`PaperDialog` has an `action` beside Print**, which holds "They signed it today".
- **The tests invite through `invitedWithConsent`** (`packages/api/src/test/portal-client.ts`). The seed records consent before it invites.
- **Migration `20260925200920_a_portal_consent`** was applied to both dev databases. It was regenerated once, before merging, to rename `withdrawn_by` to `withdrawn_how`.
- **Proven by switching off:** without the `no_consent` guard, "no code is given to somebody who has not signed one" goes red.

