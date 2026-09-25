# 06 — The Pay-in Code

**What to build:** Every Investment Agreement gets its own **Pay-in Code** when it is recorded, and Agreements already recorded get one by migration. The Owner's capital form lists each Agreement with its code, and picks the Agreement when the bank's reference contains one. The reference the Owner records stays whatever the bank printed.

**Blocked by:** None. It touches only the Owner's existing signing and capital forms.

**Status:** done

**Spec:** [joining spec](../spec.md), user stories 69–71, 80 and 81. `CONTEXT.md`: **Pay-in Code**, **Venture Movement**.

- [x] Recording an Agreement gives it a Pay-in Code that is short, uppercase, readable on a deposit slip, unique on the farm and never changed, for example `OF-3-07`. Avoid letters easily mistaken for digits.
- [x] The migration gives every existing Agreement one, and the uniqueness is an index.
- [x] Signing's result carries the code, and the Owner sees it where they have just signed.
- [x] The capital form lists each Agreement with its code. When the reference typed in contains a code, that Agreement is picked. The reference recorded is exactly what was typed.
- [x] Nothing names the Pay-in Code `reference` anywhere: not in the schema, the API or the words.
- [x] Somebody signs an Agreement and records capital against it with a code in the reference before this is called done.

## Checked before starting

- **Signing** is `sign` in `packages/api/src/routers/ventures.ts`. Capital is `takeCapital`. The Owner's forms are `sign-agreement-sheet.tsx` and `take-capital-sheet.tsx` under `apps/web/src/components/ventures/`.
- **The Venture's ordinal:** Ventures have text ids and no number. Work the ordinal out from the order they were opened (tie-break on id), or store one. Decide which, and say which in the ticket.

## Decided while building

- **The Venture's ordinal is stored,** as `venture.ordinal`, unique per Farm. It is given at opening as the farm's highest plus one, behind the Farm lock, and the migration backfills it in the order the Ventures were opened (`created_at`, then `id`). Working it out at signing was rejected: a Venture written with an earlier `created_at` than those already open (a fake clock in a test, or a backdated seed) would renumber the later ones, and the next code could collide with one already given. The Agreement's ordinal is worked out at signing, as the number already on the Venture plus one, behind the same lock. No Agreement is ever deleted.
- **The prefix is `PAY`, not `OF`.** An O on a deposit slip reads as a nought. Codes are spelled `PAY-3-07`. The second number always has at least two digits, so a bank that runs the digits together (`PAY307`) still reads one way.
- **Matching** is `payInCodeIn` in `@OpenFarm/domain`. It ignores case, accepts any separator or none, treats a dropped nought and Bangla digits as the same code, and picks nothing when a reference carries two codes. It matches only the codes of the Venture the sheet is open on.
- **The capital form** lists every Agreement again, with its code. Paid-up or unpapered ones are disabled and say why. The reference comes first, and typing it chooses the Agreement its code belongs to. That happens as the reference is typed, so choosing a different Agreement by hand afterwards sticks. The Investors tab has a Venture-level **Capital in** button again, for money that arrives with only the bank's reference to go on. The one on each row still opens with that Agreement chosen.
- **Where the Owner sees the code:** the toast after signing (20 seconds, with a line saying to give it to the Investor), and under the Investor's name on the Investors tab.
- **The seed's** capital references now carry the Agreement's code (`BEFTN PAY-1-01 TRF-…`). Its payout references changed from `PAY-…` to `OUT-…`, so they no longer look like Pay-in Codes.

## Opened, 2026-09-25

On the seed server, as the Owner: a Venture opened for the check (`জমার কোড যাচাই ভেঞ্চার`, the farm's fourth). The Owner signed আবুল হাশেম মিয়া in the Sign sheet, and the toast said `চুক্তি লেখা হয়েছে। জমার কোড PAY-4-01`, with its line underneath. The row shows `জমার কোড PAY-4-01`. A second Agreement (PAY-4-02) and both papers' photos were added through the RPC console. **Capital in** from over the table: typing `BEFTN pay 4 2 TRF-8812` chose মোঃ শাহজাহান সরকার · PAY-4-02, with the hint `রেফারেন্সের PAY-4-02 মোঃ শাহজাহান সরকার-এর`. ৳১,০০,০০০ was recorded against it with the reference exactly as typed, leaving ৳৫০,০০০. The migration backfilled `OpenFarm` (2 Agreements) and `openfarm_seed` (5) with PAY-1-01… and PAY-2-01…. The screens were drawn after clearing the persisted cache each time. An answer cached before the codes is guarded in the code (no code line, papers listed without codes), but that was **not** seen on a screen.

## Review, 2026-09-25

- The Agreement's trail record now carries its Pay-in Code, so the create event says what code was given.
- The backfill test now also runs the migration's `SET NOT NULL` and unique-index statements after the backfill. That proves the backfilled codes satisfy the index.
- Picking by code on a sheet opened from one row: the hint now says when the reference's code belongs to another paper than the one chosen. That covers the Owner choosing by hand after the code picked, or a code naming a paper that takes nothing. The hint is `ventures.codeNotChosen`. It has been typechecked but **not seen on a screen**: the check tab was signed out by the 3001 dev server's cookie, since cookies on localhost are shared across ports.
- The Investors tab asks one predicate, for its header and its rows, whether a paper may take capital. The header used to ignore what had been paid when drawn from an old cached answer.
- The regexes are built from the one `PREFIX`.
- Left as they were: the Venture-level **Capital in** button (story 80 needs somewhere to type a reference before knowing whose it is); the forgiving matcher (banks do strip dashes and noughts); and `nextPayInCode` reading ids rather than a count (at most twenty rows).
