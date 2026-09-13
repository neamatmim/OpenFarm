# 56 — The Inspector View

**What to build:** A DLS inspection should be a rehearsed five minutes. The Manager opens one screen on their phone and shows the inspector the farm's records; the inspector never touches the device. This ticket builds the screen with its first two registers — the Registration (R1) and the herd summary (R2: animals by Side and State, and by Pen, as of today) — each printable as a paper headed by the farm and stamped with who produced it and when, and each print an Export on the trail. The registers in 57–59 join the same screen.

**Blocked by:** 55

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user stories 96, 99 and 100; [DLS registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md) (Inspector view); [Report set](../../openfarm-release-1/assets/report-set.md) — R1, R2 and the rules across the set; `CONTEXT.md` — **Inspector View**, **Export**, **Side**, **State**.

- [ ] One Inspector View screen for the Owner and the Manager, from their own phones, with a section per register
- [ ] R1 shows the Registration record with the certificate photo, and prints as a paper
- [ ] R2 counts the animals on the farm today by Side × State and by Pen, and prints as a paper
- [ ] Every paper is Bangla with English labels, A4, carries the farm name, Registration number, when and by whom; printing one is an Export naming the report
- [ ] Barn Staff and the Vet see none of it; tests cover both registers' figures, the papers' headings, the Exports, and the refusals
