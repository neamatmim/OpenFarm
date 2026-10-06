# Survey of the Investor portal, 2026-10-06

Three reviewers each took one part: who gets in and what each Investor reads; money and agreements; figures and screens. Each finding is marked:

- **Proven:** a temporary test went red against main at e12350bf, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. Who gets in, and what they read

1. **Proven, high.** After the Owner corrects an Investor's phone, the next Investor invited on the old number takes over the first one's account. `takeUpInvitation` finds the existing account at the old address, ties the second invitation to it, and resets its password. The second Investor then reads the first Investor's portfolio and papers.
   - The first Investor's new code then fails with INTERNAL_SERVER_ERROR.
   - Nothing moves the account's address when the phone changes.
   - `portal-store.ts:187-197,374-387,424-435,495-506`, `portal-invitable.ts:44-53`, `routers/investors.ts:459-485`.
2. **Proven, medium–high.** A code survives a withdrawn Portal Consent. If access was already taken away (lost phone, new code given) and the Investor then withdraws consent, `takePortalAway` only rewrites the reason. The code still joins and the portal answers. `portal-store.ts:244-247,280-286,349-364,400-417`.
3. **Proven, medium (PDPA).** An Amendment offered in the app shows every co-investor's full NID, phone, address and nominees, while the Investor's own NID is masked. The Owner's Preview hides offered papers, so the Owner never sees this. `agreement-paper.ts:157-182`, `paper-values.ts:151-165`, `amendment-offer-store.ts:398-455`.
4. **Proven/Traced, medium.** Better Auth's `/update-user` is open. Any signed-in account, an Investor's included, can rename itself, and the audit trail reads names live. It is reachable on the farm's address, which is where the portal lives until it has its own. `packages/auth/src/index.ts:278-360`, `routers/audit.ts:81`.
5. **Proven, low.** Code guesses sent all at once beat the 10-per-phone limit, because the lockout is checked before the awaits and failures are counted after. `portal-store.ts:336-346`, `attempts.ts:29-62`.

## B. Agreements and offers

1. **Proven, high.** Approving an older Agreement Offer writes its Nominees dated the approval day, so it outranks a Nomination the Investor signed in between. Example: the son was named on paper on day 3; the wife wins on day 5. `agreement-offer-store.ts:330`, `agreement-write.ts:154-158`, `nomination-store.ts:32`.
2. **Proven, high.** After an Amendment moves the Target Window, a new Investor's agreed paper prints the window from the Venture row, which still holds the old one, while their Agreement records the amended window. Traced to the same cause:
   - the stamped agreement-to-sign paper;
   - the portal's Open Ventures card.

   `agreement-paper.ts:92-93`, `routers/investor-statements.ts:159`, `venture-showing.ts:141`.

3. **Proven, medium.** An Agreement Offer on a cancelled Venture stays listed and can still be agreed. Traced to the same gap:
   - an Amendment offer on a settled Venture;
   - offers left showing once the agreeing-in-the-app switch is off.

   `agreement-offer-store.ts:391,426`, `amendment-offer-store.ts:398,459`.

## C. Money owed

1. **Proven, medium.** Once a Venture stops taking capital, the portal home and money page still say "৳50,000 still to pay" with a how-to-pay link. A Pay-in Note would then be refused. `still-to-pay.tsx:16-19` against `how-to-pay.ts:57`.
2. **Proven, low–medium.** A Pay-in Note stays waiting after a Correction fills its Agreement. Only answering "not found" clears it, and that tells the Investor something false. `ventures/capital.ts:223`, `corrections/venture-movement.ts:286`.
3. **Traced, low.** A note can be received for an amount other than the capital booked, and the note then says "received ৳X" when ৳Y was taken. `pay-in-notes.ts:731`.

## D. Figures and papers

