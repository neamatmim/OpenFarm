# What Bangladesh's data-protection law asks of a portal showing Investors their own records

Status: done

Type: research

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

The portal puts an Investor's NID, bank account, nominee and money on the internet, behind their password. It masks the NID and bank account to the last four digits. What does Bangladesh's current data-protection law ask of a farm doing that?

- Which law is in force as of September 2026? The Personal Data Protection Ordinance/Act, and anything else that applies.
- Is consent needed, a notice, a stated purpose, a retention period, a named controller?
- Does it say anything about data held on a server outside Bangladesh (the farm's is in Singapore)?
- What must an Investor be able to see, correct or delete?
- Does it treat NID and bank details as sensitive?

The answer feeds what the portal tells an Investor about itself (ticket 06) and what goes to the lawyer (ticket 07). Findings go in `docs/research/bangladesh-data-protection-for-the-portal.md`, with sources.

## Resolution

Resolved 2026-09-25 by research. The findings are in [`docs/research/bangladesh-data-protection-for-the-portal.md`](../../../docs/research/bangladesh-data-protection-for-the-portal.md) (merge fce6d8d).

**The law in force** is the **Personal Data Protection Act 2026** (Act 63 of 2026). It received assent on 10 April 2026, replaced the 2025 Ordinance, and counts as in force from 6 November 2025. Two parts start on a date the government has yet to set, at least 18 months out: the Chief Data Officer duty (s.23) and complaints, fines and compensation (ss.31–35). Neither the regulator (the National Data Management Authority) nor any regulations could be found. **The duties are law; the forms and time limits don't exist yet.**

What it asks of the farm:
- **Consent the farm can prove** (s.5), given after telling the Investor the purpose, how long data is kept, that it goes abroad, and how to withdraw. The fuller notice is in s.15.
- **The Investor's rights:**
  - a full copy of their data on written request (s.11)
  - correction, confirmed within 30 days (s.12)
  - erasure, unless the law requires keeping the data (s.13)
- **Record-keeping and breaches:**
  - security (s.17)
  - a register of processing, kept at least 5 years (s.19)
  - reporting a breach likely to cause significant harm (s.20)
  - reporting any cyber incident to the National CERT (Cyber Security Act 2026 s.9(4)).

What it does not ask:
- **No registration.**
- **No rule that the data stay in Bangladesh.** The Act dropped the Ordinance's copy rule; transfer abroad rests on consent or the contract (s.29(3)).
- **NID numbers and bank details are not "sensitive data".**

**The nominee is a data subject too.** A nominee under 18 needs a parent's consent (s.9).

**What the portal already covers:**
- masking on the server
- one person's own record only, read-only
- corrections through the Owner, with an audit trail
- the farm's contact details shown
- a trail of every paper opened.

**What it lacks:**
- any notice
- any recorded consent
- a written way to ask for a copy, a correction or erasure
- a breach plan
- a step for the nominee.

**Two questions for the lawyer (ticket 07):**
- The National Data Management Act's own fine (s.42, up to Tk 25 lakh) is not postponed.
- It is unsettled whether a Singapore server is a "transfer abroad" under s.29.

**Not confirmed:**
- that the Authority exists
- which date the 18 months count from
- the s.29 classification schedule
- an official English text
- whether the NID Act 2023 was repealed.
