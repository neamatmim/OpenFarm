# 06 — Seeded, and opened

**What to build:** one Organization in the seed, signed on a Venture, and every page opened.

**Blocked by:** 04, 05

**Status:** done (2026-10-08), merged with fix/seed-builds-again

- [ ] **Seed:** an Organization (a dairy-trading company, a Signatory with a Bangla name) in `INVESTORS`, signed on one
      running Venture, invited to the portal.
- [ ] **Open:** /investors (list, search by Signatory), its page, record and change-Signatory sheets, the signing
      sheet, each paper laid out, the portal as the Signatory (home, account, statements), in Bangla and English.
- [ ] Migrate `OpenFarm` and `openfarm_seed`; restart the dev server if the migration added a table.

**As done:** every screen opened on the seed server (127.0.0.1:3002) with an Organization written down through the
app: list, search by Signatory, its page, record/edit/change-Signatory sheets, the Agreement laid out to sign, the
template editor's conditions, consent + invitation, and the portal's account page as the Signatory.

**Not done — the seed itself.** `pnpm db:seed --reset` fails on main, for two reasons that predate this work:
1. Since `79423db3` (2026-10-07) sign-up lets an invitation in for 14 days by the real clock; the seed gives its codes
   on its own days, 90 back, so every staff sign-up is refused (`auth.notInvited`). A fix is in the patch below
   (`signUpAsInvitedNow` in seed/runtime.ts: the invite dated now for the moment of signing up, then put back).
2. Somewhere in the 2026-10-06 feed fixes (`5e745273` already fails, `5298dd0c` builds): the seed stops on its
   2026-08-04 paperwork, `a_price_is_missing`, 12.19 kg unpriced for কোরবানি ২০২৬ ভেঞ্চার's July.

`seed-organization.patch` (beside this README) holds fix 1 and the Organization's seeding (AN_ORGANIZATION signs 4
Units of the next Venture two days back, capital in, Signatory let into the portal). Apply it once fix 2 is found.

`openfarm_seed` was rebuilt from `5298dd0c` and migrated forward to `20261008050401` after a reset here dropped it.

**Mended (same day, the Owner said yes):** bisected to `e1662397` (feed-screens merge: `cameInAt`, a delivery written
down on its day counts from that moment). The opening stock now goes in at 05:45, before the first Feedings. Fix 1 as
above. Full seed built into `openfarm_bisect`: Meghna Dairy Traders Ltd, 4 Units of কোরবানি ২০২৭ (open), no Nomination,
Signatory in the portal with an account in his own name. The patch file is gone; both are commits.
