# 32 — The letter that goes without delay

**What to build:** The farm keeps a list of the diseases that must be reported, confirmed with the ULO. When the Vet records a Diagnosis on that list, the farm raises the DLS report SOP for the Manager immediately — "without delay" is what the Act says — and the Step generates the pre-filled Bangla letter to the Upazila Livestock Officer, then records when it was delivered and under what reference. A report that was sent and cannot be evidenced is a report that was not sent.

**Blocked by:** 27

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 58 and 59; [Bangladesh regulatory requirements](../../openfarm-release-1/issues/02-bangladesh-regulatory-requirements.md).

- [ ] The farm maintains its notifiable-disease list; the Manager fills it from what the ULO confirms
- [ ] A Vet Diagnosis on that list raises the report SOP for the Manager, due immediately, once per Diagnosis
- [ ] The Step generates the letter in Bangla, filled from what the farm already knows, on one page
- [ ] Delivery date and reference are recorded against it, and the export is an Audit Event
- [ ] Tests cover a notifiable Diagnosis raising it, one that is not, the letter's contents, and delivery being recorded
