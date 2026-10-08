# Agreeing in the app, in Shariah

**Question:** A **Venture** is a mudarabah with the Owner as mudarib. Does a mudarabah made electronically meet Shariah's requirements, with the offer read in the **Investor Portal** and accepted by entering a one-time SMS code? Does a **Nomination** of who collects on the Investor's death, made the same way, meet them? The parts to answer are:

- offer and acceptance (ijab and qabul) at a distance and in writing, and the "same session" (majlis) condition;
- writing and witnesses (Al-Baqarah 2:282): obligatory or recommended, and whether an electronic record counts as the writing;
- AAOIFI Shari'ah Standards 38 and 13, and the Islamic Fiqh Academy on contracting by modern means;
- what Bangladesh's Islamic banks do for mudarabah accounts opened digitally.

(Ticket: `.scratch/openfarm-sign-in-the-app/issues/03-agreeing-in-the-app-in-shariah.md`. Map: `.scratch/openfarm-sign-in-the-app/map.md`.)

**Researched:** 8 October 2026. This note builds on [What a nominee is in Bangladeshi law and in Shariah](nominees-in-bangladeshi-law-and-shariah.md), which says the Nominee is a collector (amin), not a legatee, and on [How a mudarabah return is stated](stating-a-mudarabah-return.md). It does not repeat them.

Primary sources:

- **AAOIFI:** Shari'ah Standards 13 (Mudarabah), 23 (Agency) and 38 (Online Financial Dealings), read in English from aaoifi.com. AAOIFI says the Arabic text prevails where the two differ, and **the Arabic was not read**.
- **International Islamic Fiqh Academy:** resolutions 52 (3/6) and 230 (1/24), read on iifa-aifi.org.
- **Qur'an:** Sahih International, via api.alquran.cloud.
- **Tafsir:** Ibn Kathir (abridged English) and Mufti Muhammad Shafi's _Ma'arif al-Qur'an_ (English), via api.quran.com. _Ma'arif_ is the Deobandi Hanafi tafsir most read in Bangladesh.
- **Hadith:** via the hadith-api mirror, as in the nominee note.
- **The Majallah** (the Ottoman codification of Hanafi law), in Tyser's English, read on majalla.org.
- **BFIU:** the e-KYC Guidelines of 2019, issued with BFIU Circular 25 of 8 January 2020.
- **Bangladeshi Islamic banks:** their own product pages and app listing.

**What was checked in the code:** `packages/api/src/agreement-offer-store.ts`, for who can withdraw an **Agreement Offer** and when.

**This is research, not a fatwa.** The questions only the Shariah scholar can settle are flagged.

---

## Answer for the ticket

1. **A mudarabah agreed in the app is valid in Shariah in principle.** Three sources say so.
   - **Islamic Fiqh Academy Resolution 52 (3/6)**, Jeddah, 14–20 March 1990: a contract between parties in different places who communicate "through writing", including by "the computer screen", is "completed when the offer is communicated to the offeree and the acceptance is communicated to the offerer".
   - **Resolution 230 (1/24)**, Dubai, 4–6 November 2019, confirms 52 (3/6) "with all its paragraphs". It adds: "This resolution also applies to electronic contracts which are independent of smart contracts."
   - **AAOIFI SS 38** 2/2: "It is permissible in Shari'ah to conclude online contracts". Its 5/1: offer and acceptance "can be in any form that indicates the consent of the two parties".

   The only contracts these sources exclude are **marriage** (two witnesses), **sarf** (currency exchange, hand to hand) and **salam** (the price paid at once) (Res. 52, Fourth). A mudarabah is none of these.

2. **The same-session rule is met.** A contract made "through written communication, by e-mail, or through access to site" is a contract between absent parties (SS 38 4/2). Its session runs "from the moment of communicating the offer to the concerned party up to issuance of acceptance" (4/2/1). The two people do not need to be online together. Until acceptance, the party who made the offer may withdraw it (4/2/1; Majallah art. 184). The exception is an offer that sets a period: it binds for that period (SS 38 4/2/2; Res. 52, Third). The contract is concluded when the acceptance is given, "whether the offering party has come to know that or not" (SS 38 §6).
3. **In OpenFarm's flow, the Owner's Agreement Offer is probably an invitation, and the Investor's agreeing is the offer.** The Owner can withdraw an Agreement Offer "agreed or not, until it is approved" (`withdrawOffer`). SS 38 5/3 says a message is "an announcement or an invitation for contracting rather than an offer" when the sender keeps "the right of withdrawal even if the message is accepted". On that reading:
   - the **Investor's agreeing is the ijab**;
   - the **Owner's approval is the qabul**;
   - the contract is made **at approval**.

   This is coherent and allowed, but it has a consequence the app does not honor today. The Investor, as the one who made the offer, may **take their agreement back until the Owner approves**, and the portal has no way to do that. The other choice is to make the Owner's offer a true offer: no withdrawal once the Investor has agreed, and approval only a check. **Scholar question.**

