# Tagging the herd and the opening register

The app cannot start until every animal on the farm has a Tag Number and a row in the opening
register. This is one walk through the sheds: catch each animal once, put the tag in, write the
row, take the photo, and move on.

## Before the walk

1. **Buy blank tags and a tag marker**, not pre-numbered stock. A lost tag is replaced with the
   _same_ number, so the farm must be able to write any number it likes.
2. **Set up the sheds and pens** in **Admin → Herd**, with the names the staff already use. The
   register names each animal's pen, and a row naming a pen the app does not have is refused.
3. **Print the sheet**, or open the template in a spreadsheet on a phone. The opening register's own
   sheet has **Download the template**: the columns, an example row, and the farm's own pens and
   breeds, each on a row beginning `#`, which the import passes over. `opening-register-template.csv`
   here is the same header alone.

## Numbering

- **`D-0001`, `D-0002`, …** for the dairy side, whether she was born here or bought.
- **`F-0001`, `F-0002`, …** for the fattening side.
- Count up within each side and never skip back. A gap does no harm, but a number used twice is
  refused.
- If this farm's app already holds a number (a test animal, say), start after it. The import
  refuses a number another animal has.

## The columns

| Column             | Needed                | What goes in it                                                                                                                                                                         |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag`              | yes, for this walk    | The number just written on her tag, e.g. `D-0014`. Left blank, the app gives the next number instead, and then the ear tag has to be written _after_ the import.                        |
| `sex`              | yes                   | `female` or `male`                                                                                                                                                                      |
| `side`             | yes                   | `dairy` or `fattening`                                                                                                                                                                  |
| `state`            | yes                   | dairy: `calf`, `heifer`, `pregnant_heifer`, `milking`, `dry` — fattening: `quarantine`, `fattening`, `ready_for_sale`                                                                   |
| `pen`              | yes                   | The pen's name as it is in the app. If two sheds have a pen of the same name, write `Shed/Pen`.                                                                                         |
| `source`           | yes                   | `born` (born on this farm) or `bought`                                                                                                                                                  |
| `breed`            | no                    | A breed on the farm's list (**Herd → Breeds**), in Bangla or English: `শাহীওয়াল ক্রস` or `Sahiwal cross`. A name not on the list is refused, so add the farm's own breeds there first. |
| `birth_date`       | no                    | `YYYY-MM-DD`. A guess is fine: the 1st of the month or year you think.                                                                                                                  |
| `calved_at`        | for `milking`         | When she last calved, `YYYY-MM-DD`. Without it the app cannot say how many days she has been in milk.                                                                                   |
| `expected_calving` | for `pregnant_heifer` | `YYYY-MM-DD`. Required for a pregnant heifer, and may be given for a `milking` or `dry` cow known to be in calf.                                                                        |
| `official_tag`     | no                    | Any government or project tag she already has.                                                                                                                                          |
| `alias`            | no                    | Her old name or mark, e.g. `লালি`. Several are separated with `;` — `লালি;7`. They are shown on her page; the app does not search by them.                                              |
| `lactation`        | no                    | For a `milking` or `dry` cow, the lactation she is in: `3` for a cow on her third. Left blank, her first. Any other animal is in none, so leave it blank or write `0`.                  |

A state has to belong to its side: a `dairy` row cannot be `fattening`.

`sex`, `side`, `state` and `source` may also be written as the screens say them, in Bangla or English and
in any case: `স্ত্রী`, `দুগ্ধ`, `দোহনে`, `কেনা`, or `Female`, `Dairy`, `Milking`, `Bought`.

A row with no `tag` whose `official_tag`, or whose `alias` with the same sex and side, is already on an
animal on the farm is refused: it is most likely a row imported before. A different animal who shares an
old mark comes in by writing the number on her ear tag.

## Putting it in

1. **Admin → Herd → Opening register**, choose the file, paste it, or paste the cells straight out of
   the spreadsheet. Up to 600 rows at a time.
2. **Check without importing** first: the app says how many rows would go in and lists every one it
   would refuse, by line number and reason, and takes nobody in.
3. **Import.** The app adds every row it can and lists the ones it refused. The refused rows do not
   change anybody else's number, and only they are left in the box, under the header: put them right
   there and import again.
4. Take each animal's photo from her page. Nothing reminds anybody about a missing photo, so do
   it on the walk, or keep a list.

## Done when

- The app's herd count matches a head count taken in the sheds on the same day, and the Owner
  has confirmed it.
- The DLS registration number, office, issue and expiry dates are entered, with a photo of the
  certificate.

Then close ticket 07: write the head count, and any animal that could not be sorted out, in its
Answer.
