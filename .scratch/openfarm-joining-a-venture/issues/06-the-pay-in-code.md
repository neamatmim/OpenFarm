# 06 — The Pay-in Code

**What to build:** Every Investment Agreement gets its own **Pay-in Code** when it is recorded, and Agreements already recorded get one by migration. The Owner's capital form lists each Agreement with its code, and picks the Agreement when the bank's reference contains one. The reference the Owner records stays whatever the bank printed.

**Blocked by:** None. It touches only the Owner's existing signing and capital forms.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 69–71, 80 and 81. `CONTEXT.md`: **Pay-in Code**, **Venture Movement**.

- [ ] Recording an Agreement gives it a Pay-in Code that is short, uppercase, readable on a deposit slip, unique on the farm and never changed, for example `OF-3-07`. Avoid letters easily mistaken for digits.
- [ ] The migration gives every existing Agreement one, and the uniqueness is an index.
- [ ] Signing's result carries the code, and the Owner sees it where they have just signed.
- [ ] The capital form lists each Agreement with its code. When the reference typed in contains a code, that Agreement is picked. The reference recorded is exactly what was typed.
- [ ] Nothing names the Pay-in Code `reference` anywhere: not in the schema, the API or the words.
- [ ] Somebody signs an Agreement and records capital against it with a code in the reference before this is called done.

## Checked before starting

- **Signing** is `sign` in `packages/api/src/routers/ventures.ts`. Capital is `takeCapital`. The Owner's forms are `sign-agreement-sheet.tsx` and `take-capital-sheet.tsx` under `apps/web/src/components/ventures/`.
- **The Venture's ordinal:** Ventures have text ids and no number. Work the ordinal out from the order they were opened (tie-break on id), or store one. Decide which, and say which in the ticket.
