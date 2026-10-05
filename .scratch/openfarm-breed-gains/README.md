# The farm's own gain by Breed

The Owner asked (2026-10-01) whether breed has any effect on gain. Today it has one: a **deshi** Breed is judged
against the farm's deshi share of its Ration's **Expected Gain** (70% unless the Manager says otherwise). Every other
Breed — Holstein, Sahiwal, Jersey, their crosses, Red Sindhi, Brahman, Brahman cross — is judged at the Ration's full
range, which is written for a crossbred bull.

That is on purpose. The research (`docs/research/expected-daily-gain.md` §4) found:

- no Bangladeshi trial feeding dairy crosses and Brahman crosses on one ration;
- no fattening trial of the pure dairy breeds at all;
- the sire alone moving calf gain twofold within one Brahman-cross herd (Tahira 2022).

So a researched figure for each Breed would be a guess. What the farm can have instead is **its own**: what its own
bulls of each Breed put on, as a share of what their Rations should give them, once enough of them have been weighed.

The farm's own gains today (`farmGainsByRation`, merged 0ea77037) are grouped only as cross, deshi, unrecorded and
female — never by Breed. That is the gap this closes.

## The Owner's decisions (2026-10-01, all recommended)

1. **Measured as a share, across Rations.** Each bull's gain over his longest measured stay on a Ration, as a share of
   the middle of that Ration's Expected Gain as written — pooled over every Ration, so a Breed reaches five bulls soon.
   ("Jersey cross bulls: 84% of what their Rations should give.") Not a kg/day figure per Breed per Ration: thirteen
   Breeds by eleven Rations would leave nearly every cell under five.
2. **A Breed's own share replaces the deshi share.** A Breed with no share of its own is judged as today (deshi at the
   farm's deshi share, the rest at the full range). The female share still applies on top, for a cow or heifer.
3. **The Owner and the Manager set it,** as they set the deshi and female shares, on the Breeds page, with the farm's
   own figure beside it and "Use it".
4. **Planned now, built after the real farm's first 30 days of weighings** (go-live, `.scratch/openfarm-go-live/`):
   the figure cannot appear before five bulls of a Breed have a measured stay, which needs those weeks anyway.

## Tickets

| #   | Ticket                                    | Blocked by |
| --- | ----------------------------------------- | ---------- |
| 01  | The farm's own gain share by Breed        | done       |
| 02  | A Breed judged at its own share           | done       |
| 03  | "Use it", the seed, and somebody opens it | done       |

01 and 02 are independent; 03 joins them.

## Rules carried over (not to re-decide)

- A gain is read as the Expected Gain reads it: settled in (21 days after Intake), only since her Pen was put on the
  Ration it is on now, from readings the farm did not doubt, at least the farm's read days apart (`gainOverStayOf`,
  `readingFarEnoughBack`). One rule, not a copy.
- A figure of the farm's own needs `FEWEST_FOR_A_FIGURE` (5) animals; the middle one and the middle half are shown.
- Retire never delete; a standard Breed's share may be set like a farm's own.
- Grep `CONTEXT.md` before naming anything: widen **Breed** and **Expected Gain**, don't add a word unless neither
  holds it.