4. **The SMS code fits SS 38 better than today's single tap.**
   - SS 38 5/4 treats clicking "accept" as acceptance, unless the system asks for a confirmation. If it does, "acceptance does not take place without making such confirmation".
   - SS 38 5/4/1 tells the institution to build in "a step for acceptance confirmation as a precautionary measure against dealers' mistakes".

   Entering the code is that confirmation step, and the Investor's consent is given at that moment. The code also serves to verify identity. SS 38 8/2/2 allows "the electronic signature as a means of verifying the identities of dealers, **provided that such means is adoptable by virtue of the prevailing rules and regulations**". On the signature, then, the Shariah answer **defers to Bangladeshi law**, which is ticket 02's question. The **validity** of the consent does not depend on it, because any form that shows consent will do (5/1).

5. **Writing is recommended, not a condition, and an electronic record counts as writing.**
   - **The verse.** Al-Baqarah 2:282 commands writing "when you contract a debt for a specified term" and says "take witnesses when you conclude a contract". 2:283 then says "if one of you entrusts another, then let him who is entrusted discharge his trust".
   - **Tafsir.** Ibn Kathir reports that several early authorities held the command to write "was necessary before, but was then abrogated" by 2:283. He also reports that witnesses in trade are "only recommended and not obligatory".
   - **Mudarabah capital is not a debt.** Mudarabah is "one of the trust-based contracts" (SS 13 4/4). The capital is an amanah with the mudarib, not a dayn, so the verse reaches a Venture only by analogy, as prudence.
   - **No writing or witness rule in SS 13.** It asks only for the words (4/1) and parties able "to appoint agents and accept agency" (4/2).
   - **The record counts as writing.** Resolution 52 counts the computer screen as writing. SS 23 2/2/2 accepts "words, writing, messaging or gesture", and Majallah art. 173 accepts offer and acceptance "by writing as well as by word of mouth".
   - **Witnesses** are a condition only of marriage (Res. 52, Fourth).
6. **Proving it is another question from making it, and is left to the rules of evidence.** Resolution 52, Fifth, and SS 38 8/2/4 both send forgery and error to "the general rules of (legal) evidence". _Ma'arif al-Qur'an_ (on 2:282) gives the classical Hanafi caution: "simple writing of an agreement is not a conclusive proof in the sight of Islamic Shari'ah" without witnesses. This matters if a Venture dispute goes to its **Arbitrator** and the arbitrator applies Shariah rules of evidence. The trail should therefore hold:
   - the exact paper;
   - its fingerprint;
   - the code sent and the code entered;
   - the time;
   - the Owner's approval.

   Whether the scholar wants a human witness as well is a **scholar question**.

7. **A Nomination raises fewer Shariah questions than the Agreement.**
   - **No session needed.** Resolution 52's preamble excepts "wills, delegated wills, and agency" from the session (majlis) requirement.
   - **Not agency.** A Nominee who collects after death cannot be the Investor's agent, because agency "expires when the principal or the agent dies" (SS 23 7/1/1). Collecting and handing on after death is closer to appointing a trustee or executor (isa'). That is the Investor's own one-sided, revocable act, and it needs no acceptance from the Farm.
   - **Writing is urged, not required.** "It is not permissible for any Muslim who has something to will to stay for two nights without having his last will and testament written" (Bukhari 2738). Al-Ma'idah 5:106 calls for "two just men" as witnesses "at the time of bequest". Neither is said to be a condition of validity in any source read here.
   - **Banks already do it.** Bangladeshi banks take the nominee inside the e-KYC form, sealed with an electronic signature or a PIN (BFIU e-KYC Guidelines 2019).
8. **A minor's Receiver giving consent by SMS: no Shariah bar was found.** Acceptance of an appointment may be by "messaging" (SS 23 2/2/2). The open question is a different one: whether an Investor may name someone to collect for a minor who is not that Investor's ward. That is a guardianship (wilayah) question, and the **scholar's**.
9. **Bangladesh's largest Islamic bank already opens mudarabah accounts in an app, without a branch visit.**
   - Islami Bank Bangladesh's CellFin listing: "Easily open various accounts, such as Mudaraba Savings, Mudaraba Special Savings, Mudaraba Monthly Profit Deposit … all from the convenience of our app – no need to visit a bank branch."
   - IBBL's Mudaraba Savings page lists "Self opening & transactions thru Cellfin".
   - BFIU's e-KYC steps seal the account with a "wet signature … or electronic signature … or digital signature or personal identification number (PIN)".
   - **No published ruling by any Bangladeshi Shariah board on digital onboarding was found**, from a bank's own committee or the Central Shariah Board. The practice exists, but the fatwa behind it was not seen.

---

## Summary table

