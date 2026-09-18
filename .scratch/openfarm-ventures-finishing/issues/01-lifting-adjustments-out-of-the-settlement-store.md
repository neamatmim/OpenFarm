# 01 — Lifting Adjustments out of the Settlement store

**What to build:** Nothing changes for anybody using the farm. The store that holds a Settlement now holds four separate jobs — working the close-out out, reading it back, paying it, and the whole of Settlement Adjustments — and the Adjustment half shares almost nothing with the rest. Move it out before the next two tickets add to it.

A prefactor, and deliberately its own ticket: a mechanical split of a large file is exactly the change that goes wrong when it rides along inside a feature.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Everything about Settlement Adjustments lives in its own store: what they come to, what must be done about them, raising, closing and reading them back
- [ ] The Settlement store keeps the close-out arithmetic, the read model and the payouts
- [ ] No behaviour changes and no test changes: the whole suite passes untouched
