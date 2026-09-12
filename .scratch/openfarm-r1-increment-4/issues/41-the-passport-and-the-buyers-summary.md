# 41 — The Animal Passport and the buyer's withdrawal summary

**What to build:** Everything the farm knows about one animal, on paper, for whoever asks: a buyer before they buy, a slaughter vet afterwards. The passport is her whole record — what she is, where she came from, every pen she has stood in including the last thirty days, what she has been treated with and whether anything is still holding her back, her vaccinations and every weight. The withdrawal summary is the sharp question on its own page: has she had anything in the last thirty days, and is she clear today or not.

**Blocked by:** 36, 39

**Status:** ready-for-agent

**Spec:** [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R7 and R8; the report set's own R7 and R8 (the spec's numbered stories for Fattening end at 65; these two documents are named in the report set rather than in a story); [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) (the 30-day look-back and the 6-month disease history).

- [ ] The passport carries her identity and photo, her source, her pen history including the last thirty days' locations, her treatments with their withdrawals, her vaccinations and her weigh-ins
- [ ] The withdrawal summary answers clear or not clear as of today, and lists the treatments of the last thirty days with the prescription behind each
- [ ] Both are produced for an animal who has already been sold, because that is when a buyer or a vet asks
- [ ] Producing either is an Audit Event; the Vet may produce them too, and Barn Staff may not
- [ ] Tests cover a passport for a treated animal, a "not clear" summary, a "clear" one, and a sold animal's passport still being readable
