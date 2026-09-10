# Tag the untagged animals and compile the opening register

Status: open

Type: task

Blocked by: 06

Map: [OpenFarm Release 1](../map.md)

## Question

**Scheme decided** ([Animal identity scheme](./06-animal-identity-scheme.md)): `D-0001…` for Dairy-born, `F-0001…` for Fattening intake, never reused; tags must be writable with a chosen number; keep any old mark as an alias; take a profile photo of each animal while tagging.

**HITL task — physical farm work plus data entry.** The system cannot start without every Animal identified per [Animal identity scheme](./06-animal-identity-scheme.md).

Checklist for the Manager:

1. Procure tags matching the decided scheme.
2. Tag every untagged animal; record old marks/names → new tag.
3. Compile the opening register: one row per Animal with the mandatory fields decided in [Animal lifecycle](./04-animal-lifecycle-and-groups.md) (tag, sex, breed, approx. birth date, source, current group, Dairy/Fattening, current state).
4. Save as `.scratch/openfarm-release-1/assets/opening-register.csv`.
5. Enter the DLS registration details (number, office, issue/expiry) and photograph the certificate — see [DLS farm registration evidence](./22-dls-farm-registration-evidence.md).

Resolved when the register is complete and the Owner confirms the head count matches reality. The Answer records the head count and any animals that could not be resolved.
