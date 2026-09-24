# What Bangladesh's data-protection law asks of the investor portal

**Question:** The investor portal puts an Investor's NID number, bank account, nominee and money on the internet, behind their own password, with the NID and bank account masked to the last four digits. The server is in Singapore, and the Investors are at most twenty people, all resident in Bangladesh. What does Bangladesh's data-protection law in force in September 2026 ask of a farm doing that? The ticket covers consent, notice, purpose, retention, the controller's duties, servers abroad, the Investor's rights, sensitive data and breaches.

**Researched:** 25 September 2026. Primary sources are the Acts and Ordinances on bdlaws.minlaw.gov.bd, read in the Bengali original because no Authentic English Text of the 2026 Acts was found, and the Act's gazette as published by the ICT Division. The English renderings of Bengali sections are mine. News and law-firm summaries are used only where marked **[SECONDARY]**. **This is research, not legal advice.** Where the answer turns on regulations that do not yet exist, or on a reading of the text, it says so.

---

## Summary

**The law in force.** The **Personal Data Protection Act 2026** (ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬; Act 63 of 2026) was passed by Parliament and received assent on 10 April 2026. It repeals the Personal Data Protection Ordinance 2025 and its February 2026 amendment. It is **deemed in force from 6 November 2025**, apart from two parts: the Chief Data Officer duty (s.23) and complaints, fines and compensation (ss.31–35). Those two start on a date the government sets by notification, and not before 18 months have passed. Its regulator is the National Data Management Authority, set up under the National Data Management Act 2026 (Act 80 of 2026). **No gazette notice constituting that Authority, and no regulations or procedures under either Act, could be found.** So the duties are law today, but the forms, time limits, retention periods and lists they point to have not been made.

**What the portal must do.** The Act binds anyone in Bangladesh who holds personal data about people in Bangladesh (s.1(2)). An NID number, a mobile number and a bank account are all personal data by definition (s.2(17)). The farm is the data-fiduciary (controller) for its Investors and for their nominees. For a portal like this, the Act asks for six things:

1. **Tell each Investor, before relying on their consent,** what the data is for, how long it is kept, where it goes (a server in Singapore is a transfer abroad), and how to withdraw consent (s.5(2)). The fuller notice in s.15(2) adds what is held and how it was collected, how to exercise their rights, how to complain to the Authority, and who the farm is and how to reach it.
2. **Get consent the farm can prove** (s.5(4)). The alternative ground, performing the Investor's contract (s.5(3)(ক)), probably covers holding the data for the Agreement and for payouts. It is less clearly a ground for putting the data online, or for keeping it in Singapore.
3. **Answer written requests** for a copy of their data, with purpose, recipients, retention, source and cross-border safeguards (s.11). Correct wrong data, and tell them within 30 days that it was corrected (s.12). Erase it when its purpose ends or consent is withdrawn, unless a legal duty requires keeping it (s.13).
4. **Keep it secure** with technical and organisational measures, which the Act says include pseudonymisation and encryption (s.17), and have a data-protection plan (s.22).
5. **Keep it no longer than the period regulations will set** (s.18). Keep a register of processing records for at least five years (s.19).
6. **Report a breach likely to cause significant harm to the Authority** (s.20). Under the Cyber Security Act 2026, also report any "cyber incident" to the National CERT without delay (s.9(4)).

No registration is needed. No rule in force says the data must stay in Bangladesh. **NID numbers and bank details are not "sensitive personal data"** under the Act's list (s.2(21)).

**What the portal already does.** The server narrows every answer to the signed-in Investor's own record before anything is assembled (ADR 0007). The NID and bank account are masked on the server, so full numbers never reach the browser (`packages/api/src/routers/portal.ts`, `maskedDigits`). The portal is read-only. Corrections go through the Owner, and an Audit Event keeps what changed (CONTEXT.md, Investor). The portal shows the farm's name, phone and address. Every paper an Investor opens is an Export in the trail. Access is by invitation only, can be taken away, and ends when the farm switches the portal off. Investor records are retired, never deleted, and kept twelve years (`packages/db/src/schema/venture.ts`).

**What it does not yet do.** It gives the Investor no notice of purpose, retention, the Singapore server or their rights. It records no consent. It has no written route for a request to see, correct or erase data, and no breach plan. It has no step for the nominee, who is a data subject too and is often a child.

**What is uncertain:**

- Whether the Authority exists yet.
- When fines start. The Act's fines are deferred, but the National Data Management Act's own complaint-and-fine section (s.42, up to Tk 25 lakh) is not.
- Whether keeping data on a Singapore server counts as a "transfer" under s.29, and on which ground.
- The classification schedule s.29 refers to. It was not found on bdlaws.
- Whether the NID Act 2023 was ever repealed. News says it was; bdlaws does not show it.
- Every figure left to regulations: the time limits, the retention period and the list of approved countries.

---

## Summary table

