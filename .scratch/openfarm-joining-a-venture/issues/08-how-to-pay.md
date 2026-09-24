# 08 — How to pay

**What to build:** The Owner writes the Venture Account's bank details on the Venture. Only the Owner can, and every change is in the trail. An invited Investor's own signed Agreement in the portal shows **how to pay** while capital is owed:

- the bank details;
- the amount still owed;
- their Pay-in Code;
- the decide-by day;
- a warning that the farm will never ask them to pay anywhere else.

It disappears once the capital is in. No bank details appear anywhere near a Venture they have not signed for.

**Blocked by:** 06.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 72–79. `CONTEXT.md`: **Venture Account**, **Pay-in Code**. ADR 0008.

- [ ] The Owner can write and change the Venture Account's bank, branch, account name, account number and routing number on the Venture's page. Only the Owner can, and each change is an Audit Event keeping what it said before.
- [ ] An Investor's Agreement in the portal shows the "how to pay" block while capital is owed. The amount owed is the Agreement's Units times the Unit price, less the capital recorded against it. A test makes a part payment and reads the rest.
- [ ] Once capital recorded equals what the Agreement says, the block is gone.
- [ ] With no bank details written, the block says the farm will tell them where to pay, and still shows the amount and the code.
- [ ] The warning that the farm will only ever ask them to pay into this account, and to call the Owner if anyone gives another, is always on the block, in Bangla and English.
- [ ] No open-Venture answer carries bank details. A test asserts on the whole answer from ticket 01's read.
- [ ] Another Investor's Agreement is still no such agreement.
- [ ] The demo seed writes bank details on the seeded Venture.
- [ ] Somebody opens the portal Agreement page with money owed, part paid, fully paid and with no bank details before this is called done.

## Checked before starting

- **Capital recorded against an Agreement** is already summed for the capital form and for the joining paper. Use that sum rather than writing a second one.
- **The portal's Agreement page** is `apps/web/src/routes/portal/_in/ventures.$agreementId.tsx`.
