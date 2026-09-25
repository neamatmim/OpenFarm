# 03 — The Owner is told

**What to build:** A new Notice kind, `join_requested`. The Owner alone hears it, carried by the Digest like money waiting for approval. There is one Notice per Request: it follows the Request through its changes, closes itself if the Request is withdrawn before an answer, and leads the Owner to the Venture's Requests.

**Blocked by:** 02.

**Status:** done on `feat/owner-told-of-requests`

**Spec:** [joining spec](../spec.md), user stories 39–43. `CONTEXT.md`: **Request to Join**, **Notice**, **Digest**, and **Needs Review**, which this is _not_.

- [x] Making a Request raises one `join_requested` Notice for the Owner and nobody else. A test proves the Manager is not told.
- [x] It is carried by the Digest, never immediate, and never wakes the farm.
- [x] Changing the Request updates that same Notice's facts. A Request changed three times is one Notice.
- [x] Withdrawing the Request before an answer dismisses the Notice.
- [x] Its words, in Bangla and English, name the Investor, the Venture and the Units, with the Units worded in Bangla.
- [x] Opening it lands the Owner on the Venture's Requests.
- [x] Somebody opens the Owner's notice list and follows the Notice before this is called done. **Opened on 2026-09-25** on the reseeded seed database, as the Owner. The Notice was in the alerts on /today: "আবুল হাশেম মিয়া ৪টি ইউনিট নিয়ে কোরবানি ২০২৭ ভেঞ্চার-এ যোগ দিতে চান", with "অনুরোধগুলো দেখুন". Following it opened কোরবানি ২০২৭ ভেঞ্চার's Investors tab, but at first it did not bring the Requests into view: the router looks for `#requests` before the Requests have loaded. The section now scrolls itself into view once they have, and the second try showed the whole Requests section.

## Checked before starting

- **Who hears what** is `NOTICES` in `packages/api/src/notice.ts`. When it goes is `DELIVERY` in `packages/domain/src/notify.ts`. The words are FILLINGS in `packages/domain/src/notice-words.ts`, typed per kind. Kinds are listed in `packages/db/src/schema/alert-kinds.ts` and mirrored in the domain package.
- **`needs_review` is the wrong kind.** It goes to Managers and wants a judgement recorded. The design session first said "Needs Review", and that was corrected.
- **One per thing per kind** is the `alert_once_uidx` unique index on user, kind and entity. Updating a Notice's facts means updating that row, not raising another.
- **Prior art:** `investor_statement_due`, the other Owner-only Digest Notice about an Investor's business, and its test.

## What was decided while building

- **The Notice is filed as `<ventureId>:<requestId>`,** about `request_to_join`. There is one per Request through `alert_once_uidx`. Led by the Venture, the Owner's list can be asked for one Venture's Requests with `alerts.mine({ about })`.
- **It is raised and settled in `packages/api/src/join-request-notice.ts`,** in the same transaction as the Request's own act. Ticket 04 settles it on an answer with `settleTheRequestNotice`.
- **A change of Units brings a put-away Notice back.** If the Owner dismissed "four Units" and the Investor then asks for ten, the Notice returns to her list with the new facts and travels in the next Digest again. A dismissed Notice that stayed dismissed would hide the change. A new note alone changes nothing the Notice says, so it brings nothing back. Both are tested, and both guards are proven.
- **A Request made again after withdrawing is a new Notice,** because it is a new Request.
- **No migration.** The kind column is text, and its list is in code.
- **The Manager test first proved nothing.** The test's Manager account was only created after the Notice was raised, so "not told" meant "not on the farm". The Manager is now made before anybody asks, and adding the Manager to the audience turns the test red.
- **The English words** avoid "{investor} asks", which the plural guard reads as a count before a verb.
- **The shared portal test helpers** are in `packages/api/src/test/portal-client.ts`.
- **For ticket 04:** answering settles the Notice with `settleTheRequestNotice`, which needs the Venture as well as the Request because the Notice is filed under both.
