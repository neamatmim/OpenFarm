# 04 — Portal Consent before any code

**What to build:** The invite dialog prints the Portal Consent sheet first. The Owner marks it signed today, and only then does a code exist. Consent is recorded on the Investor's access with its day, the wording's Version and who recorded it.

**Blocked by:** 03.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 17–21.

- [ ] `investor_access` records consent: the Version id, the day signed, who recorded it, the day withdrawn, and how the withdrawal came.
- [ ] `inviteToPortal` refuses without a current, unwithdrawn consent, with a reason the dialog shows. **Prove it by switching the guard off.**
- [ ] Invite and new code both run in this order: print consent → "They signed it today" → the code. An access with no consent (one made before this) takes the same step.
- [ ] Recording consent is an Audit Event naming the Version. It never holds a code.
- [ ] The Investor's Portal section says when consent was signed, and on which Version.
- [ ] The demo seed records consent for its portal Investor.
- [ ] Somebody invites a seeded Investor from start to finish in Bangla, and the code never shows before the consent is marked.

## Checked before starting

- The invite and new-code store function is `inviteToPortal` (`portal-store.ts:118-194`). It makes the code with `newInviteCode` and refuses a retired Investor.
- The dialog is `CodeDialog` in `components/investors/portal-access.tsx:175-222`. The code lives only in component state (`given`).
- `investor_access` is in `packages/db/src/schema/venture.ts:143-161`.
- What the trail keeps of access never includes the code (portal-store.ts:51). Keep it that way.
