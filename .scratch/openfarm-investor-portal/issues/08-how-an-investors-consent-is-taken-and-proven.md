# How an Investor's consent is taken and proven

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

The Personal Data Protection Act 2026 asks for consent the farm can **prove** (s.5(4)): to showing an Investor their record in the portal, to keeping it on a server in Singapore, and to holding their NID, bank and nominee details. It also asks that they be told what withdrawing it means: portal access ends, but the money records are kept for their legal period (s.13(3)(গ)). See [What Bangladesh's data-protection law asks of the portal](./01-what-bangladesh-data-protection-law-asks-of-the-portal.md). Decide:

- **How consent is given.**
  - On paper, signed when the Owner hands over the code. The research suggests this, and it keeps ADR 0007's rule that an Investor does nothing through the portal.
  - Or by a step in the portal on first sign-in, which would reopen ADR 0007.
- **What the farm keeps as proof,** and where. A photographed signed sheet? A date on `investor_access`?
- **Whether consent for data the farm already holds is separate from the portal's.** The farm holds every Investor's NID and bank details from signing, whether or not they are ever invited.
- **The nominee:** whether the Investor answers for them, and what happens when the nominee is under 18 (s.9).
- **Withdrawal:** what it does in OpenFarm, which is taking their access away, and what it cannot do.

The answer may add a consent line or form to the Welcome Letter (ticket 04, done), the notice (ticket 06) and the lawyer's questions (ticket 07).

## Resolution

Grilled with the Owner, 2026-09-25. Named **Portal Consent** in [`CONTEXT.md`](../../../CONTEXT.md), and the **Welcome Letter** entry now prints only after it. No ADR: this keeps ADR 0007 as it is rather than changing it.

- **How it is given:** on paper. A Bangla সম্মতিপত্র is signed in front of the Owner when the Welcome Letter is handed over. It names the three things the portal adds:
  - showing their own record online
  - keeping it on a server in Singapore
  - holding their NID, bank and nominee details for it
  
  It also says how to withdraw (the notice's "how to ask") and what withdrawing does. The farm keeps the signed sheet; the Investor keeps the letter and the notice. Nothing is done through the portal. A tick box would prove less and would be the portal's first act.
- **The proof:**
  - The signed sheet is filed on paper with the Investor's Agreements, and not scanned: a scan would put one more NID-bearing record on the server.
  - OpenFarm records on their access: consent signed, the day, the wording's version, and who recorded it. It is an Audit Event.
- **No code before consent.** The invite dialog runs in this order: print the consent sheet → they sign → the Owner marks it signed → only then the code appears and the Welcome Letter prints. An Investor invited before this exists does the same step before their next code.
- **Versioned wording:** the consent sheet and the privacy notice become Templates (`paper_template`), versioned, with the lawyer's approval on the Version, like the Agreement wording.
- **Data held whether or not someone is invited:**
  - The Investment Agreement gets a data clause, as a new Template Version for the lawyer: what is held, why, Singapore with an encrypted backup, 12 years, and that the notice is handed with it.
  - The notice ("আপনার তথ্য") is handed to **every** Investor at signing.
  - The Agreement's signature covers the records (s.5(3)(ক); transfer abroad under s.29(3)). The Portal Consent covers only what the portal adds.
  - The Master Agreement and Venture Schedule get the same clause when they are built.
  - **Investors already signed** before the clause exists, if any: the Owner did not say whether any real ones exist yet. If there are, they get the notice by hand with their next statement, and the lawyer is asked whether that suffices (s.40). If there are none, the clause simply goes in before the first real signing.
- **The nominee:**
  - In the Agreement's data clause, the Investor confirms that their nominee knows the farm holds their name, phone and relationship, and why (paying heirs).
  - For a nominee under 18 (s.9), the Investor signs a line as their parent or guardian, or the guardian countersigns it.
  - OpenFarm records nothing new: no age, no second signature. The signed Agreement is the proof.
- **Withdrawal:**
  - It is a Take away with its reason recorded ("they withdrew their consent"), the day, and how they asked (a letter, or a message from the number on file). Their Portal Consent is marked withdrawn. Other take-aways leave the consent alone.
  - Portal access ends at once and papers go back to paper. Requests to Join are untouched, as the glossary already has it.
  - The Agreements and money records stay: they rest on the contract and the law's 12 years.
  - Coming back needs a new signed sheet; a withdrawn consent never counts.

**Work handed off with the build:**
- the consent step in the invite dialog, with no code before it
- the consent record and its Audit Event
- the withdrawal reason on Take away
- the consent sheet and the notice as Templates
- the Agreement's data clause as a Template Version

**Onto ticket 07 for the lawyer:**
- the consent sheet's wording
- the Agreement's data clause and nominee lines
- whether the contract is enough ground for the records while consent covers the portal
- the s.40 question for any Investors signed before the clause
