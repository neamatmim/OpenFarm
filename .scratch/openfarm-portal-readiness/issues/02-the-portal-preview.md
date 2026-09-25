# 02 — The Portal Preview

**What to build:** The Owner opens "See as they do" from the Portal section of any Investor's page and reads that Investor's real portal pages, under the Owner's own address. A band that can't be dismissed sits on every page. Every act is dimmed and says only they can do it. A paper made there is the Owner's own Export. Nothing lands on the Investor's side.

**Blocked by:** None.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 3–13.

- [ ] Owner-only preview reads take an `investorId` and return exactly the portal's own answer for that Investor. They work at any standing (never invited, invited, code ran out, in, taken away), retired included, and with the portal open or shut.
- [ ] An Investor's session is refused every preview read, including for their own id. **Prove it by switching the guard off.**
- [ ] A test compares each preview read, whole, with the Investor's own read of the same page.
- [ ] Nothing in the preview calls `investorProcedure` or `markSeen`. A test shows `lastSeenAt` and `portalActivity.read` are unchanged after a preview and a paper.
- [ ] The portal pages and shell read from a source rather than `orpc.portal.*` directly. There is one component per page.
- [ ] A "See as they do" button sits in the Portal section beside Invite. There is none on the Investors list.
- [ ] The band reads, in both languages, that this is <name>'s portal as they would see it today, that they cannot see you here, and that nothing you do reaches them. It has "Back to <name>".
- [ ] Every act is dimmed with "Only <name> can do this, from their own sign-in": the password, signing other devices out, request, change and withdraw.
- [ ] Sign out in the user menu becomes "Back to <name>". The language and theme switches work.
- [ ] A paper opened in the preview goes through the Owner's `investor-statements` path. Its Audit Event notes the preview of that Investor, and it never appears in their activity.
- [ ] Somebody opens the preview for a never-invited Investor, an invited one and one who is in, walks every page in Bangla and English, and opens a paper.

## Checked before starting

- The portal's reads are in `packages/api/src/routers/portal.ts`, all behind `investorProcedure` (:51-74). It refuses anyone with a Role, and calls `markSeen`.
- The store functions they use are in `packages/api/src/portal-store.ts`. `requireTheirs` narrows a Venture to the Investor's own Agreements. Call it with the previewed Investor's id; don't widen it.
- The Owner's paper path is `packages/api/src/routers/investor-statements.ts`, via `joiningLetterFor` / `progressStatementFor` / `settlementStatementFor` in `investor-papers.ts`, which attribute the Export to the caller.
- The activity view (`portalActivity`, portal-store.ts:498-540) reads exports whose `actorId` is the Investor's user.
- The shell and sidebar call `orpc.portal.me` and `orpc.portal.portfolio` directly (`components/portal/portal-shell.tsx`). Those are the calls to route through a source.
- The Portal section is `components/investors/investor-profile.tsx:382-388` with `PortalAccess` (`portal-access.tsx`).
- The portal's own guard (`routes/portal/_in.tsx`) sends a non-Investor to `/dashboard`. The preview route lives under `_auth/investors/$investorId`, not under `/portal`.
