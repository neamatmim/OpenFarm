# 07 — "আপনার তথ্য" in the portal

**What to build:** A portal page, open before and after sign-in, shows the notice Template's current Version with the farm's facts. It is linked after the standing notice on every portal page, from the account page, and from the sign-in and join pages.

**Blocked by:** 03.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 32–33.

- [ ] The page renders without a session, in Bangla and English.
- [ ] The link "আপনার তথ্য খামার কীভাবে রাখে" follows `PortalNotice` everywhere it shows. The notice's own words are unchanged.
- [ ] The account page and the sign-in and join pages link to it.
- [ ] With a farm fact unset, the Investor side shows no bracket (ticket 03's rule).
- [ ] Somebody opens it signed out and signed in, at phone width.

## Checked before starting

- `PortalNotice` is `components/portal/portal-door.tsx:11-19`. `portal.notice` is in both message files.
- The routes under `routes/portal/_in/` need a session. This page sits beside `login.tsx` and `join.tsx`, outside `_in`.
