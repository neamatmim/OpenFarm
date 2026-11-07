---
status: accepted
date: 2026-11-08
---

# Somebody the Owner sends a link to may apply online, and be let in without meeting

ADR 0007 let Investors into the portal by the Owner's invitation, one person at a time. The Investor signed the Portal Consent on paper in front of the Owner, and the Owner handed over the first code with the Welcome Letter. On 2026-10-09 the Owner also ruled that the first code is never texted. Before any of that, somebody became an Investor only at a meeting: the Owner filled in the Investor Details Form with them from their NID and bank papers and typed it in.

On 2026-11-08 the Owner asked for "any investor" to apply online and be approved. Asked who could open the form, they chose **only somebody the Owner sends a link to**, not a public page. The lawyer approved the portal "because it stays by invitation only" (ADR 0008), and an Investor is somebody "known to the Owner personally or personally introduced". Asked how the applicant gets in, they chose **fully online**: no meeting, consent agreed on the form, and the first code texted on approval. They asked for the link to go **by email**.

**An Application Link is an invitation; an Application is what comes back.** The Owner makes a link for one named person: name, mobile, email, person or Organization. The farm emails it from its own account, or texts it, or the Owner copies it. The person proves the mobile by entering a code texted to it. They then fill in the Investor Details Form's parts and add photographs of their NID. They read the Portal Consent in full and agree it with that code. The Owner is told at once, checks the photographs, and approves or declines. Approving writes them down as an Investor, records their consent and texts their first code.

- **No public page.** The link opens for one mobile and is good for one Application and one week. Without its code, it shows nobody's name, because an email typed with one wrong letter reaches a stranger. There is no referral: only the Owner makes links.
- **The consent is agreed with a code, not a tick box.** That is ADR 0022's Signing Code: the code is their signature, and the proof is kept the same way (when, which way the code came, from what address and browser, and the wording's fingerprint). The code also proves the mobile they will sign in with is theirs. So the farm must be able to text. Email alone cannot prove the mobile.
- **The NID is checked from a photograph.** Front and back are required, and an Organization also sends its trade license and its Signatory's authority. An approved Application's photographs stay beside the record as proof of the Owner's check.
- **The first code may be texted, for an approved Application only.** Everybody the Owner meets in person keeps the 2026-10-09 rule. The email the link went to counts as confirmed if they keep it, because the link was a secret sent there, as a confirmation code is.
- **Nominees typed are a draft.** A Nominee is in force only once a Nomination is signed. On approval one is offered in the portal (ADR 0022), or signed on paper where a minor is named.
- **Nothing about Ventures or money changes.** An Application asks for no Units, the Investor Cap is held at signing, and joining is still a Request to Join, then an Agreement.
- **What is not approved is not kept.** One declined, or left undecided for 30 days, loses its NID, bank, Nominees and photographs 30 days later.
- **Behind the farm's switch, `investor_applications`, off by default and the Owner's alone.** It also needs the portal open. The lawyer and the Shariah scholar see it first, on the sheet in `.scratch/openfarm-investor-applications/`, because it replaces an in-person consent and NID check with an online one.

**Consequences:**

- ADR 0007's "by invitation, one person at a time" stands; a link is that invitation. Its "consent signed in front of the Owner" and "code handed over in person" give way, for an Application only.
- CONTEXT.md gains **Application Link** and **Application**. Its **Portal Consent**, **Investor Portal**, **Investor Details Form** and **Request to Join** entries say so.
- The plan is in `.scratch/openfarm-investor-applications/`.

**Revisit** when the advisers answer. If they say an online consent or a photographed NID will not do, the switch stays off and this ADR follows their answer.

**2026-11-08, later: the codes go by email too.** The Owner: the farm has no SMS gateway yet. So every code an Application uses goes both ways where the farm can send it: one code by text to the link's mobile, and another by email to the link's email. Either opens the link or agrees the consent, and the proof says which way it came, as a Signing Code's does. With no gateway, the email alone carries them, so a link then needs an email. Approving sends the first portal code the same ways, and is refused when it would reach nobody: no gateway, and an email changed on the form that nothing secret has reached.

What this gives up: with email alone, nothing proves the mobile is theirs, only the inbox. The mobile is still what they sign in with, and the link shows it only partly hidden, so a stranger holding a mistyped email cannot sign in. "The farm must be able to text" above gives way to this.
