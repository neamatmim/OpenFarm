# Expected gain

The Owner asked (2026-09-29) whether the app says how much an animal _should_ gain — by feed, age, breed. It did
not: it measured Average Daily Gain and compared it only with itself and with one farm-wide target weight.

Research: `docs/research/expected-daily-gain.md` (builds on an earlier, uncommitted file in the abandoned
`../OpenFarm-gain` worktree, `docs/research/expected-gain.md`, which the Owner chose not to continue as a design).

## Steps, in order — all merged 2026-09-29

1. **Expected Gain on each Ration** — a low–high kg/day beside its Weight Band, set in the Ration editor; the
   standard fattening Rations come with researched figures. The Fattening page lists bulls gaining under their
   Pen's Ration's Expected Gain, and the board marks them. Decisions (Owner, 2026-09-29, all recommended):
   - judged over the last 4 weeks (a Farm Parameter, 28 days), never counting the first 3 weeks after arrival,
     nor the time before she came onto her Pen's Ration;
   - Owner and Manager see it (feed and health, not money);
   - a list on the Fattening page + a mark on the board row; no Notice;
   - after merge, fill the standard figures into the Owner's own grower (150–250) and finisher (250+) Rations,
     through the API as Admin.
     Merged 750c5494.
2. **Breed type and sex adjust the range** — using the farm's breed list. Merged 9e1ac2da: a Breed is deshi or not;
   deshi 70% and female 80% are the Manager's Farm Parameters; an unrecorded breed is judged as a cross.
3. **Suggested target weight at Intake** — intake weight + expected gain × days to the Target Window; the same
   figures prefill a Venture Plan's band gains. Merged 30413fca: the low end is saved when the box is empty.
4. **The farm's own gains** — after a Season, the farm's own gain by breed type × band beside the published one.
   Merged 0ea77037: by Ration and kind, from five animals, offered in the editor and beside the shares.
5. **Reference page** — an in-app page listing the standard sources the figures come from, for the Owner.
   `/standards`, "Standards and sources", Owner/Manager/Vet, linked from the Ration editor.
