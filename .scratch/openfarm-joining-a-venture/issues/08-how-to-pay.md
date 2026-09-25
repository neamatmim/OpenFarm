# 08 — How to pay

**What to build:** The Owner writes the Venture Account's bank details on the Venture. Only the Owner can, and every change is in the trail. An invited Investor's own signed Agreement in the portal shows **how to pay** while capital is owed:

- the bank details;
- the amount still owed;
- their Pay-in Code;
- the decide-by day;
- a warning that the farm will never ask them to pay anywhere else.

It disappears once the capital is in. No bank details appear anywhere near a Venture they have not signed for.

**Blocked by:** 06.

**Status:** done

**Spec:** [joining spec](../spec.md), user stories 72–79. `CONTEXT.md`: **Venture Account**, **Pay-in Code**. ADR 0008.

- [x] The Owner can write and change the Venture Account's bank, branch, account name, account number and routing number on the Venture's page. Only the Owner can, and each change is an Audit Event keeping what it said before.
- [x] An Investor's Agreement in the portal shows the "how to pay" block while capital is owed. The amount owed is the Agreement's Units times the Unit price, less the capital recorded against it. A test makes a part payment and reads the rest.
- [x] Once capital recorded equals what the Agreement says, the block is gone.
- [x] With no bank details written, the block says the farm will tell them where to pay, and still shows the amount and the code.
- [x] The warning that the farm will only ever ask them to pay into this account, and to call the Owner if anyone gives another, is always on the block, in Bangla and English.
- [x] No open-Venture answer carries bank details. A test asserts on the whole answer from ticket 01's read.
- [x] Another Investor's Agreement is still no such agreement.
- [x] The demo seed writes bank details on the seeded Venture.
- [x] Somebody opens the portal Agreement page with money owed, part paid, fully paid and with no bank details before this is called done.

## Checked before starting

- **Capital recorded against an Agreement** is already summed for the capital form and for the joining paper. Use that sum rather than writing a second one.
- **The portal's Agreement page** is `apps/web/src/routes/portal/_in/ventures.$agreementId.tsx`.

## Decided while building

- **Columns:** five nullable columns on `venture`: `account_bank`, `account_branch`, `account_name`, `account_number` and `account_routing_number`. `accountOf` in `venture-store.ts` reads them as an account only once the bank, the name and the number are written. The branch and routing number may come later. The Owner's view and "how to pay" both use it.
- **`ventures.setBankAccount`:** Owner only. It is audited as a Venture update, with `readVenture` on both sides, so the trail keeps what the account said before.
- **`portal.venture` gains `howToPay`,** built in `how-to-pay.ts`:
  - It is present only while the Venture is Open and something is still owed. Capital is taken only while Open, so a Venture that has moved on or been called off shows nothing.
  - What is owed is Units × Unit price, less `takenAgainst`, the same sum `takeCapital` refuses by.
  - The Agreement is already narrowed to the Investor by `requireTheirs`.
- **The warning** first showed in the reader's language only. After review it shows in both at once: see below.
- **Seed:** `setBankAccount` on the Venture the seed shows in the portal (কোরবানি ২০২৭ ভেঞ্চার).

## Opened, 2026-09-25

- **As the Owner, on সই-উত্তর যাচাই ভেঞ্চার:** the Venture Account panel said "not written yet". "হিসাব লিখুন" wrote all five details, and the panel then listed them with "হিসাব বদলান".
- **Setup through the RPC console:** a ৳50,000 part payment on PAY-5-01; a new Venture (শোধ যাচাই ভেঞ্চার) with bank details, আবুল হাশেম signed on it (PAY-6-01) and paid in full; PAY-4-01 left owed with no bank details.
- **As আবুল হাশেম in the portal:**
  - **PAY-5-01, part paid:** "কীভাবে টাকা দেবেন" with ৳১,৫০,০০০ still to pay, PAY-5-01, the decide-by day ৩০ নভেম্বর, ২০২৬, all five bank details, and the warning with the farm's phone.
  - **PAY-4-01, no bank details:** ৳২,০০,০০০, the code, and "কোথায় টাকা দেবেন, খামার আপনাকে জানাবে". The warning's first wording ("the account on this page") read wrong here with no account shown. It was changed after review, as below.
  - **PAY-6-01, fully paid:** no block, and the account number nowhere on the page.

## Review, 2026-09-25

Fixed after the two reviews:
- **The warning is said in both languages at once:** the reader's first, then the other, through `translate`, as "always on the block, in Bangla and English" asks. A message claiming the account has changed may come in either language. It has two halves:
  - "the farm will only ever ask you to pay into the Venture's bank account shown above" with an account, or "the farm will tell you on this page where to pay, and only ever into the account it shows here" without one;
  - "call the farm on {phone}", or just "call the farm" when there is no phone.
- **One list of the account's details,** `ACCOUNT_DETAILS` in `venture-account-details.tsx`. It is typed against every field, so a new detail is a compiler error until it is named. `VentureAccountDetails` shows them for both the Owner's panel and the portal block, where two copies had been written.
- **The Owner's Venture Account panel shows in every state,** not only Open, since the same account carries buying, refunds and payouts. `setBankAccount` says so; it was never limited by state.
- **Bangla:** the Venture Account is "ভেঞ্চারের ব্যাংক হিসাব", because "ভেঞ্চারের হিসাব" already means the Venture's reckoning elsewhere.
- **The `portal.pay.*` words** sit after the Requests to Join words, not inside them.
- **A new test:** a Venture that starts Buying with capital still owed shows no block.

Seen after the fixes, as আবুল হাশেম: PAY-4-01 (no account) and PAY-5-01 (account written) each show the warning in Bangla, then English, with the farm's phone.

Left as they were: "absent before signing" is proven only through the whole-answer check of `openVentures`, since there is no Agreement to read before signing. Every Venture Audit Event now carries the account in its snapshot; the Venture trail is the Owner's alone to read.
