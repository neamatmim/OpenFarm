# 11 — Signing without the stamped photo is a dead end

**What is wrong:** If the Owner signs an Investment Agreement and does not attach the photo of the
stamped paper, that Investor's capital can never be taken — and there is no way out of it anywhere in
the app. She cannot add the photo afterwards, she cannot sign him again, and she cannot undo the
Agreement. The run is stuck on one forgotten photograph.

**Status:** done

**Spec:** `CONTEXT.md` — **Investment Agreement**: "The Farm holds a photo of the stamped instrument with
its stamp value, date and serial, and no capital is taken without it." The rule is right; having no way
back from breaking it is not.

- [x] The Owner can attach the stamped paper to an Agreement that has none, without signing again
- [x] She meets that offer where she meets the problem, not on some other screen
- [x] Capital can be taken immediately afterwards, with no reload and no second visit
- [x] Nothing changes for an Agreement that already has its photo
- [x] Somebody signs without the photo, recovers, and takes the capital, on a screen

## Checked before starting

**Found by signing one without the photo and trying to take the capital**, which is a thing that has now
happened twice on this seed — once by hand on 2026-09-19 and once while opening these screens. Both
times it took a raw call to `ventures.keepAgreementPaper` from the browser console to get out of it.

**Three ways out, all shut:**

- **Add the photo later.** `grep -rn keepAgreementPaper apps/web/src` returns exactly one hit —
  `sign-agreement-sheet.tsx:58`, called inside the sign flow and only `if (paper)`. No other screen
  calls it.
- **Sign him again.** `investment_agreement_uidx` is unique on `(venture_id, investor_id)`
  (`packages/db/src/schema/venture.ts:158`), so one Investor holds at most one Agreement per Venture.
- **Undo it.** There is no procedure that removes or voids an Agreement.

**The server is already willing.** `ventures.keepAgreementPaper` (`routers/ventures.ts:766`) is
Owner-only, takes `{ agreementId, contentType, data }`, and has **no** guard against an Agreement that
already holds a photo — it is an upsert by design. So this is a screen that never got built, not a rule
that needs changing. Do not widen the procedure.

**Where she meets the problem is the take-capital sheet.** `take-capital-sheet.tsx` reads
`ventures.agreements`, which returns `hasPaper` per row, and already writes "ছবি জমা হয়নি" into the
option text with the hint "যে চুক্তির স্ট্যাম্প করা ছবি জমা আছে, কেবল তার টাকাই নেওয়া যায়". So the
sheet already knows, already says so, and offers nothing to do about it. That is the place to fix.

**The photo control has a house pattern**, and the sign sheet was given it on 2026-09-19: the native
input goes `sr-only` behind a styled `<label>` with a Camera icon, a translated word, and a line saying
whether a photo is on. `intake-sections.tsx:62` is the original and carries the reason — "the browser's
own file button speaks the browser's language; this one speaks the farm's". `shrink` from `@/lib/photo`
is what turns a `File` into the `{ contentType, data }` the procedure wants.

**Not a Correction.** Attaching a photograph the farm always meant to hold is not putting a record right
— nothing recorded was wrong, something was missing. `keepAgreementPaper` writes its own Audit Event
already; it does not belong in the Corrections framework.

## What was decided while building

**The offer sits in the take-capital sheet, under the dropdown that refuses her.** She finds out there —
the option is disabled and already says "ছবি জমা হয়নি" — so that is where the way out belongs. A
warning-toned panel lists every Agreement on that Venture with no photo, each with the farm's own camera
button.

**Nothing on the server changed.** `ventures.keepAgreementPaper` was already Owner-only and already an
upsert; only the web app had never called it outside the sign flow.

**The list refreshes itself.** On success it invalidates the Ventures query, so the panel disappears and
the option becomes selectable without a reload — which is the whole point, since the Owner is standing
there with the money to enter.

**Seen all the way through.** Signed an Agreement with no photo, opened take-capital, put a real JPEG
through the control (so `shrink` and the mutation both ran), watched the panel vanish and the option
become enabled, then took ৳৮,০০,০০০ against it — "টাকা জমা লেখা হয়েছে", and the Venture reads
৳৮,০০,০০০ raised on ১৬ ইউনিট. No reload anywhere.

**The sign sheet was fixed on the way past.** It was the one photo control in the app still rendering
the browser's raw `<input type="file">` — the Owner saw "Choose file / No file chosen" in English and
nothing told her whether a photo was on. It now uses the house pattern the intake carries the reason
for: "the browser's own file button speaks the browser's language; this one speaks the farm's." That it
said nothing about whether the photo was attached is very likely how this dead end kept being walked
into.
