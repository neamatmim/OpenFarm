# OpenFarm: an Investor may name several Nominees — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-several-nominees/`)

Charted: 2026-09-26

## Destination

A **ready-for-agent spec**, like [Joining a Venture](../openfarm-joining-a-venture/spec.md), under which an Investor names **one or more Nominees** and every paper, screen and record that carries a nominee today carries them all, correctly. The map is done when nothing about several Nominees is left to decide before the spec is written: what a Nominee is, how several of them stand together, which ones a signed Agreement names, and how the Agreement prints them.

## Notes

- **What exists today** (from the code, 2026-09-26):
  - An Investor has exactly **one** nominee, as three free-text columns on `investor`: `nominee_name`, `nominee_phone`, `nominee_relation`. It is kept on the Investor, not on any Agreement, as the glossary's **Nominee** entry says.
  - It is printed or shown in five places: the Investment Agreement's parties part (through `paperInvestor` in `packages/api/src/paper-values.ts`, with the Template's `nomineeLines` under it, one confirmation line and one guardian line for a minor), the যোগদানপত্র (`packages/domain/src/papers.ts`), the **Data Copy**, the portal's account page (`portal-reads.ts`), and the Investor sheet, profile and table.
  - **Nothing acts on a nominee.** OpenFarm records no Investor's death, and no Settlement pays a nominee.
  - **A reprinted Agreement shows today's nominee**, not the one it was signed with: `paperInvestor` reads the `investor` row every time.
  - **The sources disagree about what a nominee is.** CONTEXT.md says the nominee is paid ("to receive their capital and share"). The Agreement's standard nominee line says the farm holds the nominee's details "only to pay the Investor's heirs", which makes them someone who collects for the heirs.
- **Settled while charting (2026-09-26)**, not to be re-asked:
  - **The destination is a spec only.** The build is handed off when the map closes.
  - **What happens when an Investor dies is out of scope** (see below).
  - **The nominee wording goes to the lawyer at the meeting already pending**, alongside [Bring the portal as built to the lawyer](../openfarm-investor-portal/issues/07-bring-the-portal-to-the-lawyer.md) and [Take the structure to a lawyer and a Shariah scholar](../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md), not at a meeting of its own. The standard wording ships as OpenFarm's draft; the Owner publishes it as a new Template Version, and the lawyer's approval is written onto that Version as the **Template** entry says.
- **Domain vocabulary** is in [`CONTEXT.md`](../../CONTEXT.md). Grep it before naming anything. **Nominee**, **Investor**, **Template**, **Investment Agreement**, **Portal Consent** and **Data Copy** are the entries this touches.
- **Skills**:
  - `/grilling` + `/domain-modeling` for grilling tickets.
  - A background research agent for research tickets.
  - `/prototype` for the prototype ticket.
- **Research** findings are written at `docs/research/<name>.md` on a `research/<name>` branch, then merged to main. The ticket links them.
- **Assets** go in `assets/` and are linked from the ticket, never pasted into it.
- **Standing constraints**:
  - Agreements already signed keep printing as they were signed (the **Template** entry: a Version is never rewritten).
  - The portal stays read-only (ADR 0007): an Investor never changes their Nominees there.
  - Don't relax the "no capital without a stamped Agreement" guard.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- **Where else the Nominees show.** The portal's account page, the Data Copy, the যোগদানপত্র, the Investor sheet and table, and the audit words. Probably spec detail once [How several Nominees stand together](./issues/03-how-several-nominees-stand-together.md) is answered, but a Nominee with a share might need more than a list, which could make it a question.
- **Consent for each Nominee's data.** The **Portal Consent** sheet and the Agreement's data clause both name "nominee details". With several Nominees, possibly including minors, the wording may need to change. That depends on 03 and on the prototype.
- **Moving today's single nominee across.** Each existing nominee becomes the first of that Investor's Nominees. If Nominees take shares, that one takes the whole. This may be only a migration line in the spec, unless 04 decides that signed Agreements hold their Nominees as signed, which would mean backfilling past Agreements.

## Out of scope

- **What happens when an Investor dies.** This covers recording the death, holding their share, and a **Settlement** paying the Nominee(s) or the heirs. OpenFarm does none of it today, and several Nominees don't widen that gap. If wanted, it is its own effort. Decided while charting.
