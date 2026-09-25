# 01 — The join takes a code as printed

**What to build:** The join ignores spaces inside the code, so `K7QM 4PXA` typed as printed on the Code Slip works. A mistyped space never counts as a wrong guess.

**Blocked by:** None.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 1–2.

- [ ] `takeUpInvitation` strips whitespace inside the code before hashing, beside the existing trim and upper-case.
- [ ] A test takes an invitation up with the code split by a space, and with a tab. Both are accepted.
- [ ] A test shows a wrong code with spaces still counts as exactly one attempt toward the lock-out.
- [ ] **Prove the stripping by switching it off:** the spaced-code test goes red.
- [ ] Somebody takes up a seeded invitation on `/portal/join` with the code typed in two groups of four.

## Checked before starting

- The comparison is in `packages/api/src/portal-store.ts`, `takeUpInvitation`: `hashToken(input.code.trim().toUpperCase())`.
- The procedure's input is `z.string().trim().min(4).max(32)` in `packages/api/src/routers/portal.ts`. Eight letters and a space fit.
- The code alphabet has no 0/O or 1/I (`membership.ts`, `CODE_ALPHABET`), so nothing else needs normalising.