| #   | Question                        | Short answer                                                                                                                                                                                                                                                                                         | Source                                                       | Confidence                                  |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| 1   | Which law is in force?          | Personal Data Protection Act 2026 (Act 63 of 2026), assent 10 Apr 2026, deemed in force from 6 Nov 2025 except s.23 and ss.31–35. The Ordinance 2025 and its 2026 amendment are repealed.                                                                                                            | PDPA 2026 ss.1(3), 44; gazette 10 Apr 2026                   | High                                        |
| 2   | Is the regulator working?       | The Authority is the National Data Management Authority (NDMA 2026 s.8). It is constituted by gazette notice (s.9). **No such notice was found, and no regulations or procedures.**                                                                                                                  | NDMA 2026 ss.8, 9; PDPA 2026 ss.27, 41, 42                   | Medium (absence)                            |
| 3   | Consent, notice, purpose        | Consent must be free, specific, clear and withdrawable, and informed of purpose, retention, transfer and how to withdraw. The farm carries the burden of proof. A contract with the data subject is a ground without consent. No disclosure outside the purpose without consent.                     | PDPA ss.2(20), 5, 6, 15, 16                                  | High on the text                            |
| 4   | Retention                       | No longer than the period regulations set (**none set yet**). A register of processing records for at least 5 years. Erasure may be refused while a legal duty requires keeping the data.                                                                                                            | PDPA ss.18, 19, 13(3)                                        | High on the text; the period is unknown     |
| 5   | Controller duties, registration | **No registration.** Accountability, transparency, security, a data-protection plan and records. A Chief Data Officer and audits only for "significant" fiduciaries named by regulation.                                                                                                             | PDPA ss.15, 17, 19, 21, 22, 23                               | High                                        |
| 6   | Server outside Bangladesh       | **Allowed.** Transfer abroad with consent, or under a contract with the data subject. Only to places with suitable technology as regulations prescribe (none prescribed). Bulk transfer of NID numbers must be notified. The Ordinance's cloud copy-in-Bangladesh rule was **dropped** from the Act. | PDPA s.29(3),(4),(6); Ordinance s.29(7) as amended           | Medium: "transfer" and "bulk" undefined     |
| 7   | Data subject's rights           | Access and a copy (with purpose, recipients, retention, source, transfer safeguards and a list of who it was shared with). Correction, with notice within 30 days. Withdrawal of consent. Erasure, with exceptions. The rights cannot be waived by contract or notice.                               | PDPA ss.10–14                                                | High on the text; time limits by regulation |
| 8   | Sensitive data                  | Genetic, biometric, ethnic, political or religious belief, trade-union, health, sexual orientation, criminal and live location data. **NID and bank details are not on the list.** NID numbers count as "sensitive personally identifiable data" only for bulk cross-border transfer.                | PDPA ss.2(1), 2(17), 2(21), 7, 29(6)                         | High                                        |
| 9   | Breach notification             | To the Authority, if significant harm is likely, in the form and time regulations set (none set). The Act puts no duty to tell the data subject. Any "cyber incident" goes to the National CERT without delay.                                                                                       | PDPA s.20; Cyber Security Act 2026 s.9(4)                    | High on the text                            |
| 10  | Penalties                       | PDPA: administrative fines up to Tk 25 lakh, deferred. NDMA: complaint and fines up to Tk 25 lakh, **not deferred** but amounts left to rules. **No criminal offences in the PDPA**: the Ordinance's offences were dropped.                                                                          | PDPA ss.1(3), 32–35; NDMA ss.1(2), 41–42; Ordinance ss.36–48 | Medium                                      |
| 11  | NID law                         | The EC runs NID under the NID Act 2010 (on bdlaws, unrepealed). The 2023 Act was never commenced. News says it was repealed in January 2025 **[SECONDARY]**, but bdlaws shows no repeal. Its offences are about the EC's database and about holding another citizen's NID _card_.                    | NID Act 2010 ss.2(4), 13, 16A, 19; NID Act 2023 s.1(2)       | Medium                                      |
| 12  | Bank data                       | "Financial data" is personal data, not sensitive data. No rule found that stops a non-bank holding a person's account number with their knowledge. Bank secrecy and record rules bind banks.                                                                                                         | PDPA ss.2(1), 2(17)                                          | Medium (absence)                            |

---

## 1. Which laws are in force

