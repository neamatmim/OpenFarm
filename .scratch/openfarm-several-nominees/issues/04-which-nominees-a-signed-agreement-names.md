# Which Nominees a signed Agreement names

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: —

Map: [OpenFarm: an Investor may name several Nominees](../map.md)

## Question

Today a reprinted Investment Agreement prints the Investor's nominee **as the `investor` row holds it now** (`paperInvestor` in `packages/api/src/paper-values.ts`), not as it was on the stamped paper. The wording is pinned to the Version it was signed in, but the parties are not. With several Nominees who change over the years, the reprint and the paper in the drawer drift apart. Decide:

- **Does a signed Agreement hold its Nominees as signed?** Or is the Nominee list the Investor's alone, with the Agreement only pointing at it?
- **Changing Nominees after signing.** Is it a signed letter kept on file, an **Amendment**, a fresh paper, or only the Owner putting the record right as with any Investor detail (the Audit Event keeping the old)?
- **Which list governs on the day it matters**: the one on the stamped paper, or the latest one the farm holds.
- **The same question for the Investor's other details** printed on the paper (address, phone), since the answer may apply to all of them. Say so, but decide only the Nominees here.

## Resolution

Grilled with the Owner, 2026-09-26. Named **Nomination** in [`CONTEXT.md`](../../../CONTEXT.md), and the **Nominee** entry now points at it. No ADR: the choice follows the glossary's existing reason for keeping the nominee with the Investor.

1. **The latest list governs, for every Agreement.** A Nominee list belongs to the Investor, not to the deal. The Investor's latest recorded Nomination names their Nominees for all their Agreements, whatever an earlier stamped paper says, as with a bank or a savings certificate. Changing it takes no Amendment, and it never differs between Ventures.
2. **A change takes a signed Nomination.** It is a short, unstamped paper, signed and dated by the Investor in front of the Owner:
   - It names every Nominee in full, never only the change, so any one Nomination can be read alone.
   - It is printed from a farm Template (a new kind), and kept and photographed beside the Agreements.
   - The record of Nominees changes only when a Nomination is recorded. The Owner never puts it right by hand, because the farm's answer to a family is that the Investor named these people themselves.
   - **An Investment Agreement is a Nomination too**, for the list its parties part names on the day it is signed, so a new Investor signs nothing extra.
3. **A signed Agreement reprints with the Nominees it was signed with.** That list is recorded at signing along with the Agreement, so the reprint matches the photo of the stamped paper.
   - When a later Nomination has replaced that list, the **screen** says so beside the print ("Nominees since changed by the Nomination of <day>"). The paper never does, just as a missing lawyer approval is shown only on the screen.
   - Everything that describes the Investor *today* shows the list in force: the portal's account page, the Data Copy, the Investor sheet and profile, and a যোগদানপত্র printed now.
   - An unsigned Agreement, printed for signing, shows the list in force.
4. **Moving what exists, once:**
   - Each signed Agreement takes the nominee the Audit Event trail shows on its signing day. `readInvestor` records all three nominee fields, so the trail can recover them.
   - Each Investor's list in force is their latest signed Agreement's list.
   - A nominee the Owner edited after that signing, or one on an Investor with no Agreement, is the list in force but is marked **not yet signed for** until the Investor signs a Nomination.
   - **No real Investor has signed yet** (the Owner, 2026-09-26). Only seed and test data exist, so for the spec this is a migration line: the seed and tests are rebuilt on the new shape, and the trail backfill is a safety net.

**Found and left out of scope:** the reprint problem is wider than Nominees. A signed Agreement also reprints the Investor's name, phone, address and NID as they are today. The map's Out of scope section records this.

**For the other tickets:**
- The prototype (05) now has a second paper to draft, the Nomination itself.
- The lawyer's page (06) should ask whether an unstamped Nomination can replace the nominee named in a stamped Agreement.

**Correction, 2026-09-26, found while writing the spec:** the question's premise, "a reprinted Agreement prints today's nominee", was read from `paperInvestor` and not checked. **OpenFarm has no reprint of a signed Agreement.** `agreementToSign` prints only before signing, and the photo of the stamped paper is the record. The papers that print the nominee after signing are the যোগদানপত্র, an Amendment to sign and the Portal Consent sheet, and point 3 already has them describe today.

The decisions stand. Recording the Agreement's own Nominees is still needed, because the Agreement is a Nomination. "Reprints with the Nominees it was signed with" now describes what a reprint must do if one is ever built, and the spec rules that out of scope.
