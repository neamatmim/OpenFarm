# 07 — Signing answers its Request

**What to build:** When the Owner records an Agreement, they can pick the Request it answers from that Investor's live Requests on the Venture. The Request then reads **signed**. The paper's Units stand even when they differ from the yes. An Agreement can still be recorded with no Request at all, for somebody who joined by phone.

**Blocked by:** 04, 06.

**Status:** done

**Spec:** [joining spec](../spec.md), user stories 66–68. `CONTEXT.md`: **Request to Join**, **Investment Agreement**.

- [x] Signing takes an optional Request, refused unless it is that Investor's live Request on that Venture.
- [x] The Request becomes `signed` in the signing's own transaction, and its Notice, if any, is dismissed.
- [x] The Agreement records the Units on the paper. A test signs for fewer and for more than the yes, and the Agreement's Units are the paper's.
- [x] Signing with no Request behaves exactly as today; the existing signing tests stay green. *(Changed by the Owner's decision below: a live Request of theirs on the Venture reads signed too.)*
- [x] A signed Request's Units stop counting as "promised" and count as "signed" in the Owner's totals.
- [x] The Investor's page shows the Request as signed, and leads to their Agreement.
- [x] The Owner's sign form offers that Investor's live Requests to pick, with the yes's Units beside each.
- [x] Somebody signs from a yes and from nothing before this is called done.

## Decided while building

- **The Agreement names its Request** in `investment_agreement.request_id`. The spec's schema asked for this column, and ticket 06 did not add it. It is unique, so one paper answers a Request at most once. The Request table's block now sits above the Agreement's in `schema/venture.ts`, so the reference is not used before it is defined. There is no schema change beyond the column.
- **`sign` takes an optional `requestId`.** `answerBySigning` in `requests-to-join.ts` checks it behind the Farm lock that signing already holds, then marks the Request `signed`, takes down its Notice, and writes a Request Audit Event under the Owner. All of this happens in the signing's own transaction. The refusals:
  - `no_such_request`
  - `request_not_theirs`: another Investor's Request, or one on another Venture.
  - `request_not_live`: withdrawn, not this time, closed, or already signed.

  Both guards were proven by switching each off.
- **"Signed" and "promised" needed no change.** `unitsPromised` already left out a yes once its Investor had signed; that test passed before any code was written. A Request picked at signing leaves `come_and_sign` anyway.
- **A signing with no Request** was first built to leave any live Request as it was. The Owner changed that after review: see below.
- **The sign form:** choosing an Investor with a live Request on the Venture offers it under "কোন অনুরোধের উত্তর" (Answers their request). It is chosen by default, and "none, they joined another way" is the way out. The yes's Units are beside it, or the Units asked for one nobody answered. An empty Units box starts from the yes. The paper's Units stand, and the hint says so.
- **The Investor's home list:** a signed Request carries `agreementId`, read through their own narrowing. Its Venture name and an "আপনার চুক্তি খুলুন" (Open your Agreement) link lead to `/portal/ventures/$agreementId`.

## Opened, 2026-09-25

On the seed server, the setup: a Venture opened and shown (সই-উত্তর যাচাই ভেঞ্চার, PAY-5). A waiting Request for আবুল হাশেম মিয়া was inserted directly in `openfarm_seed`, because only an Investor can ask through the portal. The Owner then answered it "come and sign, 3 Units" through `answerRequest`.

The checks:
- **As the Owner, from the yes:** choosing him in the Sign sheet offered "আপনার হ্যাঁ: ৩ ইউনিটে সই করতে আসুন", already chosen, and the Units box started at 3. It was signed for **4**, as PAY-5-01. The Request list then read সই হয়েছে, with signed 4 and promised 0.
- **As the Owner, from nothing:** choosing হাজী আব্দুল মালেক offered no picker. He was signed for 2, as PAY-5-02, with `requestId` null. The totals read signed 6 and promised 0.
- **As আবুল হাশেম in the portal:** the home list shows the Request as চুক্তি সই হয়েছে, with "আপনার চুক্তি খুলুন". It opens his Agreement page, which shows 4 Units.

## Review, 2026-09-25

Fixed:
- **The sign form works out what the paper answers each time it draws,** not when the Investor was chosen. The Owner's choice is kept as "answers none", and otherwise the paper answers the Investor's live Request. A list that answers late shows the Request already chosen. A Request withdrawn meanwhile is no longer sent without being seen.
- **A Units box nobody has typed in shows the yes,** as an empty split shows the farm's figure. A yes filled in for one Investor no longer stays when the Owner moves to another.
- **Types and guards:** the form's Request type comes from the API's own answer. The "signed" write is guarded to live states, as a close is. `no_such_request` and `request_not_live` each have one constructor, used in all three places.
- **The portal list** has one link to the Agreement (the Venture's name), not two.
- **Rollback:** a new test shows a signing refused after its Request was checked (`venture_units_gone`) leaves the Request `come_and_sign`, with no "signed" trail entry. It passed before any change. Running the Request's part outside the signing's transaction does not fail it cleanly, because the two deadlock on the Request's row, so the test describes the behaviour rather than proving the guard.

Not seen on a screen after these fixes; they have been typechecked and linted. The browser was then signed in as the Investor.

**Decided by the Owner, 2026-09-25: a signing that names no Request still answers the Investor's live one on that Venture.** A yes left live after a phone signing would go on telling them the farm will sign with them, and a waiting one would keep its Notice on her list. So it reads signed, with its Notice taken down and an Audit Event, in the signing's own transaction. The Agreement names a Request only when one was picked. The Investor's page leads from any signed Request to their Agreement on that Venture: there is one per Venture, so no name is needed. This changes the checkbox "Signing with no Request behaves exactly as today" for a phone signing over a live Request. The one existing test that relied on the old behaviour now expects the later yes to be refused as `request_already_answered`, not `already_signed_on_venture`. The sign form's "none" option says the request still reads signed.