| Instrument                                                                             | Status on 25 Sep 2026                                                                                                                                  | Source                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal Data Protection Ordinance 2025 (Ordinance 61 of 2025), 6 Nov 2025             | **Repealed** by PDPA 2026 s.44                                                                                                                         | [bdlaws act-1574](http://bdlaws.minlaw.gov.bd/act-1574.html)                                                                                                                                                                            |
| Personal Data Protection (Amendment) Ordinance 2026 (Ordinance 23 of 2026), 5 Feb 2026 | **Repealed** by PDPA 2026 s.44                                                                                                                         | [bdlaws act-1616](http://bdlaws.minlaw.gov.bd/act-1616.html)                                                                                                                                                                            |
| **Personal Data Protection Act 2026 (Act 63 of 2026)**, 10 Apr 2026                    | **In force**, deemed from 6 Nov 2025, except s.23 and ss.31–35                                                                                         | [bdlaws act-1692](http://bdlaws.minlaw.gov.bd/act-details-1692.html); [gazette PDF](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-ictd/2026/3/1c355c6a-cc9c-42a0-b07f-e0876b89dc9d.pdf) |
| National Data Management Ordinance 2025 (Ordinance 60 of 2025)                         | **Repealed** by NDMA 2026 s.49                                                                                                                         | [NDMA 2026 s.49](http://bdlaws.minlaw.gov.bd/act-1709/section-57940.html)                                                                                                                                                               |
| **National Data Management Act 2026 (Act 80 of 2026)**, 10 Apr 2026                    | **In force**, deemed from 6 Nov 2025, with no deferred parts                                                                                           | [bdlaws act-1709](http://bdlaws.minlaw.gov.bd/act-details-1709.html)                                                                                                                                                                    |
| Cyber Security Ordinance 2025 (Ordinance 25 of 2025)                                   | **Repealed** by the Cyber Security Act 2026                                                                                                            | [bdlaws act-1710](http://bdlaws.minlaw.gov.bd/act-details-1710.html)                                                                                                                                                                    |
| **Cyber Security Act 2026 (Act 81 of 2026)**, 10 Apr 2026                              | **In force**, deemed from 21 May 2025. An amendment Act passed on 30 June 2026 **[SECONDARY]**                                                         | [bdlaws act-1710](http://bdlaws.minlaw.gov.bd/act-details-1710.html); [Dhaka Tribune](https://www.dhakatribune.com/bangladesh/parliament/414016/cyber-security-amendment-bill-2026-passes-in)                                           |
| Digital Security Act 2018 and Cyber Security Act 2023                                  | Repealed earlier: the 2023 Act replaced the DSA, and the 2025 Ordinance replaced the 2023 Act                                                          | [CSA 2026 s.50](http://bdlaws.minlaw.gov.bd/act-1710/section-57990.html)                                                                                                                                                                |
| National Identity Registration Act 2010                                                | Shown on bdlaws as in force, unrepealed. The EC runs NID.                                                                                              | [bdlaws act-1030](http://bdlaws.minlaw.gov.bd/act-details-1030.html)                                                                                                                                                                    |
| National Identity Registration Act 2023 (Act 40 of 2023)                               | On bdlaws with no repeal note. Comes into force only by gazette notice (s.1(2)), which was never issued. Reported repealed 16 Jan 2025 **[SECONDARY]** | [bdlaws act-1458](http://bdlaws.minlaw.gov.bd/act-details-1458.html); [Dhaka Tribune](https://www.dhakatribune.com/bangladesh/government-affairs/370996/national-identity-registration-act-of-2023)                                     |

**Commencement of the PDPA, exactly.** Section 1(3), in my rendering: "Except section 23 and sections 31 to 35, this Act shall be deemed to have come into force on 6 November 2025. Those sections shall come into force on a date the Government fixes by gazette notification after 18 months have passed from the Act's issuance." ([s.1](http://bdlaws.minlaw.gov.bd/act-1692/section-57267.html)).

It is unclear whether the 18 months run from the Ordinance (6 Nov 2025, giving May 2027) or from the Act (10 Apr 2026, giving October 2027). Either way, a notification is still needed. The gazette carrying the Act is the Bangladesh Gazette Extraordinary of Friday 10 April 2026, "passed by Parliament, assent received 27 Chaitra 1432 / 10 April 2026" ([gazette PDF](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-ictd/2026/3/1c355c6a-cc9c-42a0-b07f-e0876b89dc9d.pdf), p.1). The ICT Division lists it as published on 15 April 2026 ([ICT Division](https://ictd.gov.bd/pages/laws/%E0%A6%AC%E0%A7%8D%E0%A6%AF%E0%A6%95%E0%A7%8D%E0%A6%A4%E0%A6%BF%E0%A6%97%E0%A6%A4-%E0%A6%89%E0%A6%AA%E0%A6%BE%E0%A6%A4%E0%A7%8D%E0%A6%A4-%E0%A6%B8%E0%A7%81%E0%A6%B0%E0%A6%95%E0%A7%8D%E0%A6%B7%E0%A6%BE-%E0%A6%86%E0%A6%87%E0%A6%A8-%E0%A7%A8%E0%A7%A6%E0%A7%A8%E0%A7%AC-70is1t-69df5ba2210b1799cc640412)).

**What changed from the Ordinance to the Act.** I compared the two texts on bdlaws. The Act dropped three things:

- **The whole chapter of criminal offences.** The Ordinance's ss.36–46 carried up to 7 years' prison for processing sensitive data without consent, and up to 5 years for misuse or disclosure by staff.
- **The cloud rule in s.29(7).** It required a data dictionary for the Authority, a synchronised real-time copy in Bangladesh of "restricted" data held in a cloud, and the Authority's power to order a cloud moved within 60 days.
- **Section 48's criminal liability of company officers,** which became administrative fines in s.36.

These points are from reading [act-print-1574](http://bdlaws.minlaw.gov.bd/act-print-1574.html) beside [act-print-1692](http://bdlaws.minlaw.gov.bd/act-print-1692.html). No secondary source was found that sets out these changes with a citation.

**Rules and the regulator.** Almost every operational detail is left to "regulations" (প্রবিধান) made by the Authority, or "rules" (বিধি) made by the government:

- the consent form (s.5(1));
- the request procedure and time limits (ss.10(2), 11(6), 12(5));
- the notice form (s.15(3));
- the retention period (s.18(1));
- the breach form and deadline (s.20(1));
- the approved countries for transfer (s.29(4)).

Both must be published as drafts for public comment before they are made (ss.41(2), 42(2)). **No draft or final regulation, rule or standard operating procedure under the PDPA or NDMA was found** on bdlaws or the ICT Division site, or in searches in English and Bangla. **No gazette notice constituting the National Data Management Authority** under NDMA s.9 was found either. A May 2026 overview says the law is "on the books but not yet fully in force" **[SECONDARY]** ([anuragverma.co](https://anuragverma.co/worldwatch/bangladesh/data-privacy)). Absence is not proof. Treat this as "could not confirm".

---

## 2. Does the Act reach this farm, and whose data is it?

- **Scope, s.1(2)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57267.html)): the Act applies to any person, data-fiduciary or processor who is a citizen of Bangladesh, resident in it, or working in it. It also applies to anyone processing personal data inside Bangladesh, or abroad in connection with goods or services to data subjects in Bangladesh. The farm and its Owner are in Bangladesh, so the Act applies wherever the server is.
- **Personal data, s.2(17)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57268.html)): information about a person, "such as name, parents' names, **identification number, mobile number, financial data identifying the person**, location data or a similar online identifier".
- **Financial data, s.2(1):** information that identifies whoever opens an account for financial transactions, or a card or instrument for them, or their transaction history, or their relationship with a financial institution. A bank account number is financial data.
- **Data-fiduciary, s.2(2):** a person who, alone or jointly, processes personal data for a specific purpose, or supervises or authorises its processing. That is the farm. **Processor, s.2(11):** processes on the fiduciary's behalf. That is the Singapore host.
- **Data subject, s.2(3):** a natural person "whether living or dead". An Investor's record stays protected after death. **The nominee is a data subject too:** the farm holds their name, phone and relation, given by the Investor rather than by the nominee.
- **Child, s.2(19):** under 18. Personal data of a child is processed with the consent of a parent or legal guardian, in the manner regulations set (s.9) ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57275.html)). A nominee who is the Investor's child falls here.
- **Processing, s.2(10):** includes collecting, recording, storing, retaining, transferring, using and disclosing by transmission. Showing a record on a portal and storing it on a server are both processing.

---

## 3. Consent, notice and purpose

- **s.5(1)–(2), consent** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57271.html)): a fiduciary may process a data subject's personal data with their consent, under the Act and its regulations. "Every consent shall be voluntary, specific, clear and withdrawable, and shall be taken after informing the data subject of the **purpose of processing, the retention period, transfer, and the procedure for withdrawal**." Consent is defined in s.2(20) as "an informed, explicit, specific and freely given clear affirmative indication".
- **s.5(3), processing without consent:** allowed "in accordance with regulations", keeping to benefit, necessity, proportionality and purpose limitation, on these grounds among others:
  - (ক) performing a contract the data subject is a party to;
  - (খ) steps taken at their request before a contract;
  - (গ) establishing or defending a legal right.

  The Investment Agreement is a contract the Investor is party to. Holding their NID, bank account and nominee to perform it and pay them fits (ক). Putting that record on a website is not obviously _necessary_ to perform the Agreement: the farm ran Ventures on paper before. The regulations that are meant to govern s.5(3) do not exist yet. **Consent is the safer ground for the portal. The contract is a fallback for the records themselves. A lawyer should confirm this.**

- **s.5(4):** "The burden of proving that consent was properly given lies on the data-fiduciary." Consent must be recorded in a form the farm can produce.
- **s.6:** further processing is allowed where it is compatible with the original purpose.
- **s.15(2), transparency** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57281.html)): the fiduciary must take reasonable steps to be transparent. When doing anything significant with a data subject's data, it must inform them of:
  - (ক) the categories of personal data collected and how they are collected;
  - (খ) the general purposes;
  - (গ) the categories whose processing may put them at risk of harm;
  - (ঘ) how to exercise their rights, and whom to contact;
  - (ঙ) how to complain to the Authority;
  - (চ) where applicable, transfers to another place;
  - (ছ) the fiduciary's identity and an easy way to contact it;
  - (জ) anything else regulations set.

  The form is left to regulations (s.15(3)).

- **s.16, confidentiality** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57282.html)): personal data may not be disclosed for any purpose other than the one it was collected for without the data subject's consent.
- **s.40, data collected before the Act** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57306.html)): processing that began before commencement may continue while its purpose is unchanged. A changed purpose needs the data subject's prior consent. **Investor records written down for the Agreement, then shown in a portal, arguably count as a changed or added purpose.** That is one more reason to take consent when the portal invitation is handed over.

---

## 4. Sensitive data: NID and bank details are not on the list

- **s.2(21)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57268.html)) lists "sensitive personal data":
  - genetic and biometric data;
  - data about a small ethnic group or community;
  - political, philosophical or religious belief;
  - trade-union membership;
  - health;
  - sexual orientation;
  - criminal offences and proceedings, and offences alleged;
  - real-time location;
  - anything else rules or regulations add.

  **An NID number and a bank account number are not on it.** A photograph of a face is biometric data under s.2(14), so a scanned NID card with its photo would arguably carry biometric data. The portal shows no such scan.

- **s.7** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57273.html)): sensitive data may be processed only on stricter grounds, such as specific consent, a contract the data subject is party to, or a legal duty.
- **s.29(6), bulk transfers only** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57295.html)): "the cross-border transfer of a large volume of sensitive personally identifiable data" must be notified to the Authority. The explanation names "government unique identifiers such as **NID number**, passport number, taxpayer TIN" alongside biometrics, genetic data and criminal records. This is the only place the Act treats NID numbers as sensitive, and only for bulk transfers abroad.
- **s.29(1), classification** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57295.html)): the government "may" classify personal data as public, internal, confidential or restricted, "considering the characteristics in the Schedule". **The Schedule is not shown on bdlaws** for the Act or the Ordinance, and no classification notice was found. The erasure exceptions in s.13(3)(ঘ)–(ঙ) refer to "confidential" and "restricted" data. Until a classification exists they have nothing to act on.
- **[SECONDARY] caution:** one law-firm overview says NID, passport and TIN numbers face "heavy restrictions" on leaving the country ([Securiti](https://securiti.ai/bangladesh-personal-data-protection-act-overview/)). The Act's text does not bear that out. It asks for notification of _bulk_ transfers only.

**What that means here.** Under the Act, the NID and bank account are ordinary personal data. The masking the portal already does is a reasonable security measure under s.17, not a legal classification.

---

## 5. Retention and records

- **s.18(1)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57284.html)): the fiduciary "shall not retain personal data beyond the period prescribed by regulations for the purpose for which it was processed". **No period has been prescribed.** s.2(8) defines retention as keeping data in identifiable form while the original purpose exists or the data is needed for lawful processing.
- **s.18(2):** data may be kept longer for public-interest, scientific, historical or statistical purposes.
- **s.19** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57285.html)): subject to s.18, the fiduciary shall keep "all records relating to personal data processed by it" in a register "for at least 5 years", unless another rule says otherwise. It shall also keep up-to-date records of processing, retention, structuring, erasure, storage, alteration and portability.
- **s.13(3)(গ)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57279.html)): the fiduciary may refuse to erase data "kept to comply with a legal obligation".

