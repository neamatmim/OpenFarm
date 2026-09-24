# 03 — The Owner is told

**What to build:** A new Notice kind, `join_requested`. The Owner alone hears it, carried by the Digest like money waiting for approval. There is one Notice per Request: it follows the Request through its changes, closes itself if the Request is withdrawn before an answer, and leads the Owner to the Venture's Requests.

**Blocked by:** 02.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 39–43. `CONTEXT.md`: **Request to Join**, **Notice**, **Digest**, and **Needs Review**, which this is _not_.

- [ ] Making a Request raises one `join_requested` Notice for the Owner and nobody else. A test proves the Manager is not told.
- [ ] It is carried by the Digest, never immediate, and never wakes the farm.
- [ ] Changing the Request updates that same Notice's facts. A Request changed three times is one Notice.
- [ ] Withdrawing the Request before an answer dismisses the Notice.
- [ ] Its words, in Bangla and English, name the Investor, the Venture and the Units, with the Units worded in Bangla.
- [ ] Opening it lands the Owner on the Venture's Requests.
- [ ] Somebody opens the Owner's notice list and follows the Notice before this is called done.

## Checked before starting

- **Who hears what** is `NOTICES` in `packages/api/src/notice.ts`. When it goes is `DELIVERY` in `packages/domain/src/notify.ts`. The words are FILLINGS in `packages/domain/src/notice-words.ts`, typed per kind. Kinds are listed in `packages/db/src/schema/alert-kinds.ts` and mirrored in the domain package.
- **`needs_review` is the wrong kind.** It goes to Managers and wants a judgement recorded. The design session first said "Needs Review", and that was corrected.
- **One per thing per kind** is the `alert_once_uidx` unique index on user, kind and entity. Updating a Notice's facts means updating that row, not raising another.
- **Prior art:** `investor_statement_due`, the other Owner-only Digest Notice about an Investor's business, and its test.
