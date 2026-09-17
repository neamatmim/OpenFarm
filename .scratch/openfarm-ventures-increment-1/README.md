# Ventures — increment 1: the widened costing

Six tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 1. Every Animal on the farm is charged what she actually costs: home-grown fodder at a Fodder Price, the Hasil paid on her, her share of the Buying Trip that brought her and the Selling Trips that took her, and her share of the Herd Costs the Owner marks as charged.

No Venture appears anywhere in this increment. It ships on its own, it improves the Farm's own Margin and Cost of Gain, and it is the only part of the effort no adviser's answer can change.

| #   | Ticket                                                   | Blocked by |
| --- | -------------------------------------------------------- | ---------- |
| 01  | Costs carry their new parts, all at zero (prefactor)     | —          |
| 02  | Home-grown fodder costs what it is worth                 | —          |
| 03  | The haat's toll follows the animal                       | 01         |
| 04  | A Buying Trip is paid for by the animals it brought home | 01         |
| 05  | A Selling Trip is paid for by the animals taken          | 04         |
| 06  | Herd costs reach the animals standing that month         | 01         |

Work the frontier — 01 and 02 can start at once — one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.
