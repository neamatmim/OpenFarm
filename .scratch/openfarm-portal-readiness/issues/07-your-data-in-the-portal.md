# 07 — "আপনার তথ্য" in the portal

**What to build:** A portal page, open before and after sign-in, shows the notice Template's current Version with the farm's facts. It is linked after the standing notice on every portal page, from the account page, and from the sign-in and join pages.

**Blocked by:** 03.

**Status:** done on `feat/your-data-page`

**Spec:** [the readiness spec](../spec.md), user stories 32–33.

- [x] The page renders without a session, in Bangla and English.
- [x] The link "আপনার তথ্য খামার কীভাবে রাখে" follows `PortalNotice` everywhere it shows. The notice's own words are unchanged.
- [x] The account page and the sign-in and join pages link to it.
- [x] With a farm fact unset, the Investor side shows no bracket (ticket 03's rule).
- [x] Somebody opens it signed out and signed in, at phone width. **Opened 2026-09-26 on the seed farm:**
  - **With the data keepers unset,** it says "খামার এখনো এটি লিখছে" and names the farm and its phone to ask.
  - **With them set** (made-up names, cleared afterwards), it shows the whole notice in Bangla, filled in.
  - **At the narrowest window (570px),** nothing scrolls sideways. In English the page's own words switch, and the notice stays in Bangla.
  - **In the Preview,** the link stays inside the Preview, under the band.
  - **Signed in and signed out:** the page is public and was read with the Owner's session, and the door's link is on the sign-in and join pages. It was not opened with no session at all, but the test reads it as nobody.

## Checked before starting

- `PortalNotice` is `components/portal/portal-door.tsx:11-19`. `portal.notice` is in both message files.
- The routes under `routes/portal/_in/` need a session. This page sits beside `login.tsx` and `join.tsx`, outside `_in`.

## What was decided while building

- **`portal.yourData` is public, and only while the portal is open.** With it shut, a stranger learns nothing, not even the Owner's name; the Investors hold the notice on paper anyway. It is not rate-limited: nothing in it can be guessed.
- **The Owner reads it in the Preview whether the portal is open or shut**, through `portalPreview.yourData`, as every Preview page reads.
- **A farm not yet given its notice wording reads the standard wording without being given it.** A stranger's read writes nothing to the farm's records, and a test proves it.
- **The notice is shown only when every fact it names is written down** (`FIELDS_OF.privacy_notice`). Until then the page says the farm is still writing it, and whom to ask: by name, and by phone where the farm has one. Never a blank.
- **The notice reads through `readingOf` (domain)**: the Version's wording filled into a title, an opening and headed parts, clauses and facts parts alike, in Bangla. The same text as the paper, drawn as a page.
- **The notice's body is Bangla.** The page's own words follow the reader's language.
- **Routes:**
  - `/portal/your-data`, in the portal's door (wide), beside sign-in and join
  - `/investors/$investorId/as-they-see-it/your-data` in the Preview
- **One link component, `YourDataLink`.** It follows the standing notice everywhere `PortalNotice` shows (the shell, the door, the Preview), and sits on the account page.
- **The "portal is closed" refusal is one helper, `portalClosed()`**, used by the join and by this page.