| Point                           | Rule                                                                                                                                                     | Source                                                         | For OpenFarm                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Contracting online at all       | Permissible; the contract is completed when the acceptance reaches the offeror (Res. 52) or once it is given (SS 38 §6)                                  | IIFA 52 (3/6) First; 230 (1/24) First; SS 38 2/2, §6           | An Agreement agreed in the portal is a valid mudarabah in principle                                                                 |
| Contracts excluded              | Marriage, sarf, salam only                                                                                                                               | IIFA 52, Fourth                                                | A mudarabah is not excluded                                                                                                         |
| Session (majlis)                | Writing between absent parties: from the offer reaching the offeree until acceptance; the offeror may withdraw before acceptance unless a period was set | SS 38 4/2, 4/2/1, 4/2/2; IIFA 52 Third; Majallah 184           | No need to be online together; whoever makes the offer may take it back until acceptance                                            |
| What is an offer                | It must hold all the rights and duties, with no right kept to withdraw after acceptance; otherwise it is an invitation                                   | SS 38 5/2, 5/3                                                 | The Owner keeps withdrawal until approval, so the Investor's agreeing is probably the offer and the Owner's approval the acceptance |
| Form of acceptance              | Any form showing consent; a click is acceptance unless the system asks for a confirmation, which the institution should build in                         | SS 38 5/1, 5/4, 5/4/1; SS 23 2/2/2; Majallah 173, 175          | The SMS code is the confirmation; consent is given when the code is entered                                                         |
| Offer and acceptance must match | The acceptance agrees exactly with the offer                                                                                                             | IIFA 52 preamble; Majallah 177                                 | `paperHash` already ensures that the paper agreed is the paper offered                                                              |
| Electronic signature            | Acceptable to verify identity "provided that such means is adoptable by virtue of the prevailing rules and regulations"                                  | SS 38 8/2/2, App. C                                            | Defers to Bangladeshi law (ticket 02)                                                                                               |
| Identity and capacity           | The institution should verify identity and legal capacity                                                                                                | SS 38 8/2/1; SS 13 4/2                                         | Met by the first meeting (NID checked by the Owner) and the phone it ties to                                                        |
| Writing                         | Commanded for a debt for a term; held recommended, or the command lifted by 2:283; a mudarabah is a trust, not a debt                                    | Qur'an 2:282–283; Ibn Kathir; SS 13 4/4                        | Prudence, not a condition; the kept paper is the writing                                                                            |
| Witnesses                       | Recommended in trade; a condition only of marriage                                                                                                       | 2:282; Ibn Kathir; IIFA 52 Fourth                              | Not required; a scholar may still advise one                                                                                        |
| Proof                           | Forgery and error go to the general rules of evidence; classical Hanafi caution about writing alone                                                      | IIFA 52 Fifth; SS 38 8/2/3–8/2/4; _Ma'arif al-Qur'an_ on 2:282 | Keep a trail strong enough for the Arbitrator                                                                                       |
| Nomination                      | Wills, isa' and agency need no session; agency ends at death; writing a will is urged; witnesses named for bequests                                      | IIFA 52 preamble; SS 23 7/1/1; Bukhari 2738; Qur'an 5:106      | One-sided and revocable; in-app is unobjectionable in principle                                                                     |
| Islamic banks in Bangladesh     | Mudaraba accounts opened in the app, no branch visit; e-KYC sealed by e-signature or PIN, nominee in the form                                            | CellFin listing; IBBL MSA page; BFIU e-KYC Guidelines 2019     | The market already does it; no Shariah board ruling was found                                                                       |

---

## 1. Offer and acceptance at a distance

### 1.1 The Islamic Fiqh Academy

**Resolution 52 (3/6), "Conclusion of Contracts by Modern Means of Communication"**, was adopted at the 6th session, Jeddah, 17–23 Sha'ban 1410h (14–20 March 1990) ([iifa-aifi.org](https://iifa-aifi.org/en/32402.html)).

- **Preamble.** The Academy recalled "the established principles that a contract between two parties requires majlis al-'aqd (attendance of the parties) – **except in wills, delegated wills, and agency** – the compliance of the offer with the acceptance, the absence of any sign indicating the unwillingness of either party, the continuity of the offer and acceptance according to custom".
- **First.** "If the contract is concluded between two parties who are not present in one place, and none of them can see the other physically, can hear his voice, and they are communicating to each other through writing or through an intermediary, which includes telegraph, telex, fax and **the computer screen**, then, the contract shall be deemed to be completed when the offer is communicated to the offeree and the acceptance is communicated to the offerer."
- **Second.** Contracting at the same time from different places "as in the case of telephone and wireless" is a contract "between two present parties".
- **Third.** One who makes an offer "subjects his offer to a specified period, he shall be bound to abide by his offer throughout this period and cannot retract from it."
- **Fourth.** The rules do not cover marriage, "because the presence of two witnesses is a necessary condition for its validity", nor sarf (exchange) or salam.
- **Fifth.** "In relation to the possibility of forgery, distortion or error, reference shall be made to general rules of legal evidence."

**Resolution 230 (1/24), "Smart Contracts: Activation and Reversal Methods"**, was adopted at the 24th session, Dubai, 7–9 Rabi' al-Awwal 1440h (4–6 November 2019) ([iifa-aifi.org](https://iifa-aifi.org/en/33146.html)). Its First reads: "confirmation of the resolution … no. 52 (3/6) … with all its paragraphs, on contracting using modern communication devices. **This resolution also applies to electronic contracts which are independent of smart contracts.**" The Academy put off ruling on blockchain smart contracts, which do not bear on OpenFarm. (The English page dates the 1990 session "1440/1990", a slip for 1410h.)

### 1.2 AAOIFI Shari'ah Standard 38, Online Financial Dealings

