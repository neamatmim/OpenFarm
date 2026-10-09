# Visual pass — 2026-10-09 (seed, bn, desktop 1568)

Looked at: home, money (register, accountant), animals, fattening, ventures, milk (records), feed (items), investors,
sheds, farm settings (details), monthly report, an animal's money tab, inspector view, sales.

- **Export tabs** (Money › Accountant, Milk › Records): a hint over bare outline buttons, nothing saying what each holds.
  Fixed 0056f584 — `components/exports.tsx` `ExportList`/`ExportRow`, Print + Download CSV.
- **Home figures**: calves panel's figures small, deaths panel's large — audit 24 (four copies of one figure helper).
- **Ventures table**: the act column stacks buttons of mixed variants (primary "কেনা শেষ", outline "টাকা তুলুন", a disabled
  grey one). Left: the next act per Venture is the design (memory: ventures are a card list / acts say why).
- **Print words**: `common.print` «প্রিন্ট করুন» in the paper toolbar and exports, but `months.one.print` «ছাপুন» on the
  two month pages. One word should win — fold in with B7 (month pages).
- Otherwise the pages read alike: PageHeader, stat tiles, tabs, DataTable, Notice.
