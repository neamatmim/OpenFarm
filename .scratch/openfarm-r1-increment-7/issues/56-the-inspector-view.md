# 56 — The Inspector View

**What to build:** A DLS inspection should be a rehearsed five minutes. The Manager opens one screen on their phone and shows the inspector the farm's records; the inspector never touches the device. This ticket builds the screen with its first two registers — the Registration (R1) and the herd summary (R2: animals by Side and State, and by Pen, as of today) — each printable as a paper headed by the farm and stamped with who produced it and when, and each print an Export on the trail. The registers in 57–59 join the same screen.

**Blocked by:** 55

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user stories 96, 99 and 100; [DLS registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md) (Inspector view); [Report set](../../openfarm-release-1/assets/report-set.md) — R1, R2 and the rules across the set; `CONTEXT.md` — **Inspector View**, **Export**, **Side**, **State**.

- [x] One Inspector View screen for the Owner and the Manager, from their own phones, with a section per register
- [x] R1 shows the Registration record with the certificate photo, and prints as a paper
- [x] R2 counts the animals on the farm today by Side × State and by Pen, and prints as a paper
- [x] Every paper is Bangla with English labels, A4, carries the farm name, Registration number, when and by whom; printing one is an Export naming the report
- [x] Barn Staff and the Vet see none of it; tests cover both registers' figures, the papers' headings, the Exports, and the refusals

## What was built

**`inspector.view`** is the Owner's and the Manager's, from their own phones. It returns:
- **the Registration:** number, issuing office, issue and expiry dates, where it stands (valid, ending soon, expired, or no expiry recorded) and the current certificate photograph's id and date;
- **the herd on the farm today:** by Side and State, and by Pen with each State's count.

Animals that have left are filtered out in the query by State, not by the Pen they were last in.

**`inspector.print`** takes `registration` or `herd_summary` and returns the register as a paper:
- headed by the farm's own lines (name, address, phone, Registration number);
- Bangla with English labels, numerals in the producer's language;
- stamped with who produced it and when.

Every print is an Export that keeps what the paper said: the expiry, standing and certificate id, or the herd's total and number of Pens. A farm without its Registration number is refused, as every paper for an outsider is. The export helpers moved to `export-store`, shared with the reports router.

**Papers** (domain): `registrationRecord` (R1) and `herdSummary` (R2). The standing rule is `registrationStanding` in the farm module, and the register names are `INSPECTOR_REGISTERS`.

**The screen** (`/inspector`, on the Owner's and the Manager's navigation):
- the Registration, with the certificate photograph and a warning when it is ending or has run out;
- the herd summary with its date, by Side and State and by Pen;
- a Print button on each.

The printed Registration carries the same certificate photograph the view named, and its Print waits for it. No generated PDF: each paper prints to A4 through the browser, as every other paper does.

**Three tests** in 2043:
- **Registration:** the screen's Registration with this file's certificate; its paper; the Export naming that certificate.
- **Herd summary:** two milking cows and a heifer in one Pen, and a bull in quarantine in another, with a dead bull from that Pen left out; the farm's lines include them; the paper; the Export keeping the herd's total.
- **Refusals:** Barn Staff and the Vet refused both the view and the print; a Shed Phone refused; both registers refused to a farm without its Registration number.

**Mutation-checked, each red:**
- animals that have gone counted;
- a Pen's States miscounted, or a Side-and-State line of one dropped;
- no Registration check, no Export;
- a Shed Phone allowed.

## What the review changed

The Standards and Spec reviews ran in parallel. Changed:

- **Registration test fix:** the tests of ticket 55's Registration failed one full run in three. They expected the farm's newest certificate to be their own, and this file's 2043 certificate is newer. Each file now reads its own certificate by id.
- **Printing the certificate:** the printed Registration shows the certificate the view named, and waits for it. Before, it might print without the photograph, or with the farm's newest instead of the one on screen.
- **The paper printed the Registration number twice;** once, in the farm's own lines.
- **The trail keeps what each print said,** not only that a print happened.
- **Rules into the domain:**
  - where the Registration stands is a domain rule, not a chain in the router;
  - the Sides, live States, register names and a live-State guard come from the domain, replacing a local list and an `as State` assertion;
  - the web maps Sides, States and standings to their words, without `as MessageKey` casts.
- **Animals that have left are filtered out in the query,** not loaded with their Pens and dropped after.
- **The screen shows the herd summary's date,** and the view no longer returns an unused day.
- **Wording:** the Print button and the ending-soon and expired lines reuse the existing words; the glossary's Inspector View says "herd summary" and "papers", not "herd count" and "PDF".
- **Tests:**
  - the Registration's Export, and print refusals for Barn Staff and the Vet;
  - the missing-number refusal for both registers;
  - no longer asserting farm-wide sums that could only agree with themselves.

## Left open

- **Printing refuses the R1 register while the Registration number is missing.** R1 is the register that would show it missing, but it is a paper for an inspector, and every such paper carries the number.
- **A Vet with a full Role does not see the Inspector View.** The ticket says so; the roles matrix gives a Vet health reports, which ticket 57's registers are.
- **`inspector.print` takes no period.** R4–R6 cover a window, so ticket 57 adds one.
