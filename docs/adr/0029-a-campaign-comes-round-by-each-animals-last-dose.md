# A Campaign comes round by each animal's last dose

Date: 2026-10-14

Until now a Campaign — the herd's FMD vaccination, its deworming — had no Trigger at all. The Manager raised it for one
Pen at a time, and nothing reminded anybody that four months had gone by. A schedule could not say it: a schedule is
times of day and days of the week, and a time of day would have put the deworming on the shed's list every morning.
The flow survey of 2026-10-13 (G1) asked for herd health Campaigns that remember themselves.

## Decision

- A new Trigger, `every_months` — the **Campaign Interval** — written on a Campaign's procedure: whole months, one to
  twenty-four. The Playbook refuses it on a procedure that gives no dose of a named product to every animal it walks,
  because the interval is counted from that dose.
- **Counted per animal, by the product.** An animal's next dose falls due the interval after her last dose of the
  Campaign's product, whichever procedure gave it: a bull vaccinated for FMD on arrival last month is not due the herd's
  FMD this month. Never given it on the farm, she is counted from the later of her coming onto the farm and the
  interval coming into force: the oldest Version in the unbroken run that comes round at all, whatever its months — four
  put right to five is the same interval, and nobody starts counting again. **Not from today:** a farm
  adopting the interval, or a herd brought onto the app already vaccinated on paper, is not told every animal is due
  on its first day. The Manager raises the first Campaign by hand when the farm knows it is owed, and from then on the
  doses count.
- **Raised per Pen, once a round.** The day turns raise the Campaign in each Pen holding an animal the procedure
  concerns whose day has come — one piece of work per Pen, as a Campaign always was, so the work list, the Lot Number
  and sign-off are unchanged. It is not raised while the Campaign's own work already stands open in the Pen — raised by
  hand or by the turn; one animal's dose put off, raised for her alone, is hers and holds no Pen back. The work is keyed
  on the Pen and the **latest** day one of its animals came due: the same while the same animals are owed it, so
  however often the day turns a round is raised once, and **a round left Missed is not raised again by itself until a
  later day comes** — the rest of the Pen coming round, or another animal's day. Keyed on the earliest, one animal left
  undosed would pin the Pen to her old day and it would never come round again. Her own dose, put off, is raised for her
  alone, as before; and the Manager raises a Missed round from the list of those **Due for a Campaign**.
- **Not due on the walk.** An animal a Campaign's last dose of its product still covers — dosed within the interval —
  shows on the walk as «Not due — dosed {day}» and opens passed so: the farm's own reason «পাওনা নয় — আগেই দেওয়া»,
  offered on any Campaign's dose whatever the Version's own reasons. Passed so, she is owed nothing later — unlike a dose
  put off — and the farm refuses it (`dose_is_due`) for an animal whose dose has in fact come.
- **Due for a Campaign** is read on the Medicines page by the farm's own Vet and by those who raise the work — not by
  a vet called in for a visit, who sees only the animals on their cases (`visiting_vet`): every animal whose day has come
  or comes within a fortnight, with her last dose and her day, and «raised — waiting to be walked» where her Pen's
  Campaign already stands open. From there the Campaign is raised in the Pens of those whose day has come and whose Pen
  has none open.
- **Several Pens at once.** "Raise work now" takes a set of Pens, and every Pen, raising a piece of work in each — a
  Campaign over a whole shed is one act. A Pen where the same Campaign already stands open is passed over and counted
  apart (`openAlready`), never given a second copy beside the first.
- **The standard Playbook** gives its herd FMD vaccination and its deworming an interval of four months, the shorter end
  of DLS's four to six, so no animal is counted protected longer than the guidance allows. Lumpy skin, HS and BQ carry
  none: the Playbook's own words give no herd interval for them, and none is invented here. A farm that adopted the FMD
  or deworming procedure before this keeps its Version; the Owner adds the interval by publishing a new one, as with any
  change to a procedure (ADR 0001).

## Consequences

- The interval is the procedure's, not a Farm Parameter: changing it is a new Version, kept and dated like any other.
- What the turn raises depends on doses recorded in the app. A dose given on paper and never written is invisible to
  it; that is why the first Campaign is the Manager's to raise.
- One read a turn more than before whatever the herd's size — each animal's last dose of each Campaign's product —
  beside the animals the turn already reads, those who have left read out by the database; each animal is weighed by
  instants first, so only those near their day have their day worked out. Only when the farm has a Campaign that comes
  round.
