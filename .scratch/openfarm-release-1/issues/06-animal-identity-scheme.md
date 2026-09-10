# Animal identity scheme

Status: resolved

Type: grilling

Blocked by: 02, 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Research says** (see [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md)): no national cattle ID scheme exists — only a BINLI ear-tag pilot with no published format. So the farm's own numbering is the primary identity; keep an optional _official tag_ field for the pilot/any future scheme; the slaughter fitness certificate records a _tag number_, so every fattening animal must carry a readable tag by sale.

**Grilling.** Read [Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md) first — if a national ID scheme is mandatory, that decides most of this.

Decide how an Animal is identified for the life of the system:

- Farm's own numbering vs official IDs vs both (official as an attribute).
- Number format, uniqueness rules, whether numbers are ever reused.
- What happens when a tag is lost/replaced — same Animal, new tag; how is that recorded?
- Do unborn/newborn calves get an identity at birth or at tagging?
- Is there a visual/photo record to help barn staff confirm the right animal on the phone?

Resolved when the identity rules are written down and `CONTEXT.md` defines Ear Tag vs Animal identity.

## Answer

Decided with the Owner on 2026-09-10. There is no national scheme (research), so identity is the farm's own.

- **Tag Number** = side-of-origin prefix + running number, **never reused**: `D-0001…` for animals born on the Dairy side, `F-0001…` for animals taken in for Fattening. The prefix records origin and **does not change** when an animal moves side (a dairy cow moved to fattening stays `D-0123`). Numbers are assigned by the system, sequentially per prefix, at the moment the record is created.
- **Official Tag** — an optional free-text field for any government/pilot tag (BINLI or a future scheme); never the identity.
- **Lost or unreadable tag** — same Animal, same number. A replacement tag is issued with the same number and the **re-tag is a recorded event**. Consequence for [Tag the animals](./07-tag-animals-and-opening-register.md): tags must be printable/writable with a chosen number (not pre-numbered stock).
- **Newborns** — identity **at birth**: the calving SOP creates the calf record with the next `D-` number and status _tag pending_; the newborn-care SOP has a "tag applied" step. No untracked animals, ever.
- **Profile photo** — one per Animal, taken at registration/intake, updatable, **shown wherever an animal is picked** on the phone. Optional at registration; prompted later if missing.

### Consequence for the opening register

Animals already carrying the farm's old numbers will be **re-numbered** into the `D-`/`F-` scheme during [Tag the untagged animals and compile the opening register](./07-tag-animals-and-opening-register.md); the old mark is kept as an alias on the record so nobody loses track during the changeover.

Unblocks → [Tag the untagged animals and compile the opening register](./07-tag-animals-and-opening-register.md).
