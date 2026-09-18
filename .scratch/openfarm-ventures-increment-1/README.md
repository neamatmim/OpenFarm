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

**All six are done and merged** (2026-09-17/18), each with its answer written on its ticket under "What was built" — including what the two review axes caught, which in four cases was a defect that would have reached the farm. The demo seed exercises every one of them: a ninety-day run books 44 Hasil payments, four Buying Trips, one Selling Trip of six head, three months of Herd Costs and ৳7,93,995 of valued fodder, and not one Money Event for a Harvest.
