# 04 — The Owner answers

**What to build:** From a Venture's Requests, the Owner answers each one of two ways:

- **come and sign**, for the Units asked or fewer, capped by the Units still promisable;
- **not this time**, with an optional line to the Investor.

A yes to somebody new shows what signing them would make the Investor count, and never blocks. The Investor sees the answer on their page. They can withdraw after a yes but not change the Units, and they can't ask again after a no.

**Blocked by:** 02, 03.

**Status:** done on `feat/owner-answers-requests`

**Spec:** [joining spec](../spec.md), user stories 47–62. `CONTEXT.md`: **Request to Join**, **Investor Cap**.

- [x] "Come and sign" takes Units from one up to the Units asked. It is refused beyond the Venture's Units, less the Units on signed Agreements, less the Units on other yeses still waiting to be signed.
- [x] The answer form tells the Owner how many Units they can still say yes to.
- [x] Two yeses racing for the last Units cannot both succeed: tested one after the other, and once concurrently, as the capital race test does.
- [x] "Not this time" takes an optional line to the Investor.
- [x] "Come and sign" is refused after the decide-by day. "Not this time" is still allowed.
- [x] A yes to an Investor not in any running Venture returns what signing them would make the count, counting the other yeses to new people. It warns at and beyond the Cap and never refuses. Signing still refuses at the Cap, as now; the existing test stays green.
- [x] The Investor is never told the count. A test asserts on the whole portal answer.
- [x] Each answer is an Audit Event with who gave it and when, and dismisses the `join_requested` Notice.
- [x] An answered Request cannot have its Units changed. After a yes the Investor can withdraw, which frees those Units for other yeses. After a no they cannot ask again on that Venture.
- [x] The Investor's page shows "the farm will sign N Units with you" and whom to call, or "not this time" with the Owner's line.
- [x] The Owner's totals gain Units promised.
- [x] Each refusal test is proven by switching its guard off.
- [x] The demo seed adds one answered yes.
- [x] Somebody opens the Owner's answer form, including the Cap warning, and the Investor's page after each answer before this is called done. **Opened on 2026-09-25** on the reseeded seed database, in Bangla:
  - **As the Owner, on কোরবানি ২০২৭ ভেঞ্চার:** the totals gained Promised. The yes form said how many were asked and how many can still be promised. At the ordinary Cap of 20, a blue note gave the count after a yes (4). With the Cap lowered to 4, it turned into the amber warning, and the yes was still given. The Cap was then set back to 20, warning from 15. The "not this time" form took a line.
  - **As আবুল হাশেম মিয়া after the yes:** the portfolio and the Venture's page said the farm will sign 4 Units with him, whom to call, and that he can still withdraw. There was no Units box, and no count.
  - **Then:** he withdrew and asked again for 2. The Owner answered "not this time" with a line. His page then said so, showed the line, and offered no form.
  - **What it found:** a Request withdrawn after a yes no longer showed the yes on the Owner's list. It now keeps "এসে সই করুন: N টি ইউনিট" beside the withdrawn badge.
  - **Also noticed:** the page answered from its cache for up to a minute after the Cap was changed through a direct call. That is the app's usual one-minute freshness; changed through the settings screen, every read is refreshed.

## Checked before starting

- **The Cap count at signing** is in the `sign` handler in `packages/api/src/routers/ventures.ts`. It counts distinct people standing, with `newcomer` and `investor_cap_reached`. Reuse that count rather than writing a second one.
- **The ceiling is read and written in one transaction** that locks the Venture row, or the race test will find the gap.
- **The Investor's portal answers are not persisted,** so no cached answer can show a stale yes. The Owner's screens are persisted: default the new fields.

## What was decided while building

- **The answer lives on the Request row:** `answered_units`, `answer_line`, `answered_by` and `answered_at`, migration `20260925065754_the_owners_answer_to_a_request`. The procedure is `ventures.answerRequest`, which takes `{ kind: "come_and_sign", units }` or `{ kind: "not_this_time", line }`.
- **The ceiling is read and written behind the Farm lock** that every act on a Venture takes (`actOnVenture`). The race test goes red when that lock is removed.
- **A new refusal the spec did not list:** `units_beyond_asked`, for a yes of more Units than were asked. Answering a Request already answered is `request_already_answered`, and answering a withdrawn or closed one is `request_not_live`.
- **The Cap preview** is `ifYes: { countAfter, cap, atOrBeyondCap }` on each waiting Request in `ventures.requests`, and it comes back from `answerRequest`. It is null for somebody already standing. It counts the people standing today, this person, and the other new people told to come and sign, across the whole farm. It warns from `countAfter` at the Cap. The farm's `investorWarnAt` is not used here; the ticket asked for "at and beyond the Cap".
- **The Owner's totals gain** `promisedUnits`, `promisedBdt` and `promisableUnits`. The answer form says how many Units can still be promised, and the yes is dim, with the reason, when none are left or the decide-by day has passed.
- **After "not this time"** a new Request on that Venture is refused with `request_already_answered`. The Venture's page shows the answer where the form was.
- **Whom to call** is the farm's name and phone from `portal.me`. With no phone written, it says the farm will call them.
- **The seed** has মোঃ শাহজাহান সরকার asking for 6 Units of কোরবানি ২০২৭ ভেঞ্চার and told to come and sign for 5, beside আবুল হাশেম মিয়া's 4 still waiting.
- **A yes is held to what asking was held to:** the Venture is shown and short of its decide-by day, and the Investor is neither retired nor signed on it already. Refused with `venture_not_shown`, `investor_retired` or `already_signed_on_venture`. "Not this time" is held only to the Venture being Open.
- **A promise stops counting once its Investor has signed,** with the Request picked or without it. Otherwise signing somebody by phone while their yes stands counts their Units twice, and the Owner is told fewer are left than there are. Ticket 07 will mark the Request as signed; this rule does not depend on it.
- **The Cap tests run first in their file,** before any yes, because the preview counts every other yes to somebody new on the farm. They take today's count from the Investors page rather than from the preview, and end by signing at the Cap to show that signing still refuses.
- **The decide-by check is one function in the domain,** `isPastDecideBy`, shared by the server and both Owner screens.
