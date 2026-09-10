# Bangla/English content and i18n approach

Status: resolved

Type: grilling

Blocked by: 05

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Bangla default for Barn Staff, English available. Decide:

- UI strings: standard i18n — who translates, and is Bangla the source language?
- **SOP content** (names, step text): authored in Bangla, English, or both? Must every SOP exist in both before it can be assigned?
- Animal names/notes: free text in any script.
- Numerals, dates (Bengali calendar shown?), units (litres, kg, maund?).
- Voice or icon-heavy steps for low-literacy staff — in R1?

Resolved when the content-language rules are written down.

## Answer

Decided with the Owner on 2026-09-10.

- **UI strings**: **English is the source** (developer keys); **Bangla is a maintained translation reviewed by the Manager** before each release. **The build fails on any missing Bangla string** — nothing untranslated ever reaches Staff. Language is a **per-user setting, Bangla by default for Staff**; Owner/Manager/Vet may switch.
- **SOP content** (names, step text, choice labels, skip reasons): **authored in Bangla by the Owner**, per Version. **Bangla is required to publish; English is optional** per Version — used in reports/exports and for a visiting Vet when present, otherwise the Bangla shows. Consequence: SOP Version content is stored as `{bn: required, en?: optional}` fields.
- **Free text** (animal names, notes, counterparties): any script, stored as entered.
- **Formats**: numbers **stored as digits, displayed as Bangla numerals (০–৯) when the UI is in Bangla**; **Gregorian dates with Bangla month names**; no Bengali calendar in R1. **Metric units** (litre, kg) in all records; **maund (মণ, 37.32 kg) shown alongside kg on feed purchases only** — never stored.
- **Low literacy**: **an icon on every Step and every Evidence type, animal photos wherever an animal is picked, large touch targets.** **No voice in Release 1** — Bangla text-to-speech readout is a Release 2 candidate once real usage is seen.

### Consequences

- Prototype: must be built in Bangla with icons, not English placeholders.
- SOP engine: Version content is bilingual-capable; publish validation checks Bangla completeness.
- Notifications: message language follows the recipient's user setting.