**How this fits the farm.** The farm keeps Investor records, Agreements, payouts and statements for twelve years (`packages/db/src/schema/venture.ts`). That period comes from the record-keeping rules in the pooled-investment research: Companies Act s.181(5) books for 12 years if the business is a company, VAT records for 5 years, and income-tax reopening (`docs/research/bangladesh-pooled-investment.md`, row 15). A legal duty to keep the books is a ground for refusing erasure (s.13(3)(গ)) and for keeping data past any purpose-based period (s.18 read with s.2(8)). **Whether twelve years is justified for the NID and bank account themselves, and not just the money records, is a lawyer question.** The Audit Events and the Export trail are most of the s.19 register already.

---

## 6. Controller duties and registration

- **No registration.** Neither Act asks a data-fiduciary to register with the Authority or be licensed. A 2023-era summary also found "no requirements" for registration ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=authority&c=BD), **[SECONDARY]**, outdated: it still describes the Cyber Security Act 2023 as the main law).
- **s.15(1), accountability** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57281.html)): the fiduciary is responsible for complying.
- **s.8, processors** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57274.html)): processing by a processor on the fiduciary's behalf "shall be deemed to be done by the fiduciary", and the fiduciary is liable for it. It must take reasonable steps to make the processor comply. **The Singapore host is the farm's processor. The farm answers for it.**
- **s.17, security** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57283.html)): appropriate technical and organisational measures against accidental or unlawful destruction, loss, misuse, alteration, unauthorised disclosure or access. They are to be weighed by volume, sensitivity, likely harm, scope, retention period and cost. The measures "shall include":
  - pseudonymisation and encryption;
  - confidentiality, integrity, availability and resilience;
  - timely restoration after an incident;
  - periodic risk assessment;
  - regular testing and updating.

  The Authority may set standards by regulation (s.17(4)). None have been set.

