# 08 — "খামারে আপনার তথ্য"

**What to build:** From the Investor's page, the Owner makes one unmasked paper of everything the farm holds on that Investor, with the notice's points first. It answers a written request for a copy (s.11) in minutes.

**Blocked by:** 03.

**Status:** done on `feat/data-copy`

**Spec:** [the readiness spec](../spec.md), user stories 34–35.

- [x] The paper holds:
  - the notice's points
  - the record, unmasked
  - Agreements
  - the Venture Movements carrying their money
  - the papers made for them
  - Requests to Join and their changes
  - portal access, consent and activity
  - the Audit Events that changed their record
- [x] It is Owner-only from a personal session, and an `export` Audit Event on the Investor.
- [x] It is never offered in the portal or the Preview.
- [x] Somebody makes it for the seed's Investor with the most history and reads it through. **Done 2026-09-26 on the seed farm, as the Owner:**
  - আবুল হাশেম মিয়া has 4 Agreements, 4 money movements and 3 Requests, and is in the portal. "খামারে তাঁর তথ্য", beside Edit, opened the paper.
  - It read in order: the notice's nine points, then his record with the whole NID and bank account, the Agreements, the money, the papers, the Requests with each change, the portal and the change log.
  - The portal part showed his phone, invited, first and last in, "কোনো সম্মতি রেকর্ড নেই" and his sign-ins.
  - Read through, it gave up three defects, fixed before the review:
    - the nominee's name was missing from the change log (the trail keys it `nominee`)
    - the internal login address was printed where his phone should be
    - there was no line saying no consent was on file
  - After the review, ইঞ্জিনিয়ার রফিকুল ইসলাম's change log showed each re-invitation, the withdrawal by letter and why access was taken away, in Bangla.

## Checked before starting

- Investor reads are Owner-only (`requireOnly("owner", OWNER_ONLY)` throughout `routers/investors.ts`).
- The paper trail for an Investor's papers: `investor-papers.ts`. Portal activity: `portalActivity`. Requests: `routers/investors.ts` `requests`.
- Unmasked data leaves the server only on this paper. Check the answer is never cached on the device (`keptOnDevice`).

## What was decided while building

- **It is called the Data Copy**, «খামারে আপনার তথ্য», with a glossary entry beside the Welcome Letter and Code Slip.
  - The code uses `investors.dataCopy` and `dataCopyOf` (`packages/api/src/data-copy.ts`).
  - It is an Export, `data_copy`, on the Investor.
- **It is a `PaperDocument`**, built on the server and printed through the paper dialog like the consent sheet: the letterhead, numbered parts, and a stamp line in Bangla.
  - It is a mutation's answer, so the persisted query cache never keeps it on the device.
  - A paper's rows are now keyed by label and value, because the copy has rows that share a label.
- **The notice's points are its first parts.** While the notice has a fact unwritten, it is refused (`notice_unwritten`), with its own words pointing to «খামারের তথ্য কে রাখে».
  - The facts are needed before any real Investor is invited anyway.
  - A request due within 30 days waits on them. Only a farm that never wrote them down meets this refusal.
- **Everything is listed the latest first**, as `theirAgreements` lists money.
- **Papers made for them** are any Export whose trail holds their `investorId`, whoever made it and whatever it is filed against. That covers the Owner's papers and the ones they read in the portal. Each amendment of a Venture they signed into is added too, since it prints every Investor in it and carries no `investorId`.
- **The change log reads three trails:** `investor`, `investor_access` and `portal_consent`. The access row is overwritten on each invitation, so only the trail holds its history.
  - Fields are worded by `auditField.*`, which gained the access and consent fields (the audit page names them too).
  - Actions are worded by `audit.action.*`, and moments and days in Bangla.
  - The investor's fields are pinned by a test to `readInvestor`'s snapshot.
- **Words come from the messages already used on screen** wherever they exist: Request states and changes, consent lines, paper names, movement kinds.
  - Why access was taken away is its own set. It speaks to the Investor ("আপনি…"), where the Owner's screen speaks of them.
- **The phone is read back from the login address** by `phoneOfInvestorLogin`, beside `investorLoginOf`.
- **Not on it:**
  - Corrections to an Agreement or a movement. The Agreement shows the terms in force, any amendment day and the Settlement, but not the trail of each correction.
  - Sessions already ended. Only where they are signed in now is listed.
  - Wrong-code attempts counted against their phone.
  - Who else the data was shared with, beyond the papers made. The notice names the host, the backup store, the bank and the tax authority.
- **A consent recorded before the audit fix** (`cb03488`) has a `create` event whose before equals its after. Such an event shows in the change log with no fields.
