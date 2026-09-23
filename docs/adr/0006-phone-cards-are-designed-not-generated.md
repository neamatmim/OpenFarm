---
status: accepted
date: 2026-09-23
---

# A list's phone card is designed for the phone, not generated from its table's columns

Every list is a table on a desk and a card on a phone, and the two draw the same facts with separate code, so a new column must be added twice and the card can lag behind the row. An architecture review proposed declaring each list's fields once — kind, how it sorts when empty, whether the card shows it — and drawing both from that. We decided against it. A card is not a narrower row: the Drug List's puts a product's name and standing on one line, its milk and meat days large beneath, then its stock and the Lot that goes off first, and leaves the low-stock level and the day it was last bought to the table, because a phone has room for what somebody standing at an animal needs and no more. Generated from fields, every card would become the same label-and-value list, which is the table again, only narrower.

What the two did share by copying is shared now instead: `components/list-cells.tsx` holds the empty dash and the date a row and a card both draw, and every list sorts an empty value last whichever way a column is sorted.

**Consequences**: a new column is still added to the card by hand, or deliberately left off it; the card's cells are built from the same pieces the table's are, so what they say about one fact cannot differ in how it looks. Revisit only if the cards stop being designed — if every card really is a list of labels and values — because then there is nothing to lose by generating them.
