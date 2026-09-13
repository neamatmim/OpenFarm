# 55 — The Registration, and its renewal

**What to build:** The farm's DLS Registration is one of its few hard legal duties, and it runs out every 31 March. The Manager keeps the Registration record — number, issuing office, issue and expiry dates — with a photograph of the certificate. Ninety days before it expires, the renewal SOP (SOP 26) is raised for the Owner and the renewal sits on the Owner's queue. The renewal's last step asks for the new expiry date and a photo of the renewed certificate, and completing it updates the Registration record, audited (the Owner's decision, 2026-09-13), so the next renewal is raised on its own a year later.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 7, user stories 94 and 97; [DLS registration evidence](../../openfarm-release-1/issues/22-dls-farm-registration-evidence.md); [Report set](../../openfarm-release-1/assets/report-set.md) — R1; `CONTEXT.md` — **Registration**, **SOP**, **Trigger**.

- [ ] The Manager records a photo of the Registration certificate beside the number, office and dates; the photo is kept, replaced by a newer one, never lost from the trail
- [ ] A renewal SOP is raised for the Owner once the expiry is within the Registration renewal lead (Farm Parameter, 90 days) — once per expiry, however often the farm is swept
- [ ] The renewal due shows on the Owner's exception list until it is done
- [ ] The renewal's closing step records the new expiry date and the renewed certificate's photo, and completing it updates the Registration record, with the change on the trail; a date before the old expiry is refused
- [ ] Tests cover the photo, the SOP raised once at the lead, the Owner's queue, a renewal updating the record and raising nothing more until the next lead, and a refused date