- **s.22, data-protection plan** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57288.html)): every fiduciary shall plan technical systems to avoid harm to data subjects, follow the standards regulations set, and process lawfully and transparently.
- **s.21, audit** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57287.html)): only for classes of fiduciary named by regulation, or when the Authority orders one.
- **s.23, Chief Data Officer** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57289.html)): only for "significant data-fiduciaries". s.2(5) says regulations will name them by effect on sovereignty, volume and financial weight of the data, risk to data subjects, and threats to security or order. This section is **not yet in force** (s.1(3)). A farm with twenty Investors is very unlikely to be named, but no list exists.
- **s.29(5):** the government may levy a fee on annual profit that comes from using Bangladeshi citizens' personal data. Nothing has been levied, and it is aimed at data businesses.
- **NDMA 2026:** its duties to connect to the national exchange (NRDEX) fall on organisations in its Schedule and on government bodies (ss.30(6), 32, 33) ([s.30](http://bdlaws.minlaw.gov.bd/act-1709/section-57921.html)). Nothing found puts a private farm under them.

---

## 7. A server outside Bangladesh

**Nothing in force requires the farm's data to be kept in Bangladesh.** The Act allows transfer abroad on conditions.

- **s.29(3)** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57295.html)): personal data classified under s.29(1) "may be transferred abroad, subject to this section" if:
  - (ক) the data subject consents; or
  - (খ) it involves exchanging goods or services under a contract the data subject is party to; or
  - (গ) it concerns the data subject's business, education, travel or migration, with their consent.
- **s.29(4):** lawfully transferable data may go only to places or countries "where suitable technology and equipment for keeping personal data, as prescribed by regulations, exist". **No regulation prescribes them.** Until one does, this condition cannot be checked, and nothing excludes Singapore.
- **s.29(6):** bulk cross-border transfers of NID numbers and similar identifiers must be notified to the Authority. "Large volume" (বিপুল পরিমাণ) is not defined. Twenty Investors' NID numbers are hard to call bulk, but that is a reading, not a rule.
- **s.26(জ), s.43** ([s.26](http://bdlaws.minlaw.gov.bd/act-1692/section-57292.html), [s.43](http://bdlaws.minlaw.gov.bd/act-1692/section-57309.html)): the Authority may order transfers to a foreign recipient stopped or suspended. The government or Authority may issue urgent orders on processing, storage, retention or transfer. **This is the risk to plan for: a future order could require the data to come home.**
- **What was dropped.** Under the Ordinance as amended in February 2026, s.29(7)(খ) required "at least one synchronised real-time copy inside Bangladesh" of cloud-held "restricted" personal data, and of Critical Information Infrastructure data ([act-print-1574](http://bdlaws.minlaw.gov.bd/act-print-1574.html); [act-1616](http://bdlaws.minlaw.gov.bd/act-1616.html)). **The Act has no s.29(7) of that kind:** its s.29(7) only lets the Authority make regulations. The localisation rule is gone.
- **Critical Information Infrastructure:** under the Cyber Security Act 2026, CII is whatever the government declares by gazette (s.15) ([section](http://bdlaws.minlaw.gov.bd/act-1710/section-57956.html)). A farm's server is not CII.
- **Banks' own records:** Bangladesh Bank's prior permission is needed for _banks_ to take records out of the country ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=authority&c=BD), **[SECONDARY]**). It does not reach a farm holding its Investors' account numbers.

**Is a Singapore server a "transfer"?** Storage and transfer are both "processing" (s.2(10)). Neither the Act nor any regulation says whether keeping data on a foreign-hosted server counts as "transfer abroad" in s.29. The Ordinance's s.29(7) treated foreign cloud storage as within the section, which suggests that is the reading. Which ground covers it is also unsettled: (খ) speaks of "goods or services", and an Investment Agreement is neither obviously. **The safe course is to tell the Investor the server is in Singapore and take their consent under (ক).**

---

## 8. What an Investor must be able to see, correct or delete

- **s.10, how rights are used** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57276.html)): by written application to the fiduciary. Acknowledgement, refusal and compliance follow procedures regulations will set. The fiduciary must check the sensitivity and fraud risk before acting, keep a record of what it did for audit, and tell the data subject. **s.10(4):** the rights are "universal, inherent, non-transferable and inviolable, and may not be excluded or varied by contract or notice".
- **s.11, access and portability** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57277.html)): the data subject has access to their data. On request the fiduciary shall provide it "in a concise and intelligible format", with a description of:
  - a summary of the data and what was done with it;
  - the purpose, the kinds of data and the recipients;
  - retention and source;
  - cross-border transfer safeguards;
  - the logic of any automated decision.

  **s.11(4):** the copy must list everybody it was shared with. Frequency limits and time limits are left to regulations (s.11(6)).

- **s.12, correction** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57278.html)): the data subject may ask for inaccurate or misleading data to be corrected, incomplete data completed and stale data updated. A refusal must be explained in writing (s.12(2)). If they are not satisfied, they may ask the fiduciary to mark the data as disputed and inform the Authority (s.12(3)). **Once it is corrected, the fiduciary tells the data subject "and all concerned" within 30 days** (s.12(4)).
- **s.13, withdrawal and erasure** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57279.html)): consent to storage, processing or automated decisions can be withdrawn at any time, in whole or part, by a simple procedure (s.13(1)). On request the fiduciary shall erase all of the data subject's personal data if:
  - its purpose no longer exists;
  - consent is withdrawn;
  - they object;
  - it was processed unlawfully; or
  - erasure is legally required (s.13(2)).

  It may refuse erasure of an identifier used to identify the person while consent continues, of archival data, of data kept for a legal obligation, and of "confidential" or "restricted" data (s.13(3)). Processing done while consent stood stays lawful (s.13(4)). **s.13(6):** the fiduciary must not carry out automated processing, withdrawal or transfer without informing the data subject.

- **s.14, propagation** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57280.html)): an approved correction or erasure is propagated system-wide, including to "mirror, cache, backup, DR, test environment and migration dataset" copies (s.14(6)). The section is built around the Authority coordinating government registries. How it applies to a single farm's backups is unclear, but backups are named.

**Against what the portal does.** The account page already shows the Investor almost all of their record, masked. That covers much of s.11(1) access, but not the full copy with purpose, recipients, retention, source and transfer safeguards that s.11(3) asks for on request. Corrections go through the Owner and the Audit Event keeps the history, which fits s.12 once the 30-day notice and the written-reasons-on-refusal steps are added. There is no route for withdrawal or erasure. Under s.13(3)(গ), withdrawal would mean closing portal access while the money records are kept for their legal period, and the Investor should be told that in advance.

---

## 9. Breach notification

