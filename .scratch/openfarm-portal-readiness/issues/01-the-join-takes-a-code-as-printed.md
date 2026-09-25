# 01 — The join takes a code as printed

**What to build:** The join ignores spaces inside the code, so `K7QM 4PXA` typed as printed on the Code Slip works. A mistyped space never counts as a wrong guess.

**Blocked by:** None.

**Status:** done on `feat/join-takes-code-as-printed`, apart from somebody opening `/portal/join` (below)

**Spec:** [the readiness spec](../spec.md), user stories 1–2.

- [x] `takeUpInvitation` strips whitespace inside the code before hashing, beside the existing trim and upper-case.
- [x] A test takes an invitation up with the code split by a space, and with a tab. Both are accepted.
- [x] A test shows a wrong code with spaces still counts as exactly one attempt toward the lock-out.
- [x] **Prove the stripping by switching it off:** the spaced-code test goes red.
- [ ] Somebody takes up a seeded invitation on `/portal/join` with the code typed in two groups of four. **Not done:** taking an invitation up means choosing a password for a new account, which the agent does not type. The join form sends the code exactly as typed, with no `maxLength` or pattern (`routes/portal/join.tsx`), so the server's change is all it needs. Left for the Owner.

## Checked before starting

- The comparison is in `packages/api/src/portal-store.ts`, `takeUpInvitation`: `hashToken(input.code.trim().toUpperCase())`.
- The procedure's input is `z.string().trim().min(4).max(32)` in `packages/api/src/routers/portal.ts`. Eight letters and a space fit.
- The code alphabet has no 0/O or 1/I (`membership.ts`, `CODE_ALPHABET`), so nothing else needs normalising.

## What was decided while building

- **One rule for every code typed, next to where codes are made.** `hashOfCodeAsTyped` in `packages/api/src/membership.ts` strips all whitespace and upper-cases. `newInviteCode` keeps its hash by it. The Investor join (`takeUpInvitation`) and both staff paths (`people.acceptInvite`, `people.setPasswordWithCode`) compare by it. The staff codes come from the same generator, and the review found they had kept their own spelling (upper-case only). So a staff code read out with a gap is now taken too, and each path has a test for it.
- **The code's hash is worked out once in `takeUpInvitation`.** The invitation is found by it and then used up by it in a compare-and-swap. They used to be spelled separately. The first attempt at this ticket changed only the lookup, and a spaced code then found its invitation, opened the Investor's account, and failed the swap. So the hash is now computed once.
- **Proven by switching it off:** with the stripping replaced by trim-only, the four spaced-code tests across the three paths go red.

