# Survey of fattening and Returns, 2026-10-06

Three reviewers looked at growth and feeding, Seasons and Returns, and the screens for both. A finding is either **proven** (a temporary test went red and the file was put back) or **traced** (read line by line).

## A. Whose an animal is on the day it changes hands

1. **Proven.** A Farm animal sold to a Venture on the day she arrived is counted twice by the Venture and not at all by the Farm. Ownership changes from the start of the sale's day, so her Intake (`arrivedAt` later that day) reads as the Venture's. Example: bought at ৳80,000, sold to v1 at ৳90,000, sold on at ৳1,10,000. The Farm shows no Season, and v1 shows 2 head, ৳1,70,000 cost and ৳2,20,000 back. The reverse direction double-counts in the Farm's Season. `sellInternally` doesn't check the sale day is on or after her arrival, or after an earlier Internal Sale.
2. **Proven.** A made-good animal that is found, then lost again as the Farm's own, reads as if the made-good money came back. `holding.ts` takes the made-good amount by animal and never asks whose Holding is ending. Two made-good movements pick an arbitrary one (no `orderBy`).
3. **Traced, low.** A Farm → Venture → Farm round trip within one day gives two Holdings with the same edge, and a charge stamped exactly at the start of that day is counted in both.

## B. Weigh-ins

1. **Proven.** A first Weigh-in after Intake is never checked against the Intake weight. A mistyped 400 kg for a 200 kg bull is trusted, and the true readings after it are flagged.
2. **Proven.** Correcting a bad reading never re-checks the readings flagged against it, and resolving the Needs Review doesn't either. The true readings stay out of every gain.
3. **Proven.** The Fattening board shows two rates for the same two readings: `basisFrom` measures clock time, `gainOnRationOf` measures farm days.

## C. Seasons and feeding figures

1. **Proven.** A crossing nobody weighed on the day she crossed can never be priced (`weighedForTheCrossing` reads only that day), so her Season never finishes.
2. **Traced.** The farm's female figure mixes deshi and cross cows, so the "female share" it offers can apply the deshi cut twice.
3. **Traced.** Keep-or-sell's daily keep jumps with whether a monthly Herd Cost falls inside its 28-day window. Also, Cost of Gain reads the farm's gain days, not "between her last two Weigh-ins" as CONTEXT.md says.
4. **Traced, minor.** Assigning a Pen the Ration it's already on resets `assignedAt`.

## D. Screens

1. **Traced, high.** The selling-trip form can't tick an animal already sold, because it lists only standing animals. A trip written up after the sales charges the animals left at home, or can't be recorded at all. It also has no day field.
2. **Traced.** Editing a Ration that names a retired feed is always refused, and the refusal doesn't say which feed.
3. **Traced.** The Ready for Sale page shows the server's English rather than the farm's words.
4. **Traced.** Ration amounts over the limit aren't checked before saving, and the server's refusal has no word.
5. **Suspected.** The breakdown table sorts weight bands by their words.
6. **Smaller:**
   - the recent-sales days are hard-coded on the screen;
   - some dialogs refuse quietly with no hint;
   - the farm-gains offer can fill an Expected Gain above 2.5 kg.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/owner-on-the-day | Done (A3, a same-day round trip, left: rare) |
| B     |        |        |
| C     |        |        |
| D     |        |        |
