# 02 — The Portal Preview

**What to build:** The Owner opens "See as they do" from the Portal section of any Investor's page and reads that Investor's real portal pages, under the Owner's own address. A band that can't be dismissed sits on every page. Every act is dimmed and says only they can do it. A paper made there is the Owner's own Export. Nothing lands on the Investor's side.

**Blocked by:** None.

**Status:** done on `feat/portal-preview`

**Spec:** [the readiness spec](../spec.md), user stories 3–13.

- [x] Owner-only preview reads take an `investorId` and return exactly the portal's own answer for that Investor. They work at any standing (never invited, invited, code ran out, in, taken away), retired included, and with the portal open or shut.
- [x] An Investor's session is refused every preview read, including for their own id. **Prove it by switching the guard off.**
- [x] A test compares each preview read, whole, with the Investor's own read of the same page.
- [x] Nothing in the preview calls `investorProcedure` or `markSeen`. A test shows `lastSeenAt` and `portalActivity.read` are unchanged after a preview and a paper.
- [x] The portal pages and shell read from a source rather than `orpc.portal.*` directly. There is one component per page.
- [x] A "See as they do" button sits in the Portal section beside Invite. There is none on the Investors list.
- [x] The band reads, in both languages, that this is <name>'s portal as they would see it today, that they cannot see you here, and that nothing you do reaches them. It has "Back to <name>".
- [x] Every act is dimmed with "Only <name> can do this, from their own sign-in": the password, signing other devices out, request, change and withdraw.
- [x] Sign out in the user menu becomes "Back to <name>". The language and theme switches work.
- [x] A paper opened in the preview goes through the Owner's `investor-statements` path. Its Audit Event notes the preview of that Investor, and it never appears in their activity.
- [x] Somebody opens the preview for a never-invited Investor, an invited one and one who is in, walks every page in Bangla and English, and opens a paper. **Opened 2026-09-25 on the seed database, as the Owner:** আবুল হাশেম মিয়া (in): portfolio, Requests, a Venture with how to pay, its papers tab, a joining letter made (stamped produced by the Owner), money (its Venture links stay in the Preview), the account masked, both account acts dim with the reason; ইঞ্জিনিয়ার রফিকুল ইসলাম (never invited): his portal, the Venture raising capital, the Request form dim; Back to <name>; English and Bangla; the narrowest window (570px, the phone layout: band wraps, bottom bar in the Preview); a missing Investor's address. **The Investor's own portal after its pages moved was opened too**, the Owner having signed in as আবুল হাশেম মিয়া: portfolio, money, papers, account, Ventures raising capital and a Venture's tab switch all stay under `/portal`; no band, no act dim (the password fields and "sign out everywhere else" are live); the only disabled buttons are the ones that always were (papers on a Venture with no capital yet, the password button while the form is empty).

## Checked before starting

- The portal's reads are in `packages/api/src/routers/portal.ts`, all behind `investorProcedure` (:51-74). It refuses anyone with a Role, and calls `markSeen`.
- The store functions they use are in `packages/api/src/portal-store.ts`. `requireTheirs` narrows a Venture to the Investor's own Agreements. Call it with the previewed Investor's id; don't widen it.
- The Owner's paper path is `packages/api/src/routers/investor-statements.ts`, via `joiningLetterFor` / `progressStatementFor` / `settlementStatementFor` in `investor-papers.ts`, which attribute the Export to the caller.
- The activity view (`portalActivity`, portal-store.ts:498-540) reads exports whose `actorId` is the Investor's user.
- The shell and sidebar call `orpc.portal.me` and `orpc.portal.portfolio` directly (`components/portal/portal-shell.tsx`). Those are the calls to route through a source.
- The Portal section is `components/investors/investor-profile.tsx:382-388` with `PortalAccess` (`portal-access.tsx`).
- The portal's own guard (`routes/portal/_in.tsx`) sends a non-Investor to `/dashboard`. The preview route lives under `_auth/investors/$investorId`, not under `/portal`.

## What was decided while building

- **Every portal read is one function in `packages/api/src/portal-reads.ts`**: `theirRecord`, `theirPortfolio`, `theirOpenVentures`, `theirOwnRequests`, `theirSignIns`, `theirVentureToday`, `theirPaper`. The Investor's own procedures (behind `investorProcedure`, which marks them seen) and the Owner's `portalPreview` router (Owner-only, personal session, never `investorProcedure`) both call them, so the two cannot drift.
- **A paper in the Preview goes through the same paper functions, not the `investor-statements` router.** It is made by `theirPaper` as the Owner, which is the same `joiningLetterFor` / `progressStatementFor` / `settlementStatementFor` the Owner's statements use. It is attributed to the Owner, and its Export carries `inPreviewOf: <investorId>`. The ticket named the `investor-statements` path; the spec review judged this deviation harmless, since the paper, the attribution and the note are all as decided.
- **The web's portal pages live in `apps/web/src/components/portal/pages/`** and read through `components/portal/portal-source.tsx`:
  - whose portal it is
  - one query per read
  - `usePortalPlaces` for links
  - `useCanAct` and `WhyNot` for dim acts
  
  The `/portal/_in/*` routes and the Preview's `/investors/$investorId/as-they-see-it/*` routes both mount them. The Preview's routes sit outside `_auth`, so the Owner's app shell does not wrap the portal's.
- **The band and the portal's bar are pinned together**, so the band never covers the language, theme or user menu.
- **The Owner's device keeps the Preview's answers** like the Owner's other Investor pages (`keptOnDevice` leaves out only paths starting `portal`). The spec review found no conflict: the never-kept rule is about the Investor's own phone. One caveat: offline, the Preview can show figures up to 14 days old under a band that says "today".
- **A missing Investor's address** says so, with a way back to the Investors list, and is not asked again.
- **Proven by switching off:** without `requireOnly("owner")`, the "Owner's alone" test goes red. With a "mark seen" slipped into the Preview, the "leaves nothing" test goes red; that test reads the Preview three hours after the Investor, so a seen mark would show.

