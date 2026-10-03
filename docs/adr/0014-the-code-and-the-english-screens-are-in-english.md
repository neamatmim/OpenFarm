---
status: accepted
date: 2026-10-03
---

# The code and the English screens are in English

OpenFarm's code took the farm's own words, Bangla ones included: `baki`, `haat`, `hasil`, `challan`, `bKash`, and `taka` in the names of its sums and helpers. On 2026-10-03 the Owner decided the code should follow standard practice instead: routes, files, functions, fields, tables and stored values are named in English. A developer who does not read Bangla, or a farm outside Bangladesh (ADR 0013), can then read them.

So a Bangla word with an exact English equivalent takes it, in the code and on the English screens. The Bangla screens keep the farm's word, and CONTEXT.md gives both:

| The farm says                  | The code and the English screens say                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| বাকি (baki)                    | **Receivable**. Something sold that way is sold **on credit**; what a buyer paid beyond it is **paid ahead** |
| হাট (haat)                     | **Livestock Market**. Not "market" alone: the market price is the farm's price a kilo                        |
| হাসিল (hasil)                  | **Market Toll**                                                                                              |
| চালান (challan), on a Dispatch | **Delivery Note**                                                                                            |
| বিকাশ (bKash)                  | **Mobile Money**. bKash is one provider                                                                      |
| টাকা (taka), in a name         | **Money** (ADR 0013)                                                                                         |

Each name was chosen against the glossary, not translated word for word. "Credit" alone, "owed" and "market" already meant other things here.

**Kept, because they are already the thing's own name:** _maund_ (a unit, as "pound" is), _mudarabah_ (the international name of that contract), _lakh_ (how Bangla groups digits), and the government's _e-challan_, which pays an Agreement's stamp duty.

**Consequences:**

- Each rename moved what the database keeps as well as what the code says: tables (`receivable_payment`), columns (`intake.market_toll_money`, `dispatch.delivery_note`), stored values (`receivable_overdue`, `mobile_money`, the charge word `market_toll`), and the same keys and values inside JSON. Words people typed were left as they typed them. Production starts empty (go-live, 2026-09-28), so nothing real was carried across.
- **The Investor papers and agreement templates keep their approved wording**, "হাসিল / Haat toll" included, as ADR 0013 keeps them Bangladesh's.
- A new name in the code is English. Before writing a Bangla word into a name, check CONTEXT.md for the English term, and add one there if there is none.

**Revisit** if a Bangla word turns out to have no English equivalent that does not clash. Then it is kept, glossed in CONTEXT.md, as _maund_ is.