SS 38 was issued 17 Rabi' I 1430h (15 March 2009) ([PDF](https://aaoifi.com/wp-content/uploads/2020/08/SS-38-Online-Financial-Dealings.pdf)). The State Bank of Pakistan adopted it for its Islamic banks in 2019 with changes to three clauses ([SBP](https://www.sbp.org.pk/ibd/2019/C1-Annex-A.pdf), not read beyond the listing).

- **2/2** "It is permissible in Shari'ah to conclude online contracts, provided that the contracts thus concluded between the institution and its clients observe the general rules of financial transactions as prescribed by the Shari'ah, regarding for instance, **opening of the accounts**, performing remittances and signing commercial contracts."
- **4/1** Audio or video contracting follows the rules for parties present together.
- **4/2** "When the contract is concluded through written communication, by e-mail, or **through access to site**, it shall become subject to the rulings applicable to contracts signed in the absence of the two parties, because such deal is similar to message contracting."
- **4/2/1** "The contract signing session in the case indicated in item 4/2 above starts from the moment of communicating the offer to the concerned party up to issuance of acceptance. The contract signing session may also be discontinued when the offering party retreats from his offer before an acceptance decision is made by the other party."
- **4/2/2** An offer with a stated period binds the offeror for that period.
- **5/1** "Expression of offer and acceptance in online contracts can be in any form that indicates the consent of the two parties to conclude the contract."
- **5/2** A message "containing all the rights and commitments pertaining to the contract in question without retaining the right of withdrawal if the message is accepted … is considered as an offer."
- **5/3** "When the offering party sends the electronic message through website or e-mail without indicating all the rights and commitments relating to the contract in question, **or when he stipulates a condition that he should have the right of withdrawal even if the message is accepted, the message is considered to be an announcement or an invitation for contracting rather than an offer.** In this case a process of offer and acceptance has to be done."
- **5/4** "When the contract is concluded through website, clicking on the acceptance icon is considered as acceptance in the strict Shari'ah sense if the system in the website does not require confirmation of acceptance. If the system in the website requires confirmation of acceptance in any way, acceptance does not take place without making such confirmation."
- **5/4/1** "The Institution which provides its services on website should include in the system a step for acceptance confirmation as a precautionary measure against dealers' mistakes."
- **§6** "Irrespective of the method of contracting, an online contract is considered to be valid since the time when the other party accepts the offer and whether the offering party has come to know that or not."
- **Appendix B** gives the basis: online contracts "carry no difference from traditional contracts except in that the means used for their conclusion is different". It also says the contract is valid once accepted because "Shari'ah scholars define contract as 'the concordance of two wills'".

### 1.3 The Hanafi codification

