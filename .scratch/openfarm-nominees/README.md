# An Investor names several Nominees — tickets

These are the tickets from [the spec](./spec.md). They build what the map [OpenFarm: an Investor may name several Nominees](../openfarm-several-nominees/map.md) decided on 2026-09-26. The vocabulary is in the glossary's **Nominee**, **Nomination** and **Receiver** entries. The wording is in [the draft](../openfarm-several-nominees/assets/05-nominee-wording-draft.md), and the printed layout is variant D of the prototype on branch `prototype/several-nominees`.

| #   | Ticket                                       | Blocked by |
| --- | -------------------------------------------- | ---------- |
| 01  | Nominees on record, and the list in force    | —          |
| 02  | The মনোনয়নপত্র                               | 01         |
| 03  | The Agreement names its Nominees             | 02         |
| 04  | The next standard wording                    | 02         |

**There is one root, 01.** It replaces the three `nominee_*` columns with Nominations and switches every reader to the list in force. After it, nothing prints or shows the old single nominee.

**03 and 04 may go side by side** once 02 is in: 03 is the sign sheet and `ventures.sign`, and 04 is standard wording only.

Work one ticket per `/implement`, clearing context between them. Each ticket's status is on its own `**Status:**` line.

**Every ticket ends with somebody opening the page:**

- in both languages;
- the portal account page at phone width;
- papers by print preview cloned into an overlay, because Chrome's print dialog freezes the browser tools.

Web component tests are not collected by the vitest include glob.

**Settled on the map, and not to be re-decided:**

- **A Nominee collects for the lawful heirs and keeps nothing.** A share decides who collects which part, never who inherits.
- **None, or up to three.** Whole percents adding to 100. With none, the screen reminds the Owner and never refuses.
- **A Nominee who dies first** leaves their share to the others in proportion, or to the heirs if none are left. The paper says so, and OpenFarm records no Nominee's death.
- **Every Nominee's date of birth is recorded.** A minor collects through one named **Receiver** (গ্রহণকারী), who signs the line printed for them only. The Receiver is not a Nominee.
- **A Nominee is name, relation, phone, date of birth and share.** No NID and no address.
- **The list changes only by a signed paper**: a মনোনয়নপত্র, or the Agreement itself. The latest one recorded is the list in force for all the Investor's Agreements. The Owner never edits it by hand.
- **The farm owes a Nominee nothing directly** while the Investor lives. The portal only shows the list.
- **The wording is OpenFarm's draft** until the lawyer approves it at the pending meeting. An existing farm moves to a new standard only when the Owner publishes it.
- **Out of scope:** what happens when an Investor dies, reprinting a signed Agreement, and changing Nominees in the portal.
