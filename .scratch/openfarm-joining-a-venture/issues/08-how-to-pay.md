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
- **The warning** exists in both message files and shows in the reader's language, as the portal notice does. It says "the Venture Account shown on this page", which reads right with or without an account written.
- **Seed:** `setBankAccount` on the Venture the seed shows in the portal (কোরবানি ২০২৭ ভেঞ্চার).

## Opened, 2026-09-25

- **As the Owner, on সই-উত্তর যাচাই ভেঞ্চার:** the Venture Account panel said "not written yet". "হিসাব লিখুন" wrote all five details, and the panel then listed them with "হিসাব বদলান".
- **Setup through the RPC console:** a ৳50,000 part payment on PAY-5-01; a new Venture (শোধ যাচাই ভেঞ্চার) with bank details, আবুল হাশেম signed on it (PAY-6-01) and paid in full; PAY-4-01 left owed with no bank details.
- **As আবুল হাশেম in the portal:**
  - **PAY-5-01, part paid:** "কীভাবে টাকা দেবেন" with ৳১,৫০,০০০ still to pay, PAY-5-01, the decide-by day ৩০ নভেম্বর, ২০২৬, all five bank details, and the warning with the farm's phone.
  - **PAY-4-01, no bank details:** ৳২,০০,০০০, the code, and "কোথায় টাকা দেবেন, খামার আপনাকে জানাবে". The warning's first wording ("the account on this page") read wrong here with no account shown, and was changed. The new wording has not been seen on screen.
  - **PAY-6-01, fully paid:** no block, and the account number nowhere on the page.
