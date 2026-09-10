# Breeding and reproduction

Status: resolved

Type: grilling

Blocked by: 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Decide the reproduction model for Dairy:

- Heat detection: who observes, how recorded, does it trigger an AI SOP?
- Service: AI vs natural; semen/bull identity; technician.
- Pregnancy check: when, by whom (Vet?), result.
- Expected calving date and the SOPs it triggers (dry-off, calving prep).
- Calving: outcome, calf → new Animal (link to [Animal lifecycle](./04-animal-lifecycle-and-groups.md)), lactation start (link to [Milk recording](./09-milk-recording.md)).
- Failures: abortion, repeat breeder, cull decision.

Resolved when the reproductive cycle events and their triggers are written down.

## Answer

Decided with the Owner on 2026-09-10. The reproductive cycle is a chain of events, each raising the next SOP with a due window:

1. **Heat** — recorded by Staff on the heat-watch SOP (cow, time observed, signs). **Auto-raises an AI SOP instance due within 12–18 h.**
2. **Service** — AI or natural, recorded the same way: date/time, sire (semen straw ID or bull Tag Number), technician/Vet. Heifer's first confirmed service leads to `Pregnant Heifer` only after PD.
3. **Pregnancy Check (PD)** — Vet SOP **auto-due ~45 days after service**. _Positive_ → **Expected Calving = service date + 283 days**; heifer → `Pregnant Heifer`, cow → _pregnant_ fact on `Milking`/`Dry`. _Negative_ → back to heat watch; the failed service counts.
4. **Dry-off SOP** — auto-due **60 days before Expected Calving** → `Dry`.
5. **Calving-prep SOP** — auto-due **7 days before** → Move to the calving Pen.
6. **Calving** — records date, ease (unassisted / assisted / vet), calf sex, live/stillborn. Effects: dam → `Milking`, new Lactation starts; **calf created** with the next `D-` number, _tag pending_ (twins = one calving, two calves). **A stillborn calf is still created and immediately exits as `Died`**, so calving history is complete.

**Failures**: **Abortion** is an event (date, stage, Vet note) → pregnancy cleared, back to heat watch. After **N failed services (default 3)** the system raises a **Repeat Breeder** flag for the Manager/Vet to decide cull or treat — a flag, never an automatic state change.

**Farm parameters** (Manager-editable, defaults): AI due window 12–18 h · PD at 45 days · gestation 283 days · dry-off lead 60 days · calving-prep lead 7 days · repeat-breeder threshold 3 · weaning ~3 months (from lifecycle).

### Consequences

- SOP engine: needs _event-relative_ schedule triggers ("N days after/before event X") in addition to fixed schedules — a refinement of the Trigger model.
- Milk: Lactation number and days-in-milk derive from Calving events.
- Feed: Dry cows and Pregnant Heifers are ration groups.
