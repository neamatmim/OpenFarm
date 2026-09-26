# What a Nominee is in OpenFarm

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: 01

Map: [OpenFarm: an Investor may name several Nominees](../map.md)

## Question

CONTEXT.md's **Nominee** is "the person an Investor names to **receive** their capital and share if they die before the Venture settles". The Agreement's standard nominee line (`packages/domain/src/standard-templates.ts`) says the farm holds the nominee's details "only to **pay the Investor's heirs** under this Agreement". Those are two different people. Decide, in the light of [What a nominee is in Bangladeshi law and in Shariah](./01-what-a-nominee-is-in-bangladeshi-law-and-in-shariah.md):

- **Is a Nominee paid for themselves, or do they collect on the heirs' behalf?** The farm's promise to the family, and what it can defend if an heir disputes a payment, turns on this.
- **What the farm owes a Nominee** beyond holding their name: telling them they were named, reaching them.
- **The glossary entry**, rewritten so CONTEXT.md and the Agreement say the same thing.

Death handling is out of scope. This decides only what the word means, which every later ticket rests on.

## Resolution

Grilled with the Owner, 2026-09-26, on [the research](../../../docs/research/nominees-in-bangladeshi-law-and-shariah.md). No ADR: the law, Shariah and the Agreement already agreed, and only the glossary was out of step.

1. **A Nominee collects for the heirs.** They collect the Investor's capital and share from the Farm and hand it on to the lawful heirs. What they are paid is not theirs. Naming them decides whom the Farm pays, never who inherits. The alternative, a Nominee who keeps the money, would be a bequest: void past one third, and void for an heir without the other heirs' consent. CONTEXT.md's **Nominee** entry is rewritten to say so, and now agrees with the Agreement ("paid through their nominee to their lawful heirs").
2. **The farm owes a Nominee nothing directly while the Investor lives.**
   - The Investor tells their Nominees they are named, and confirms it on the Agreement or the Nomination, as the nominee line does today.
   - The farm never writes to, calls or notifies a Nominee, and a Nominee has no portal access.
   - Their name, phone and relation are held only to find them if the Investor dies.

**Handed on:**
- **The prototype (05):** a line in the Agreement and the Nomination saying the Farm has met its obligation once it pays the Nominee(s), with the heirs settling among themselves with whoever was paid, as under Bank Company Act s.103(4).
- **The lawyer (06):**
  - Does that line hold against heirs who dispute a payment?
  - Should the farm pay above a threshold only against a succession certificate?
- **The Shariah scholar (06):** confirm the *amin* reading, and that naming an heir as a Nominee is unobjectionable.
