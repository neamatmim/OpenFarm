# A company or other organization joins as an Investor

The Owner, 2026-10-08: "a person can join as an investor on behalf of a organization/company — is there any way to add
them". Today there is not: an **Investor** is a person everywhere (CONTEXT.md :323, the `investor` table with NID and
Nominees, every paper written to one named person). Recording the person who acts for a company under their own name
would put the company's share in that person's name, their bank account and, through their Nominees, their estate.

The Owner, same day: the lawyer and the Shariah scholar **have already agreed** to an organization joining a Venture.
No advisers' sheet; nothing here waits on them.

## Decided by the Owner (2026-10-08)

1. **Counts as one** towards the **Investor Cap**, as a person does. (`countedInvestors` already counts records, so
   nothing changes there.)
2. **One Signatory.** One person — name, mobile, NID, role (Managing Director, Proprietor, …) — signs the papers and
   signs in to the portal for it. The Owner may change the Signatory; the Audit Event keeps who it was.
3. **What is recorded about the organization:** its name, address, trade license number, RJSC registration number, TIN,
   the bank account it is paid into, and a note of the **authority** (board resolution / authorisation letter: what it
   is and its date).
4. **No Nominee.** The share is the organization's and stays with it; when the Signatory leaves or dies, only the
   Signatory is changed.

## Decided here (Claude's recommendation, for the Owner to overrule)

- **Words.** An Investor is a person or an **Organization**; an Organization acts through its **Signatory**. _Avoid_:
  company (one legal form among several — a partnership firm or a sole proprietorship's trade name is one too),
  representative, authorised person, agent. Bangla: **প্রতিষ্ঠান** and **স্বাক্ষরকারী**.
- **The mobile on the record is the Signatory's.** An Investor's `phone` is the mobile the Farm reaches them on and the
  one they sign in to the portal with; for an Organization that is the Signatory's. So the portal's login, the
  invitation and "one portal account to a mobile" stay as they are. The same-Investor rule stays name + phone: the
  Organization's name on its Signatory's mobile.
- **A person stays a person.** Whether an Investor is a person or an Organization is chosen when they are written down
  and never changed; a mistake is retired and written down again, as a wrong name with Agreements on it would be.
- **Changing the Signatory** is its own act, not "put the record right": it takes away the old Signatory's portal
  sign-in (the account was theirs), and the new Signatory signs a Portal Consent before being invited — consent is a
  person's. Agreements already signed stand: the Organization signed them, through whoever was its Signatory that day,
  and the paper says who.
- **Known limit:** a Signatory who is also an Investor in their own right, on the same mobile, can reach only one of the
  two records in the portal (`phone_has_portal`, one account to a mobile). Both are recorded and counted (two towards
  the Cap); the Owner gives the portal to one. Not built around unless the Owner meets it.

## Shape

| A person                                 | An Organization                                                      |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Name, mobile, address, NID, bank account | Name, address, trade license, RJSC no., TIN, bank account, authority |
| —                                        | Signatory: name, mobile, NID, role                                   |
| Nominees on a Nomination; heirs clause   | No Nominee, no Nomination; the share is the Organization's           |
| Signs for themself                       | The Signatory signs "for and on behalf of" the Organization          |
| Portal Consent and sign-in are theirs    | The Signatory's; a new Signatory consents and is invited afresh      |
| One towards the Cap                      | One towards the Cap                                                  |

## Tickets

| #   | Ticket                                                                      | Blocked by |
| --- | --------------------------------------------------------------------------- | ---------- |
| 01  | [Words and ADR](issues/01-words-and-adr.md)                                 | done       |
| 02  | [Writing an Organization down](issues/02-record-an-organization.md)         | done       |
| 03  | [No Nominee for an Organization](issues/03-no-nominee.md)                   | done       |
| 04  | [Changing the Signatory, and the portal](issues/04-signatory-and-portal.md) | done       |
| 05  | [The papers](issues/05-papers.md)                                           | done       |
| 06  | [Seeded, and opened](issues/06-seed-and-open.md)                            | done       |

03 and 04 may be built side by side.

## Where it touches (from the map, 2026-10-08)

- Schema `packages/db/src/schema/venture.ts`:184-228 (`investor`), :734-830 (Nominations).
- `packages/api/src/routers/investors.ts`:73-84 `personInput`, :418-483 record/update; `investor-store.ts`
  `theSamePerson`, `readInvestor`.
- Signing `agreement-write.ts`:174-182 writes a Nomination always; `nominations.ts`:279-293.
- Portal `portal-invitable.ts`, `portal-store.ts`:354-482, `investorOf`; consent wording `standard-templates.ts`:558-610.
- Papers `paper-template.ts`:540-548 `PaperInvestor`, :626-632 `investorRows`, :643-670 `othersNamedOnly`, :722-729
  `signingOrder`; `standard-templates.ts` PARTIES, nominee/heirs clauses; `papers.ts`:758-930 যোগদানপত্র;
  `welcome-letter.ts`; `data-copy.ts`.
- Web `components/investors/investor-sheet.tsx`, `investor-profile.tsx`, `investors-table.tsx`,
  `ventures/sign-agreement-sheet.tsx`:451; catalogs `investors.*`.
- Seed `packages/api/src/seed/ventures.ts`:35-135.
