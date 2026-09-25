# 08 — "খামারে আপনার তথ্য"

**What to build:** From the Investor's page, the Owner makes one unmasked paper of everything the farm holds on that Investor, with the notice's points first. It answers a written request for a copy (s.11) in minutes.

**Blocked by:** 03.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 34–35.

- [ ] The paper holds:
  - the notice's points
  - the record, unmasked
  - Agreements
  - the Venture Movements carrying their money
  - the papers made for them
  - Requests to Join and their changes
  - portal access, consent and activity
  - the Audit Events that changed their record
- [ ] It is Owner-only from a personal session, and an `export` Audit Event on the Investor.
- [ ] It is never offered in the portal or the Preview.
- [ ] Somebody makes it for the seed's Investor with the most history and reads it through.

## Checked before starting

- Investor reads are Owner-only (`requireOnly("owner", OWNER_ONLY)` throughout `routers/investors.ts`).
- The paper trail for an Investor's papers: `investor-papers.ts`. Portal activity: `portalActivity`. Requests: `routers/investors.ts` `requests`.
- Unmasked data leaves the server only on this paper. Check the answer is never cached on the device (`keptOnDevice`).
