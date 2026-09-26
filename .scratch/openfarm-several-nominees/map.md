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

- [Which Nominees a signed Agreement names](./issues/04-which-nominees-a-signed-agreement-names.md) — the Investor's latest **Nomination** governs every Agreement they hold. A Nomination is a short, unstamped paper signed in front of the Owner naming every Nominee in full, and the only way the list changes. An Agreement is one too, and reprints with the Nominees it was signed with; the screen, not the paper, says when a later Nomination replaced them. What exists moves over from the Audit Event trail, with any list not yet signed for marked as such.
- [What a nominee is in Bangladeshi law and in Shariah](./issues/01-what-a-nominee-is-in-bangladeshi-law-and-in-shariah.md) — a collector for the heirs, not an owner, in statute, the one reasoned judgment, and Shariah alike. A private contract can't make them more without it becoming a bequest. The market allows several concurrent nominees, each with a share, with no order, capped at 2–3 by the forms. A minor nominee needs someone named to receive for them.
- [What a Nominee is in OpenFarm](./issues/02-what-a-nominee-is-in-openfarm.md) — a Nominee collects the capital and share for the lawful heirs and keeps nothing: naming them decides whom the Farm pays, never who inherits. The glossary now agrees with the Agreement. The farm owes a Nominee nothing directly while the Investor lives. A line saying payment to the Nominees discharges the Farm goes to the prototype and the lawyer.
- [How several Nominees stand together](./issues/03-how-several-nominees-stand-together.md) — a share each, in whole percentages adding to 100, of the collecting and not the inheritance. None, or up to three. A Nominee who dies first leaves their share to the others in proportion, or to the heirs if none are left. Every Nominee's date of birth is recorded, and a minor collects through a named **Receiver**, who signs the guardian line. Name, relation, phone, date of birth and share; no NID or address.
- [Prototype the Agreement's parties part with several Nominees](./issues/05-prototype-the-agreement-with-several-nominees.md) — a Nominee table under the Investor, and a Receiver line per minor signed by the Receiver. The five rules are printed once in the Terms, in a heirs clause that reads right with none. The Nomination opens «আমি … মনোনীত করছি» and carries the rules in full. গ্রহণকারী for Receiver. [Draft wording](./assets/05-nominee-wording-draft.md); prototype on `prototype/several-nominees`.
- [Add the Nominees to the pending lawyer meeting](./issues/06-add-the-nominees-to-the-pending-lawyer-meeting.md) — pages 7–8 of the lawyer's printable pack, and a Several Nominees section in its checklist. They ask about an unstamped Nomination, discharge against heirs, a succession-certificate threshold, shares as bequests, a minor's Receiver, and the *amin* reading for the Shariah scholar. Both lawyer tickets point at them. The answer arrives there, and the spec doesn't wait for it.

## Not yet specified

Nothing. Every ticket is closed (2026-09-26), and the way to the spec is clear. The two patches left in the fog turned out to be spec detail, and are handed to the spec rather than ticketed:

- **Where the Nominees show:** the portal's account page, the Data Copy, the যোগদানপত্র, the Investor sheet, profile and table, and the audit words. They show the list in force as the Agreement's table does, with the "Nominees since changed" note on screen beside a signed Agreement's print (ticket 04).
- **The consent words:** the Portal Consent sheet and the data clause say "nominee details". Whether they add "dates of birth" and the Receivers is the spec's to settle against [the wording draft](./assets/05-nominee-wording-draft.md). The lawyer sees both.

## Out of scope

- **A signed Agreement reprinting the Investor's other details as they are today** (name, phone, address, NID). This is the same problem the Nominees had, found while deciding [Which Nominees a signed Agreement names](./issues/04-which-nominees-a-signed-agreement-names.md). It concerns every party detail, not only Nominees, so it would be its own small effort.

- **What happens when an Investor dies.** This covers recording the death, holding their share, and a **Settlement** paying the Nominee(s) or the heirs. OpenFarm does none of it today, and several Nominees don't widen that gap. If wanted, it is its own effort. Decided while charting.