Bangladesh's Sunni Muslims are overwhelmingly Hanafi, and the Majallah is the Hanafi law of contract codified (Tyser's English, [majalla.org](https://majalla.org/ilm/the-contract-of-sale/), [majalla.org](https://majalla.org/ilm/agreement-of-acceptance-with-offer/)). It is written for sale, but scholars apply its formation rules generally.

- **Art. 173** "Offer and acceptance may be made by writing as well as by word of mouth."
- **Art. 175** "The fundamental object of offer and acceptance being the mutual agreement of the parties, a sale may also be concluded by any conduct of the parties which is evidence of offer and acceptance."
- **Art. 177** The acceptance "must agree exactly with the offer".
- **Art. 183** Dissent shown after the offer and before acceptance voids the offer.
- **Art. 184** "If one of the two parties … makes an offer, but revokes such offer before the other party has accepted, the offer becomes void".

The Qur'anic ground of all of it is consent: "do not consume one another's wealth unjustly but only [in lawful] business by mutual consent" (An-Nisa 4:29), and "fulfill [all] contracts" (Al-Ma'idah 5:1).

### 1.4 Who offers in OpenFarm's flow

The **Agreement Offer** works like this (`packages/api/src/agreement-offer-store.ts`):

1. The Owner lays out the paper and sends it.
2. The Investor reads it and agrees to that exact paper (`agreeToOffer`, refused unless the `paperHash` sent back is the one kept).
3. The Owner approves (`approveOffer`), and only then is it an Investment Agreement.

The Owner may withdraw it "agreed or not, until it is approved" (`withdrawOffer`). **The Investor has no way to take back an agreement once given.** An **Amendment** offered in the app runs the same way: every Investor on the Venture agrees, then the Owner approves.

Read against SS 38 5/2–5/3, the Owner's sending keeps "the right of withdrawal even if the message is accepted". It is therefore an **invitation to contract**. The Investor's agreeing is the **offer** (ijab), and it holds every right and duty, because it is agreement to the whole paper (5/2). The Owner's approval is the **acceptance** (qabul), and the contract exists from that moment (§6). Three consequences follow.

- **The Investor may withdraw until approval.** The one who offers may revoke before acceptance (SS 38 4/2/1; Majallah 184). The portal gives the Investor no way to do this. Under this reading, an Investor who phones the Owner to say "I take it back" before approval has revoked their offer, and the Owner must not approve.
- **The Investor is bound from approval, whether told or not** (§6). Telling them on approval is courtesy, not a condition, but it is good practice.
- **The other choice** is to make the Owner's send a true offer (5/2). The Owner would give up withdrawal once the Investor has agreed, and the Investor's agreement would conclude the contract. The Owner's later "approval" would then be no more than recording it. This cuts against the existing design, in which approval re-checks the Units left, the **Investor Cap** and the Venture still Open. The first reading fits the code as built.

A scholar may instead read the Owner's approval as an option kept by the Owner (khiyar al-shart). This note did not check how long such an option may run. AAOIFI SS 52, Options to Reconsider, was **not read**. The invitation reading needs no option at all. **Scholar question:** which reading the scholar takes, and whether the Investor must be given a way to withdraw their agreement before approval.

### 1.5 What the mudarabah standard adds

[SS 13](https://aaoifi.com/wp-content/uploads/2020/08/SS-13-Mudarabah.pdf) (issued 16 May 2002) says nothing about writing, signing, witnesses or the medium.

- **4/1** "The Mudarabah contract may be concluded using terms such as Mudarabah, Qirad or Mu'amalah."
- **4/2** "Both parties should possess the legal capacity to appoint agents and accept agency." The Investor's age and identity are checked at the first meeting, which the map keeps. That also meets SS 38 8/2/1, which asks the institution to "verify the identities of its website dealers, and make sure that they are legally competent".
- **4/3** "The general principle is that a Mudarabah contract is not binding". It becomes binding once the mudarib has started work (4/3/1), or for an agreed duration (4/3/2). So any doubt about the moment the contract was made is narrow. Before the capital is put to work, either side may end it anyway, unless the Venture's term is read as an agreed duration.
- **4/4** "A Mudarabah contract is one of the trust-based contracts."

### 1.6 Standard-form terms

SS 38 8/3 treats online standard forms as "adhesion contracts" only for "a commodity or usufruct that nobody can do without" offered under monopoly. A Venture is neither. Under 8/3/3, a standard form whose terms "do not entail any injustice for the adhering party" is "permissible and binding". Nothing further is needed here.

---

## 2. The SMS code: confirmation and signature

- **As confirmation.** SS 38 5/4–5/4/1 recommends a confirmation step and puts the moment of acceptance at the confirmation. A code sent to the Investor's phone and entered against the paper they read is such a step. The Investor's consent, the ijab on the reading in §1.4, is given when the code is entered, not when "agree" is tapped. The trail should record that moment.
- **As signature.** SS 38 Appendix C defines an electronic signature as "data in the form of letters, figures, symbols, signs or any other form, embodied in or attached to or li[n]ked with an information message … [which] allows specification of the distinct identity of the signatory, so that the signature can be verified and the content of the message is approved." A one-time code tied to the Investor's phone and kept with the paper's fingerprint matches each part of that definition. That is this note's reading, not a ruling.
- **SS 38 8/2/2** "It is acceptable in Shari'ah to adopt the electronic signature as a means of verifying the identities of dealers, **provided that such means is adoptable by virtue of the prevailing rules and regulations**." AAOIFI ties the signature to the law of the place. Whether Bangladeshi law accepts an SMS code is ticket 02's question ([agreeing-in-the-app-bangladeshi-law.md](agreeing-in-the-app-bangladeshi-law.md)).
- **SS 38 8/2/3** "When forgery or an error is committed with regard to the personality or characteristics of one of the two parties, the other party has the right to terminate the contract." Appendix B grounds this in consent: "the consent of the two parties is the fundamental prerequisite of contracting." If someone else entered the code, there was no consent.

---

## 3. Writing and witnesses

### 3.1 The verses

- **Al-Baqarah 2:282:** "O you who have believed, when you contract a debt for a specified term, write it down. … And bring to witness two witnesses from among your men. … That is more just in the sight of Allah and stronger as evidence and more likely to prevent doubt between you, except when it is an immediate transaction which you conduct among yourselves. For [then] there is no blame upon you if you do not write it. And take witnesses when you conclude a contract."
- **Al-Baqarah 2:283:** "And if you are on a journey and cannot find a scribe, then a security deposit [should be] taken. And if one of you entrusts another, then let him who is entrusted discharge his trust [faithfully]".

### 3.2 Obligatory or recommended

- **Ibn Kathir** (on 2:282–283, [quran.com API, tafsir 169](https://api.quran.com/api/v4/tafsirs/169/by_ayah/2:282)): "Abu Sa'id, Ash-Sha'bi, Ar-Rabi' bin Anas, Al-Hasan, Ibn Jurayj and Ibn Zayd said that recording such transactions was necessary before, but was then abrogated by Allah's statement" in 2:283. On "take witnesses when you conclude a contract", the command "was abrogated by" 2:283, "Or, it could be that having witnesses in such cases is only recommended and not obligatory". His evidence is the hadith of Khuzaymah bin Thabit: the Prophet bought a horse with no witness present.
- **_Ma'arif al-Qur'an_** ([tafsir 168](https://api.quran.com/api/v4/tafsirs/168/by_ayah/2:282)) stresses the writing of deferred dealings and their due date. It does not say writing is a condition of the contract's validity.
- **Whom the verse addresses.** Its words are "a debt for a specified term". A Venture's capital is not a debt owed by the Owner. It is held on trust (SS 13 4/4), and the Owner owes it back only if he breaches the trust. The verse's purpose ("stronger as evidence and more likely to prevent doubt") still argues for a full written record of a long contract involving money.

**Conclusion.** For a mudarabah, writing is prudence and recommended. It is not a condition, and no source read here makes it one.

### 3.3 An electronic record is writing

- Resolution 52 lists "the computer screen" among the means of "writing".
- SS 38 4/2 classes contracting "through access to site" as "message contracting" (contracting by letter).
- SS 23 2/2/2 (agency): offer and acceptance have "no standard form of wording and may be expressed through utterance of words, writing, messaging or gesture".
- Majallah art. 173: "by writing as well as by word of mouth".

None of these requires ink, a pen-made signature, or paper. In Shariah, the paper laid out in the app and kept with its fingerprint is the writing.

### 3.4 Witnesses

The only contract for which the Academy names witnesses as a **condition** is marriage (Res. 52, Fourth). A mudarabah needs none to be valid. Al-Ma'idah 5:106 names "two just men" as witnesses "when death approaches one of you at the time of bequest". That bears on a Nomination by analogy only (§4).

### 3.5 Proof is separate from validity

- Resolution 52, Fifth: forgery, distortion or error go to "general rules of legal evidence".
- SS 38 8/2/4: "For verification of forgery or error recourse should be to the general rules of evidence."
- _Ma'arif al-Qur'an_ (on 2:282): "the Muslim jurists … have said that simple writing of an agreement is not a conclusive proof in the sight of Islamic Shari'ah. Unless there is an oral evidence of witnesses, as approved by the Shari'ah, on the agreement, no decision could be taken on simple writing."

A Venture names an **Arbitrator**. An arbitrator applying classical Hanafi evidence could ask what, beyond the record, shows that the Investor agreed. The answers available are:

- the record itself: the exact paper, its fingerprint, the code sent to the phone the Owner verified at the first meeting, the code entered, and the time;
- the Owner's approval;
- the Investor's own later conduct, such as paying in capital against it and reading their statements in the portal;
- above all, their **acknowledgment** (iqrar) if asked.

Paying capital is conduct showing consent (Majallah art. 175).

**Scholar question:** is that enough, or should a human witness also confirm an in-app agreement? A witness could be someone at the farm who speaks to the Investor by phone, or someone named by the Investor.

---

## 4. The Nomination and the minor's Receiver

The nominee note settled that a **Nominee** collects as an amin (trustee) for the heirs and is not a legatee. Shariah treats a Nomination agreed in the app much more simply than an Agreement.

- **It needs no session.** The Academy's preamble excepts "wills, delegated wills [isa'], and agency" from the majlis (session) requirement (Res. 52). A Nomination is the Investor's own declaration of whom the Farm is to pay. It is one-sided and revocable at will, and it needs no contemporaneous acceptance from the Owner. The map's design has the Owner write a Nomination and offer it for the Investor to agree to. That arrangement is harmless, because the substance remains the Investor's declaration.
- **It is not agency.** SS 23 7/1/1: agency "expires when the principal or the agent dies or loses legal capacity" ([PDF](https://aaoifi.com/wp-content/uploads/2020/08/SS-23-Agency-and-the-Act-of-an-Uncommissioned-Agent-Fodooli.pdf), issued 30 April 2005). A Nominee acts only after the Investor's death, so the Nominee's authority cannot be the Investor's agency. It is closer to isa', appointing someone to deliver to the heirs, which is the second of the Academy's exceptions. Either way the majlis is not needed.
- **Writing is urged.** "It is not permissible for any Muslim who has something to will to stay for two nights without having his last will and testament written and kept ready with him" ([Bukhari 2738](https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari/2738.json)). A Nomination is not a will. On the collector reading, it gives nothing away. Still, the hadith shows that writing such an instruction is commended, and an in-app record serves that purpose (§3.3).
- **Witnesses.** Al-Ma'idah 5:106 asks for "two just men" at a bequest. No source read here makes them a condition of a bequest's validity, still less of a collector's appointment. **Scholar question**, if the scholar would want one for a Nomination specifically.
- **What banks do.** In BFIU's e-KYC customer form, the nominee is a field of the digital form itself: "Nominee: … Relation: … Photograph". The whole form is sealed in step four by "wet signature … or electronic signatures … or digital signature or personal identification number (PIN)". The form also has an 'add' button for more nominees and fields for a minor nominee's guardian ([BFIU e-KYC Guidelines 2019](https://www.bfiu.org.bd//pdf/circular/aml/jan082020bfiu25.pdf), §§3–4). Ticket 04 covers market practice in detail.

**The minor's Receiver.**

- **Accepting by SMS.** Accepting a role like the Receiver's may be done "through utterance of words, writing, messaging or gesture", and for unpaid agency even silence suffices (SS 23 2/2/2). No Shariah bar to a Receiver accepting by SMS was found.
- **The question left over.** The Receiver collects what a minor Nominee would collect, and hands it on for the heirs. Who may hold and pass on money for a minor is a matter of guardianship (wilayah) over the minor's property. Whether an Investor may name a Receiver who is not the minor's guardian, and whether the Receiver's own consent is needed at all, are questions **this note did not resolve from primary sources**. **Scholar question.**

---

## 5. What Bangladesh's Islamic banks do

- **Islami Bank Bangladesh, CellFin.** The App Store listing, seller "Islami Bank Bangladesh Ltd", says: "Easily open various accounts, such as Mudaraba Savings, Mudaraba Special Savings, Mudaraba Monthly Profit Deposit, Mudaraba Student Savings, Mudaraba Industrial Employee Savings, Payroll, Hajj Savings, and Muhor Savings accounts … all from the convenience of our app – no need to visit a bank branch" ([App Store](https://apps.apple.com/app/id1568289820)). The version history mentions "Improved OTP and transaction handling". The listing does not mention Shariah approval.
- **IBBL's Mudaraba Savings Account page** says the account follows "the Mudaraba principle", which "offers depositors an agreed portion of business profit and assigns risk for any genuine loss". Among its features it lists "Self opening & transactions thru Cellfin". The same page still lists the branch documents, including the nominee's NID and photo ([islamibankbd.com](https://islamibankbd.com/deposit/mudaraba-savings-account-msa)).
- **Al-Arafah Islami Bank.** A sponsored supplement says customers "can now open a fully functional bank account from anywhere" and open "Mudaraba Term Deposits directly from the app" ([TBS, 30 November 2025](https://www.tbsnews.net/supplement/al-arafah-islami-bank-unlocks-new-era-shariah-guided-mobile-banking-1298151)) **[SECONDARY]**.
- **Nagad Islamic.** The mobile wallet's Shariah Supervisory Committee chairman said "all the services of this platform are recognized by the Shariah Board" ([Dhaka Tribune, 25 April 2022](https://www.dhakatribune.com/amp/business/268954/discussion-on-digital-transactions-in-islamic)) **[SECONDARY]**. This concerns an MFS wallet, not a mudarabah contract.
- **The regulator's e-KYC (2019, issued 8 January 2020).** It covers onboarding "by filling up a digital form, taking photograph on the spot, and authenticat[ing] the customer's identification data … instantaneously". Simplified onboarding is for low-risk products. The customer's signature in step four may be a "wet signature … electronic signatures … or digital signature or personal identification number (PIN)". Physical signatures may be collected "at the later stage" where needed. A newer Bangladesh Bank e-KYC guideline of March 2026 (BRPD) exists ([bb.org.bd](https://www.bb.org.bd/aboutus/regulationguideline/brpd/ekyc2026.pdf)). **It was not read**, because bb.org.bd refused automated access.
- **Shariah sign-off.** The mudarabah-return note found that Bangladesh Bank's IBRPD Circular 01 (28 September 2025) has a bank's Shariah committee certify a product's words and method ([stating-a-mudarabah-return.md](stating-a-mudarabah-return.md) §2.3). On that basis, IBBL's Shariah Supervisory Committee should have passed CellFin's mudarabah onboarding. **No such ruling was found published.** Nor was one found from the Central Shariah Board for Islamic Banks of Bangladesh. The banks' practice shows what the industry relies on, not a reasoned fatwa.

---

## 6. What this means for OpenFarm

### Constraints the spec should respect

1. **Show the whole paper before consent.** A valid offer holds "all the rights and commitments" (SS 38 5/2). The Agreement Offer already shows the full paper and binds the agreement to it by `paperHash`, which also ensures acceptance matches offer exactly (Majallah 177). A Nomination offered in the app should do the same.
2. **Put consent at the code.** Record the moment the code is entered as the moment of consent (SS 38 5/4). Record the moment the Owner approves as the moment the contract is made (§6).
3. **Honor withdrawal before approval.** Under the reading in §1.4, an Investor may withdraw their agreement until the Owner approves. Either give the portal a way to withdraw, or write in the Owner's procedure that a withdrawal by phone stops approval. The alternative is to take the Owner's own withdrawal away once the Investor has agreed.
4. **Tell the Investor when the Owner approves.** The contract binds from that moment, whether or not the Investor knows (SS 38 §6).
5. **Keep the trail fit for proof.** The trail should hold the paper, the fingerprint, the phone the code went to, the code's sending and entry times, and the approval. It is what the Arbitrator will weigh (Res. 52 Fifth; SS 38 8/2/4).
6. **Treat paper and app the same in Shariah.** Paper stays available, as the map already settles.

### Take to the Shariah scholar

1. **Who offers.** Is the Owner's Agreement Offer an invitation (SS 38 5/3), with the Investor offering and the Owner accepting at approval? If so, must the Investor be able to withdraw their agreement before approval? Or does the scholar read the Owner's approval differently, for instance as an option kept by the Owner?
2. **The code as consent and signature.** Is entering a one-time SMS code against the exact paper an acceptable expression of consent (SS 38 5/1, 5/4)? Is it an acceptable electronic signature (8/2/2, App. C), subject to the lawyer's answer on Bangladeshi law?
3. **Writing and witnesses.** Does the scholar agree that 2:282's writing is recommended, not a condition, for a mudarabah? Is the kept electronic paper the writing? Would the scholar want a human witness to an in-app Agreement or Nomination?
4. **The Nomination.** Is a Nomination agreed in the app sound? Does it fall under the preamble's exception of wills, isa' and agency from the majlis? Is it to be read as isa' to collect for the heirs?
5. **The minor's Receiver.** May an Investor name a Receiver who is not the minor's guardian? May that Receiver consent by SMS without a portal account?
6. **The Amendment.** It is agreed by every Investor separately and then approved. Is that a valid joint modification of each Investor's mudarabah?

The nominee note's scholar questions (the amin reading; an heir as a collector) still stand and are not repeated.

---

## Unclear / not found

- **The Arabic text of SS 38**, which prevails over the English, was not read.
- **AAOIFI SS 52, Options to Reconsider**, was not read. It is relevant only if the scholar reads the Owner's approval as an option.
- **Bangladesh Bank's 2026 e-KYC guideline (BRPD)** was not read, because bb.org.bd refused automated access. The 2019 BFIU guideline was read.
- **No published Shariah ruling on digital onboarding by a Bangladeshi body was found**: neither an Islamic bank's Shariah Supervisory Committee (IBBL's for CellFin included) nor the Central Shariah Board for Islamic Banks of Bangladesh. IBBL's annual reports, where the committee's report appears, were not searched.
- **Whether Bangladeshi scholars apply AAOIFI** standards as authoritative was not established. Their reference is more often the Hanafi texts. The Majallah and _Ma'arif al-Qur'an_ were read to cover that, but no Bangladeshi Hanafi fatwa on electronic contracts was found.
- **Classical Hanafi sources** (Ibn 'Abidin, _Fath al-Qadir_, al-Kasani) on contracting by letter, and the Majallah's articles on documentary evidence, were not read in the original. SS 38 cites the first three.
- **Guardianship over a minor's property** (who may collect for a minor Nominee) was not researched from primary sources.
- **The September advisers' opinions** on electronic signatures are not in the repo (ticket 01).

---

## Sources

**Islamic Fiqh Academy (iifa-aifi.org, read 8 October 2026)**

- Resolution 52 (3/6), Conclusion of Contracts by Modern Means of Communication, Jeddah, 14–20 March 1990: https://iifa-aifi.org/en/32402.html
- Resolution 230 (1/24), Smart Contracts: Activation and Reversal Methods, Dubai, 4–6 November 2019: https://iifa-aifi.org/en/33146.html

**AAOIFI Shari'ah Standards (aaoifi.com, English)**

- SS 13, Mudarabah (16 May 2002): https://aaoifi.com/wp-content/uploads/2020/08/SS-13-Mudarabah.pdf
- SS 23, Agency and the Act of an Uncommissioned Agent (30 April 2005): https://aaoifi.com/wp-content/uploads/2020/08/SS-23-Agency-and-the-Act-of-an-Uncommissioned-Agent-Fodooli.pdf
- SS 38, Online Financial Dealings (15 March 2009): https://aaoifi.com/wp-content/uploads/2020/08/SS-38-Online-Financial-Dealings.pdf
- Standards list: https://aaoifi.com/shariah-standards-3/?lang=en
- State Bank of Pakistan, adoption of SS 38 (2019): https://www.sbp.org.pk/ibd/2019/C1-Annex-A.pdf

**Qur'an, tafsir and hadith**

- Qur'an 2:282, 2:283, 4:29, 5:1, 5:106 (Sahih International): https://api.alquran.cloud/v1/ayah/2:282/en.sahih (and the same path for each verse)
- Ibn Kathir (abridged English) on 2:282–283: https://api.quran.com/api/v4/tafsirs/169/by_ayah/2:282
- Mufti Muhammad Shafi, _Ma'arif al-Qur'an_ (English) on 2:282–283: https://api.quran.com/api/v4/tafsirs/168/by_ayah/2:282
- Sahih al-Bukhari 2738: https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari/2738.json

**Hanafi codification**

- The Majallah (Mejelle), arts. 173–177, 181–185, Tyser's translation: https://majalla.org/ilm/the-contract-of-sale/ ; https://majalla.org/ilm/agreement-of-acceptance-with-offer/

**Bangladesh**

- BFIU, Guidelines on Electronic Know Your Customer (e-KYC), December 2019, issued with BFIU Circular 25 of 8 January 2020: https://www.bfiu.org.bd//pdf/circular/aml/jan082020bfiu25.pdf
- Bangladesh Bank, revised e-KYC guideline (2026), not read: https://www.bb.org.bd/aboutus/regulationguideline/brpd/ekyc2026.pdf
- Islami Bank Bangladesh, CellFin (App Store listing): https://apps.apple.com/app/id1568289820
- Islami Bank Bangladesh, Mudaraba Savings Account: https://islamibankbd.com/deposit/mudaraba-savings-account-msa

**[SECONDARY]**

- The Business Standard, Al-Arafah Islami Bank supplement, 30 November 2025: https://www.tbsnews.net/supplement/al-arafah-islami-bank-unlocks-new-era-shariah-guided-mobile-banking-1298151
- Dhaka Tribune, "Discussion on digital transactions in Islamic finance held", 25 April 2022: https://www.dhakatribune.com/amp/business/268954/discussion-on-digital-transactions-in-islamic

**In this repo**

- `packages/api/src/agreement-offer-store.ts` (`withdrawOffer`, `agreeToOffer`, `approveOffer`)
- [nominees-in-bangladeshi-law-and-shariah.md](nominees-in-bangladeshi-law-and-shariah.md); [stating-a-mudarabah-return.md](stating-a-mudarabah-return.md)
