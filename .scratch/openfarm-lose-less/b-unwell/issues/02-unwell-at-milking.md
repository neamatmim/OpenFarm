# 02 — "Unwell" at milking is an Observation

**What to build:** Skipping a cow as "Unwell" records an Observation of her, so 01 raises the work.

**Blocked by:** 01

- [ ] **Effect input:** pass the chosen skip reason into `EffectInput` (`effect.ts:183`); today only the boolean.
- [ ] **Milk effect** (`milk.ts:38`): on "Unwell", write an Observation (word per decision 6) pointing at the same
      completion. Any other skip, or litres, withdraws it.
- [ ] **Standard Playbook:** give the skip reason a stable id so its words can be translated without breaking it.
- [ ] **Tests:** one Observation; a repeated entry writes none again; a Correction to litres withdraws it and calls the
      work off.
- [ ] **Somebody opens it:** the milker skips a cow, the Manager sees the work. Both languages.
