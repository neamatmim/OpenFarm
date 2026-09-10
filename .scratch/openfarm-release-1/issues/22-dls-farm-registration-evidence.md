# DLS farm registration evidence

Status: resolved

Type: grilling

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling, with the Owner.** Research ([Bangladesh regulatory requirements](./02-bangladesh-regulatory-requirements.md)) found that DLS farm registration is one of the few _hard_ legal duties, that the registration form asks the farm to declare its "record-keeping method" and "disease record-keeping method", and that validity is unclear (5 years per Rule 19 vs "renew by 31 March every year" on the certificate form).

Decide:

- Is the farm currently registered with DLS? Registration number, issue and expiry dates, which ULO/DLO. (Fact — the Owner has the certificate.)
- Should the system hold the registration record and remind the Manager before renewal? Recommended: yes, it's cheap and it's the one audit item an inspector will ask for first.
- Does the Owner want the system to be _the_ declared "record-keeping method" on the next renewal/inspection — and if so, what must an inspector be able to see on demand (ties to [Compliance reports and exports](./19-compliance-reports-and-exports.md))?
- Resolve the renewal-cadence conflict by asking the ULO; record the answer.

Resolved when the registration facts are recorded in the Answer and the decision on what the system evidences is written down.

## Answer

Decided with the Owner on 2026-09-10.

- **The farm is registered with DLS.** Registration number, issue/expiry dates and ULO/DLO office: _to be entered by the Manager from the certificate_ (details did not arrive with the answer; see Follow-up).
- **Renewal cadence: annual — renew by 31 March each year** (per the farm's certificate; resolves the Rule 19 vs certificate-form conflict for this farm).
- **The system holds the Registration record**: number, office, issue date, expiry date, certificate photo. **SOP 26 (DLS registration renewal) is auto-due 90 days before expiry** — i.e. ~1 January each year — assigned to the Owner.
- **OpenFarm will be declared the farm's record-keeping method** at the next renewal/inspection.
- **Inspector view**: one screen the Manager opens on their phone, showing — Registration record · herd count by Side and State · vaccination register · treatment register (last 30 days, with prescriptions and withdrawal) · disease history (last 6 months) · mortality register — each with **PDF export**. The inspector never touches the device; the Manager shows the screen and hands over prints/PDFs. This is a rehearsable moment, not a scramble.

### Follow-up (not a decision)

- Manager enters the registration details and photographs the certificate at go-live. Recorded as a step of the opening-register task ([Tag the untagged animals and compile the opening register](./07-tag-animals-and-opening-register.md)).

Unblocks → [Compliance reports and exports](./19-compliance-reports-and-exports.md) (with [Health model](./08-health-medicine-and-withdrawal.md) already done).
