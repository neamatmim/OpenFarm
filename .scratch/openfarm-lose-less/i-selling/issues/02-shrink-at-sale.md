# 02 — Shrink at sale

**What to build:** The weight she lost between her last weighing and the sale — kg and % — shown on the sale sheet for
every animal, on today's sales and per Selling Trip; the sale weight correctable.

**Blocked by:** —

- [ ] **Glossary:** check CONTEXT.md for a word (research says "shrink"); add one if none.
- [ ] **Rule:** `shrinkOf(lastKg, lastAt, saleKg, saleAt)` in domain; a gain reads as a likely typing error.
- [ ] **Screen:** under the weight box (from her last Weigh-in, any pick); today's sales; the Selling Trip roll-up.
- [ ] **Correction:** `weightKg` on the sale correction.
- [ ] **Tests:** the figure; a stale weighing says its age; the weight corrected.