- **PDPA s.20** ([section](http://bdlaws.minlaw.gov.bd/act-1692/section-57286.html)): "If a personal data breach is likely to cause significant harm to the data subject concerned, the data-fiduciary shall inform the Authority of the breach in the form, manner and time prescribed by regulations." The Authority will judge severity by the nature of the breach, the categories and approximate number of people and records, and what the fiduciary did. **No form or deadline has been prescribed. The Act does not require telling the data subject.**

  A "personal data breach" (s.2(18)) includes unauthorised access, unlawful transfer, disclosure or alteration, and accidental loss or destruction.

- **Cyber Security Act 2026 s.9(4), proviso** ([section](http://bdlaws.minlaw.gov.bd/act-1710/section-57950.html)): "Provided that, if a cyber incident occurs in any government, private or autonomous organisation or institution, it shall **without delay** inform the National Computer Emergency Response Team under the Agency." "Cyber incident" is not defined in the Act's definitions. This proviso applies to any private organisation, not only CII.
- **What the farm should plan:** tell the Authority (once it exists) and the National CERT, and tell the Investors themselves. The Act does not demand the last, but a closed circle of twenty people will hear of it anyway, and s.13(6) and s.15 lean that way.

---

## 10. Enforcement

- **PDPA:**
  - complaint to the Authority (s.31);
  - administrative fine up to **Tk 25 lakh** for failing a data subject's right (s.32(1)), or Tk 50 lakh for a significant fiduciary (s.32(2));
  - up to Tk 25 lakh for failing to keep data secure (s.33);
  - compensation on top (s.35).

  **All of ss.31–35 are deferred** by s.1(3) ([s.32](http://bdlaws.minlaw.gov.bd/act-1692/section-57298.html), [s.33](http://bdlaws.minlaw.gov.bd/act-1692/section-57299.html)). Company officers involved in a violation may be fined (s.36). Appeals go to the ICT Act tribunal (s.37).

- **NDMA:** a data subject may complain to the Authority that a fiduciary or processor violated their rights (s.42(1)). A violation of the Act, rules or regulations carries an administrative fine **up to Tk 25 lakh** (s.42(2)), plus compensation (s.44) ([s.41](http://bdlaws.minlaw.gov.bd/act-1709/section-57932.html), [s.42](http://bdlaws.minlaw.gov.bd/act-1709/section-57933.html)). **The NDMA defers none of its sections** (s.1(2)). So a complaint-and-fine route exists on paper today, once the Authority is constituted, even while the PDPA's own fines wait. The scale of fines is left to rules (s.41(2)).
- **No criminal offences in the PDPA.** The Ordinance's prison terms did not survive into the Act (see section 1).
- **Cyber Security Act 2026:** it punishes _intruders_ rather than the farm. Examples are unlawful access, up to 1 year or Tk 10 lakh, and hacking to steal or alter data, up to 5 years or Tk 50 lakh (s.18) ([section](http://bdlaws.minlaw.gov.bd/act-1710/section-57959.html)). Anyone who breaks into the portal commits these offences.

---

## 11. NID data

- **Which NID law.** bdlaws shows the **NID Act 2010** unrepealed, with the Election Commission running registration ([act-1030](http://bdlaws.minlaw.gov.bd/act-details-1030.html)). The **NID Act 2023** would have moved NID to the Home Ministry, but it comes into force only by gazette notice (s.1(2)) ([act-1458](http://bdlaws.minlaw.gov.bd/act-details-1458.html)). News reports say that notice never came, and that the interim government repealed the 2023 Act on 16 January 2025, leaving NID with the EC **[SECONDARY]** ([Dhaka Tribune](https://www.dhakatribune.com/bangladesh/government-affairs/370996/national-identity-registration-act-of-2023)). bdlaws carries no repeal note on the 2023 Act. **Could not confirm the repeal from a primary source.** The two Acts' relevant sections are nearly word for word the same, so the answer does not change.
- **What the NID law restricts:**
  - s.2(4) of the 2010 Act defines its "data" as data collected for NID registration and the voter list, including biometrics. That is the EC's database.
  - s.13 makes it confidential and lets people or institutions apply for access on prescribed terms. That is the route the EC's partner verification service runs on.
  - s.16A punishes unauthorised access to, or unlawful use of, that data: up to 5 years or Tk 50,000.
  - s.17A punishes disclosure by EC staff.

  ([act-print-1030](http://bdlaws.minlaw.gov.bd/act-print-1030.html); same in the 2023 Act ss.14, 21, 22, [s.21](http://bdlaws.minlaw.gov.bd/act-1458/section-52905.html)). **None of this bars a private party from writing down a person's NID number with their consent.** The farm does not use the EC's verification service.

- **Holding another person's card.** s.19 of the 2010 Act (s.24 of the 2023 Act, [section](http://bdlaws.minlaw.gov.bd/act-1458/section-52908.html)) punishes holding or carrying another citizen's NID _card_ "without reasonable cause": up to 1 year or Tk 20,000. The farm should never keep an Investor's card. A photocopy kept for an Agreement is probably a reasonable cause, but that is a reading.
- **Under the PDPA,** an NID number is personal data (s.2(17)), not sensitive data (s.2(21)). The only special rule is the bulk-transfer notice in s.29(6).
- **No EC rule** found governs how a private party stores NID numbers. EC partner rules were not searched in depth, because the farm is not a partner.

---

## 12. Bank and financial data

- The PDPA defines "financial data" (s.2(1)) and counts it as personal data (s.2(17)). It is **not** sensitive data (s.2(21)).
- Bank secrecy, Bangladesh Bank ICT guidelines and banks' record-export rules bind banks and financial institutions. No rule was found that restricts a non-bank from holding a customer's own account number, given with their knowledge, to pay them. Bangladesh Bank circulars were **not** searched exhaustively.
- The Payment and Settlement Systems Act 2024 question, whether a portal is a "platform" taking investment, is a licensing question, not a data one. It stays with the lawyer (ADR 0007; `docs/research/bangladesh-pooled-investment.md` §1).

---

## 13. What this means for the portal

### What the portal must tell an Investor (feeds ticket 06)

A notice in Bangla that meets s.5(2) and s.15(2). It is best handed over on paper with the one-time code, and kept on the account page. It should say:

1. **Who holds the data and how to reach them:** the farm's name, the Owner, phone and address. The account page already shows these.
2. **What is held and where it came from:** name, phone, address, NID number, bank account, nominee, the Agreements, capital, payouts and statements, all given by the Investor or made by the farm.
3. **Why:** to perform the Investment Agreement, pay them, keep the books the law asks for, and, only with their consent, show them their own record online.
4. **Where it is kept:** on a server in Singapore, run for the farm by a hosting company, which is the farm's processor. Also who else sees it: the Owner and farm staff by Role, the bank for payouts, the tax authority if asked.
5. **How long:** twelve years after the Venture settles, because the law asks the farm to keep its books. Portal access ends sooner if they ask or the farm switches it off.
6. **Their rights:** see a copy of everything held; have it corrected, told within 30 days; withdraw consent to the portal at any time; ask for erasure, with what the farm must keep and why. All by writing to the Owner.
7. **How to complain:** to the National Data Management Authority, once it exists.
8. **How it is protected:** the NID and bank account shown masked; access only by the Owner's invitation; nothing can be changed through the portal.

### What the farm must record

- **Consent, in writing,** to three things: showing their record in the portal, keeping it on a server in Singapore, and holding the NID, bank and nominee details. The farm carries the burden of proof (s.5(4)). The joining letter, or a separate sheet signed at the invitation, fits ADR 0007: the Investor does nothing _through_ the portal, and signs on paper as they already do.
- **The nominee:** the Investor confirms the nominee knows the farm holds their name and phone. A parent or guardian consents for a nominee under 18 (s.9).

### What the farm must be able to do

- Answer a written request with a full copy of the Investor's data: purpose, recipients, retention, source, transfer safeguards, and who it was shared with (s.11).
- Correct it and tell them within 30 days, give reasons in writing if it refuses, and mark data as disputed when asked (s.12). The Audit Event already keeps the history.
- Close portal access when consent is withdrawn, and keep the money records for their legal period (s.13(3)(গ)).
- Report a breach: to the Authority when significant harm is likely (s.20), and to the National CERT without delay (CSA s.9(4)). Tell the Investors too.
- Keep a register of processing for at least five years (s.19). The Audit Events and the Export trail are most of it.
- Hold a contract with the Singapore host that binds it to the farm's security and instructions (s.8).

### What the standing notice can keep saying

Nothing in the data law contradicts the portal's standing line: it shows only the Investor's own Agreements, it is not an offer, and it moves no money.

---

## 14. Questions for the lawyer (feeds ticket 07)

1. Is consent under s.5(1) the right ground for the portal, with the contract under s.5(3)(ক) for the records? Or can the farm rely on the contract for both?
2. Does keeping Investor data on a hosted server in Singapore count as a "transfer abroad" under s.29(3)? If it does, is consent under (ক) needed, or does (খ) cover an investment agreement?
3. Is twenty Investors' NID numbers a "large volume" needing notice to the Authority under s.29(6)?
4. Does a legal duty to keep the books for twelve years justify keeping the NID number and bank account for twelve years, or only the money records?
5. When do the Act's ss.31–35 start? Can the Authority fine under NDMA s.42 now? Has the Authority been constituted?
6. Is the NID Act 2023 repealed? Is keeping a photocopy of an Investor's NID card for the Agreement a "reasonable cause" under s.19 (2010) or s.24 (2023)?
7. Is the draft notice and consent wording that ticket 06 produces enough for s.5(2) and s.15(2) until the regulations set a form?

---

## What could not be confirmed

1. **That the National Data Management Authority has been constituted.** NDMA s.9 needs a gazette notice. None was found.
2. **Any regulation, rule or SOP under the PDPA or NDMA,** including the forms, time limits, retention periods and approved countries the Act points to. Searched on bdlaws, the ICT Division site and the web, in English and Bangla.
3. **The date ss.23 and 31–35 start.** It needs a notification, no earlier than 18 months from issue. Whether that counts from November 2025 or April 2026 is not settled.
4. **The Schedule to s.29(1).** Not shown on bdlaws for the Act or the Ordinance. No classification notice was found.
5. **An Authentic English Text** of the PDPA 2026 (s.45). None was found. All English renderings here are mine, and the Bengali text prevails anyway (s.45(2)).
6. **The repeal of the NID Act 2023.** Reported in the press, not shown on bdlaws.
7. **Bangladesh Bank rules on non-banks holding account numbers.** Not searched in depth.
8. **The Cyber Security (Amendment) Act 2026's exact changes.** Only a news report was read. The bdlaws text of the principal Act was read as it stood on 25 September 2026.

## Sources

Primary (Acts, Ordinances, gazette):

- Personal Data Protection Act 2026 (ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬; Act 63 of 2026): http://bdlaws.minlaw.gov.bd/act-details-1692.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1692.html . Sections: s.1 http://bdlaws.minlaw.gov.bd/act-1692/section-57267.html ; s.2 http://bdlaws.minlaw.gov.bd/act-1692/section-57268.html ; s.5 http://bdlaws.minlaw.gov.bd/act-1692/section-57271.html ; s.7 http://bdlaws.minlaw.gov.bd/act-1692/section-57273.html ; s.8 http://bdlaws.minlaw.gov.bd/act-1692/section-57274.html ; s.9 http://bdlaws.minlaw.gov.bd/act-1692/section-57275.html ; s.10 http://bdlaws.minlaw.gov.bd/act-1692/section-57276.html ; s.11 http://bdlaws.minlaw.gov.bd/act-1692/section-57277.html ; s.12 http://bdlaws.minlaw.gov.bd/act-1692/section-57278.html ; s.13 http://bdlaws.minlaw.gov.bd/act-1692/section-57279.html ; s.14 http://bdlaws.minlaw.gov.bd/act-1692/section-57280.html ; s.15 http://bdlaws.minlaw.gov.bd/act-1692/section-57281.html ; s.16 http://bdlaws.minlaw.gov.bd/act-1692/section-57282.html ; s.17 http://bdlaws.minlaw.gov.bd/act-1692/section-57283.html ; s.18 http://bdlaws.minlaw.gov.bd/act-1692/section-57284.html ; s.19 http://bdlaws.minlaw.gov.bd/act-1692/section-57285.html ; s.20 http://bdlaws.minlaw.gov.bd/act-1692/section-57286.html ; s.21 http://bdlaws.minlaw.gov.bd/act-1692/section-57287.html ; s.22 http://bdlaws.minlaw.gov.bd/act-1692/section-57288.html ; s.23 http://bdlaws.minlaw.gov.bd/act-1692/section-57289.html ; s.26 http://bdlaws.minlaw.gov.bd/act-1692/section-57292.html ; s.29 http://bdlaws.minlaw.gov.bd/act-1692/section-57295.html ; s.32 http://bdlaws.minlaw.gov.bd/act-1692/section-57298.html ; s.33 http://bdlaws.minlaw.gov.bd/act-1692/section-57299.html ; s.40 http://bdlaws.minlaw.gov.bd/act-1692/section-57306.html ; s.43 http://bdlaws.minlaw.gov.bd/act-1692/section-57309.html ; s.44 http://bdlaws.minlaw.gov.bd/act-1692/section-57310.html
- Bangladesh Gazette Extraordinary, 10 April 2026, carrying Act 63 of 2026 (ICT Division copy): https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-ictd/2026/3/1c355c6a-cc9c-42a0-b07f-e0876b89dc9d.pdf ; ICT Division listing: https://ictd.gov.bd/pages/laws/%E0%A6%AC%E0%A7%8D%E0%A6%AF%E0%A6%95%E0%A7%8D%E0%A6%A4%E0%A6%BF%E0%A6%97%E0%A6%A4-%E0%A6%89%E0%A6%AA%E0%A6%BE%E0%A6%A4%E0%A7%8D%E0%A6%A4-%E0%A6%B8%E0%A7%81%E0%A6%B0%E0%A6%95%E0%A7%8D%E0%A6%B7%E0%A6%BE-%E0%A6%86%E0%A6%87%E0%A6%A8-%E0%A7%A8%E0%A7%A6%E0%A7%A8%E0%A7%AC-70is1t-69df5ba2210b1799cc640412
- Personal Data Protection Ordinance 2025 (Ordinance 61 of 2025), repealed: http://bdlaws.minlaw.gov.bd/act-1574.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1574.html
- Personal Data Protection (Amendment) Ordinance 2026 (Ordinance 23 of 2026), repealed: http://bdlaws.minlaw.gov.bd/act-1616.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1616.html
- National Data Management Act 2026 (জাতীয় উপাত্ত ব্যবস্থাপনা আইন, ২০২৬; Act 80 of 2026): http://bdlaws.minlaw.gov.bd/act-details-1709.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1709.html . Sections: s.1 http://bdlaws.minlaw.gov.bd/act-1709/section-57892.html ; s.8 http://bdlaws.minlaw.gov.bd/act-1709/section-57899.html ; s.9 http://bdlaws.minlaw.gov.bd/act-1709/section-57900.html ; s.30 http://bdlaws.minlaw.gov.bd/act-1709/section-57921.html ; s.41 http://bdlaws.minlaw.gov.bd/act-1709/section-57932.html ; s.42 http://bdlaws.minlaw.gov.bd/act-1709/section-57933.html ; s.49 http://bdlaws.minlaw.gov.bd/act-1709/section-57940.html
- Cyber Security Act 2026 (সাইবার সুরক্ষা আইন, ২০২৬; Act 81 of 2026): http://bdlaws.minlaw.gov.bd/act-details-1710.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1710.html . Sections: s.1 http://bdlaws.minlaw.gov.bd/act-1710/section-57942.html ; s.9 http://bdlaws.minlaw.gov.bd/act-1710/section-57950.html ; s.15 http://bdlaws.minlaw.gov.bd/act-1710/section-57956.html ; s.18 http://bdlaws.minlaw.gov.bd/act-1710/section-57959.html ; s.50 http://bdlaws.minlaw.gov.bd/act-1710/section-57990.html
- National Identity Registration Act 2010 (Act 3 of 2010): http://bdlaws.minlaw.gov.bd/act-details-1030.html ; print text http://bdlaws.minlaw.gov.bd/act-print-1030.html (ss.2(4), 13, 16A, 17A, 19)
- National Identity Registration Act 2023 (Act 40 of 2023): http://bdlaws.minlaw.gov.bd/act-details-1458.html ; s.21 http://bdlaws.minlaw.gov.bd/act-1458/section-52905.html ; s.24 http://bdlaws.minlaw.gov.bd/act-1458/section-52908.html

In this repository:

- ADR 0007, the read-only portal: `docs/adr/0007-investors-sign-in-to-a-read-only-portal.md`
- Masking on the server: `packages/api/src/routers/portal.ts` (`me`, `maskedDigits`)
- The Investor record and its twelve-year retention: `packages/db/src/schema/venture.ts` (`investor`, `investorAccess`)
- Record-keeping periods: `docs/research/bangladesh-pooled-investment.md`, summary row 15

Secondary (used only where marked):

- Securiti, "An Overview of Bangladesh's Personal Data Protection Act, 2026": https://securiti.ai/bangladesh-personal-data-protection-act-overview/ (overstates the NID transfer rule; see section 4)
- Anurag Verma, "Data protection & privacy law in Bangladesh (2026)", last verified 24 May 2026: https://anuragverma.co/worldwatch/bangladesh/data-privacy (describes the Ordinance, not the Act)
- DLA Piper, Data Protection Laws of the World, Bangladesh authority page: https://www.dlapiperdataprotection.com/index.html?t=authority&c=BD (outdated; used only for banks' record-export rule and the absence of registration)
- Dhaka Tribune, "National Identity Registration Act of 2023 repealed", 16 Jan 2025: https://www.dhakatribune.com/bangladesh/government-affairs/370996/national-identity-registration-act-of-2023
- Dhaka Tribune, "Cyber security amendment bill, 2026 passes in parliament", 30 Jun 2026: https://www.dhakatribune.com/bangladesh/parliament/414016/cyber-security-amendment-bill-2026-passes-in
- The Daily Star, "New data laws in Bangladesh: A critique": https://www.thedailystar.net/law-our-rights/news/new-data-laws-bangladesh-critique-4038266 (on the Authority sitting under the Prime Minister's Office)
- Prothom Alo, "Govt issues gazettes of 2 landmark ordinances on data protection, governance": https://en.prothomalo.com/bangladesh/government/teeopu4dfv
