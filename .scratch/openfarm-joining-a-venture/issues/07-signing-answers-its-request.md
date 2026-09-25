# 07 — Signing answers its Request

**What to build:** When the Owner records an Agreement, they can pick the Request it answers from that Investor's live Requests on the Venture. The Request then reads **signed**. The paper's Units stand even when they differ from the yes. An Agreement can still be recorded with no Request at all, for somebody who joined by phone.

**Blocked by:** 04, 06.

**Status:** done

**Spec:** [joining spec](../spec.md), user stories 66–68. `CONTEXT.md`: **Request to Join**, **Investment Agreement**.

- [x] Signing takes an optional Request, refused unless it is that Investor's live Request on that Venture.
- [x] The Request becomes `signed` in the signing's own transaction, and its Notice, if any, is dismissed.
- [x] The Agreement records the Units on the paper. A test signs for fewer and for more than the yes, and the Agreement's Units are the paper's.
- [x] Signing with no Request behaves exactly as today; the existing signing tests stay green.
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
- **A signing with no Request leaves any live Request as it was.** That is exactly as today, and the Venture moving on closes it.
- **The sign form:** choosing an Investor with a live Request on the Venture offers it under "কোন অনুরোধের উত্তর" (Answers their request). It is chosen by default, and "none, they joined another way" is the way out. The yes's Units are beside it, or the Units asked for one nobody answered. An empty Units box starts from the yes. The paper's Units stand, and the hint says so.
- **The Investor's home list:** a signed Request carries `agreementId`, read through their own narrowing. Its Venture name and an "আপনার চুক্তি খুলুন" (Open your Agreement) link lead to `/portal/ventures/$agreementId`.

## Opened, 2026-09-25

On the seed server, the setup: a Venture opened and shown (সই-উত্তর যাচাই ভেঞ্চার, PAY-5). A waiting Request for আবুল হাশেম মিয়া was inserted directly in `openfarm_seed`, because only an Investor can ask through the portal. The Owner then answered it "come and sign, 3 Units" through `answerRequest`.

The checks:
- **As the Owner, from the yes:** choosing him in the Sign sheet offered "আপনার হ্যাঁ: ৩ ইউনিটে সই করতে আসুন", already chosen, and the Units box started at 3. It was signed for **4**, as PAY-5-01. The Request list then read সই হয়েছে, with signed 4 and promised 0.
- **As the Owner, from nothing:** choosing হাজী আব্দুল মালেক offered no picker. He was signed for 2, as PAY-5-02, with `requestId` null. The totals read signed 6 and promised 0.
- **As আবুল হাশেম in the portal:** the home list shows the Request as চুক্তি সই হয়েছে, with "আপনার চুক্তি খুলুন". It opens his Agreement page, which shows 4 Units.