1. **Proven, high.** An animal moved into a Venture by Internal Sale is shown with her first lorry's Intake weight, gain and weight line, from months before the Venture had her. Today's C3 limited only the herd's gain to her stretch. `venture-herd-store.ts:341-392`.
2. **Proven, medium.** Investor papers made for an English reader put English digits inside Bangla phrases. The Return on Capital line uses one value for both halves. `investor-papers.ts:232,345`, `investor-statement-words.ts`, `domain/papers.ts:1065,1214,1273-1290`.
3. **Proven, medium.** A running Venture with nobody signed (Floor 0, or the Farm's own Units only) writes an Audit Event on every sweep, for ever. `investor-statement-notice.ts:130-188`, `the-day-turns.ts:613-640`.
4. **Proven, medium.** An Investor who has signed but not yet paid is projected "Your share ৳0 – ৳0" under a positive projected profit. `portal-reads.ts:316-323` against `investor-statement-store.ts:277-283`.
5. **Traced, medium.** Shutting the portal leaves a signed-in Investor on the generic error page. Retry loops back to it, there is no sign-out, and nothing says the portal is shut. `routes/portal/_authenticated.tsx:36-46`.
6. **Traced, low.** The home card and Ventures list show Units signed; the Venture page and statement show Units held. The Investor reads "10 units", then "4 units · 40%". `home.tsx:89`, `your-ventures.tsx`, `venture.tsx:101`.
7. **Traced, low.** A Venture whose animals were all lost says "No animals bought yet". `pages/venture.tsx:327-337`.
8. **Traced, low.** The Farm's own Units are on the progress statement but not on the portal's Venture page. `portal-reads.ts:247-325`.

## Checked and holding

- Records cannot be read by a guessed id.
- A shut portal refuses every procedure.
- Taking access away disables the account and ends its sessions.
- The 12-hour sign-in is enforced.
- The Returns, Projections, Pay-in and agree-in-app switches are each gated.
- A note cannot be received twice or against another Agreement.
- Units cannot be oversold by two approvals at once.
- Statements are told once each, never for a settled or cancelled Venture.
- Portal answers are not cached on the device.
- Every portal refusal has Bangla words.

## Decisions (the Owner, 2026-10-06)

- Build all four groups.
- A3: in the portal an Amendment names the other parties only, with no NID, phone, address or nominees. The printed paper the Owner keeps stays whole.
- D4/D6: while a Venture gathers, an Investor is projected and shown on the Units signed for. Once buying starts it is the Units paid for, as the Settlement divides. The same rule applies on the home card, the Ventures list and the Venture page.
- C1: once a Venture takes no more capital there is no "still to pay" and no how-to-pay link. A line says what was not paid, and that their share is by what they paid.

Defaults taken without asking, as the obvious reading:

- A1: correcting an Investor's phone moves their sign-in to the new number, as the code's comment already says. A code is not taken up onto an account that belongs to another Investor.
- B1: an approved offer's Nominees are dated the day the Investor agreed, so a Nomination signed after that still wins.
- B3: offers are hidden while the agreeing-in-the-app switch is off, and hidden and refused once their Venture is cancelled or buying (an Agreement offer) or settled (an Amendment offer).
- C3: a note received says the sum booked.
- D2: in a Bangla phrase every number is in Bangla numerals, whatever the reader's language.
- D3: a Venture that nobody has signed into is not due a statement.

## Status

| Group | Branch                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | fix/portal-door       | Done (taking up a code moves the Investor's own account to their phone today; an account another Investor still signs in with is refused `phone_has_portal` at the consent, invitation and join — `accountOfAnotherAt`, `theirAccount`; a consent withdrawn after access was taken clears the code; an Amendment in the portal names other parties by name alone — `othersNamedOnly`, the kept paper and its fingerprint unchanged; Better Auth `/update-user` disabled; code guesses counted before any await, a right one given back — `takeBackOne`)                                                                                   |
| B     | fix/portal-agreements | Done (an approved offer's Nominees dated the day agreed — `nominatedOn`; the offer's paper, the stamped paper to sign and the portal's Open Ventures read the window in force — `withWindowsInForce`; agreement offers shown and agreeable only on an open Venture and with the switch on, Amendment offers not once settled — `venture_wrong_state`/`already_approved`, worded `agreeInApp.refusal.venture_moved_on`. Offers are hidden at read time rather than withdrawn, so the Owner's list still shows them standing until withdrawn. The to-sign paper's window and a settled Venture's Amendment offer have no test of their own) |
| C     | fix/portal-money      | Done (their Agreements say `takesCapital`; the portal says a sum not sent as not paid, share by what was paid, no how-to-pay — `lib/still-to-pay`; a capital Correction that fills the paper closes waiting notes `nothing_owed`; a received note carries `receivedMoney` and says the sum recorded where it differs)                                                                                                                                                                                                                                                                                                                     |
| D     | fix/portal-figures    | Done (a Venture's progress reads each animal from the day it had her, at the Internal Sale's weight, readings and line within her stretch; Investor papers say every figure beside a Bangla unit in Bangla numerals, the per-Unit and Return on Capital lines in both halves' own — joining letter too; a Venture nobody signed is never due a statement; projection and page on one holding — Units signed while gathering, paid once buying, `unitsCounted` on the home card and list; a shut portal signs the reader out to the door, which says so; all lost counts as gone; the Farm's own Units on the Venture page)                |
