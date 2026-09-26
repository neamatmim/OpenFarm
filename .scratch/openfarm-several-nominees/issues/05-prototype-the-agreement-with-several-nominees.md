# Prototype the Agreement's parties part with several Nominees

Status: done

Assignee: Neamat Khan Mim

Type: prototype

Blocked by: 03, 04

Map: [OpenFarm: an Investor may name several Nominees](../map.md)

## Question

What does the Investment Agreement print under each Investor when they have several Nominees? Build a rough printed page to react to, using the Bangla and English side by side as the Template does, covering:

- The Nominees as a list, with their shares or order as decided in [How several Nominees stand together](./03-how-several-nominees-stand-together.md).
- The **nominee lines** (`NOMINEE_LINES` in `packages/domain/src/standard-templates.ts`): the confirmation that the Nominees know, and the guardian line. Once per Nominee, once for all, or only where a Nominee is a minor?
- **The Nomination** itself, a new paper decided in [Which Nominees a signed Agreement names](./04-which-nominees-a-signed-agreement-names.md). It is a short, unstamped letter naming every Nominee in full, signed and dated in front of the Owner, on the farm's letterhead, in Bangla with English beside it.
- **The discharge line**, from [What a Nominee is in OpenFarm](./02-what-a-nominee-is-in-openfarm.md): once the Farm pays the Nominee(s) it has met its obligation, and the heirs settle among themselves with whoever was paid. It goes in both the Agreement and the Nomination, and the wording must not let a share read as inheritance.
- From [How several Nominees stand together](./03-how-several-nominees-stand-together.md):
  - each Nominee's share % and date of birth;
  - a line saying a share is of the collecting, not of the inheritance;
  - the survivors rule;
  - a minor Nominee's **Receiver**, with the guardian line printed only for them and signed by the Receiver;
  - what the paper says when there is no Nominee.
- An Investor with none, one, and three Nominees (the most allowed), one of them a minor.

The outcome is the draft wording for the next standard Template Version and the page the lawyer is shown.

## Resolution

Prototyped 2026-09-26 and chosen by the Owner. The prototype is on branch `prototype/several-nominees` (1765765): `/prototype/nominees?variant=A|B|C|D&case=none|one|three`. The draft wording is in [assets/05-nominee-wording-draft.md](../assets/05-nominee-wording-draft.md).

Four layouts were tried: **A** a table under the Investor, **B** a part of its own with a card per Nominee, **C** the Investor's first-person declaration, and **D**, the pick, which combines them:

- **The Agreement keeps A's table under the Investor in the parties part.** It fits the Template's existing parties part, which already prints lines under each Investor.
  - Under the table go only the Nominees-know line and a Receiver line per minor, signed by the Receiver.
  - With no Nominee, one sentence replaces the table.
- **The five rules move into the Terms, printed once**, replacing today's single heirs clause. The clause is reworded so it reads right with no Nominee: "through their Nominees where they named any, … otherwise directly, usually against a succession certificate". This was found while looking at the no-Nominee case.
- **The Nomination opens in the Investor's own words** (C's «আমি … মনোনীত করছি»), then A's table and lines, then the five rules in full because it is read alone. It closes with "replaces every earlier one, governs all my Agreements", and is signed by the Investor, the Owner and each Receiver.
- **B's cards were dropped.** A card grid wastes space for one Nominee and matches no part of the Template.

**Words fixed:** গ্রহণকারী for Receiver (not অভিভাবক, because the farm does not decide guardianship), মনোনয়নপত্র for Nomination, অংশ for share, and সংগ্রহ করা for collect.

**For the spec:**
- The Template needs:
  - a new kind for the Nomination;
  - a parties part that carries a Nominee table, not one row;
  - the guardian line printed per minor rather than always.
- The heirs clause and the Nominees-know line are the standard wording's to change, in the next standard Version.
- The "Nominees since changed" note belongs on the screen, never on the paper (ticket 04).
