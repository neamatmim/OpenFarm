# Prototype the Agreement's parties part with several Nominees

Status: open

Type: prototype

Blocked by: 03, 04

Map: [OpenFarm: an Investor may name several Nominees](../map.md)

## Question

What does the Investment Agreement print under each Investor when they have several Nominees? Build a rough printed page to react to, using the Bangla and English side by side as the Template does, covering:

- The Nominees as a list, with their shares or order as decided in [How several Nominees stand together](./03-how-several-nominees-stand-together.md).
- The **nominee lines** (`NOMINEE_LINES` in `packages/domain/src/standard-templates.ts`): the confirmation that the Nominees know, and the guardian line. Once per Nominee, once for all, or only where a Nominee is a minor?
- **The Nomination** itself, a new paper decided in [Which Nominees a signed Agreement names](./04-which-nominees-a-signed-agreement-names.md). It is a short, unstamped letter naming every Nominee in full, signed and dated in front of the Owner, on the farm's letterhead, in Bangla with English beside it.
- An Investor with none, one, and four Nominees, including a minor.

The outcome is the draft wording for the next standard Template Version and the page the lawyer is shown.

## Resolution
