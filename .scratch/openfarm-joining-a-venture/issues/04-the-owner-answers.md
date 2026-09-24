# 04 — The Owner answers

**What to build:** From a Venture's Requests, the Owner answers each one of two ways:

- **come and sign**, for the Units asked or fewer, capped by the Units still promisable;
- **not this time**, with an optional line to the Investor.

A yes to somebody new shows what signing them would make the Investor count, and never blocks. The Investor sees the answer on their page. They can withdraw after a yes but not change the Units, and they can't ask again after a no.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

**Spec:** [joining spec](../spec.md), user stories 47–62. `CONTEXT.md`: **Request to Join**, **Investor Cap**.

- [ ] "Come and sign" takes Units from one up to the Units asked. It is refused beyond the Venture's Units, less the Units on signed Agreements, less the Units on other yeses still waiting to be signed.
- [ ] The answer form tells the Owner how many Units they can still say yes to.
- [ ] Two yeses racing for the last Units cannot both succeed: tested one after the other, and once concurrently, as the capital race test does.
- [ ] "Not this time" takes an optional line to the Investor.
- [ ] "Come and sign" is refused after the decide-by day. "Not this time" is still allowed.
- [ ] A yes to an Investor not in any running Venture returns what signing them would make the count, counting the other yeses to new people. It warns at and beyond the Cap and never refuses. Signing still refuses at the Cap, as now; the existing test stays green.
- [ ] The Investor is never told the count. A test asserts on the whole portal answer.
- [ ] Each answer is an Audit Event with who gave it and when, and dismisses the `join_requested` Notice.
- [ ] An answered Request cannot have its Units changed. After a yes the Investor can withdraw, which frees those Units for other yeses. After a no they cannot ask again on that Venture.
- [ ] The Investor's page shows "the farm will sign N Units with you" and whom to call, or "not this time" with the Owner's line.
- [ ] The Owner's totals gain Units promised.
- [ ] Each refusal test is proven by switching its guard off.
- [ ] The demo seed adds one answered yes.
- [ ] Somebody opens the Owner's answer form, including the Cap warning, and the Investor's page after each answer before this is called done.

## Checked before starting

- **The Cap count at signing** is in the `sign` handler in `packages/api/src/routers/ventures.ts`. It counts distinct people standing, with `newcomer` and `investor_cap_reached`. Reuse that count rather than writing a second one.
- **The ceiling is read and written in one transaction** that locks the Venture row, or the race test will find the gap.
- **The Investor's portal answers are not persisted,** so no cached answer can show a stale yes. The Owner's screens are persisted: default the new fields.
