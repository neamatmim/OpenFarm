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
  interval coming into force (the oldest Version in the unbroken run that carries it). **Not from today:** a farm
  adopting the interval, or a herd brought onto the app already vaccinated on paper, is not told every animal is due
  on its first day. The Manager raises the first Campaign by hand when the farm knows it is owed, and from then on the
  doses count.
- **Raised per Pen, once a turn.** The day turns raise the Campaign in each Pen holding an animal the procedure concerns
  whose day has come — one piece of work per Pen, as a Campaign always was, so the work list, the Lot Number and
  sign-off are unchanged. The work is keyed on the Pen and the earliest day one of its animals came due: the same while
  the same animals are owed it, so however often the day turns it is raised once. It is not raised while the
  Campaign's work already stands open in the Pen, raised by hand or by the turn. **A Campaign left Missed is not raised
  again by itself**: its animals stay on the list of those **Due for a Campaign**, and the Manager raises it. An animal
  skipped as unwell is owed her dose alone, as before.
- **Due for a Campaign** is read on the Medicines page by the Vet and by those who raise the work: every animal whose
  day has come or comes within a fortnight, with her last dose and her day. From there the Campaign is raised in the
  Pens of those whose day has come.
- **Several Pens at once.** "Raise work now" takes a set of Pens, and every Pen, raising a piece of work in each — a
  Campaign over a whole shed is one act.
- **The standard Playbook** gives its herd FMD vaccination and its deworming an interval of four months, the shorter end
  of DLS's four to six, so no animal is counted protected longer than the guidance allows. Lumpy skin, HS and BQ carry
  none: the Playbook's own words give no herd interval for them, and none is invented here. A farm that adopted the FMD
  or deworming procedure before this keeps its Version; the Owner adds the interval by publishing a new one, as with any
  change to a procedure (ADR 0001).

## Consequences

- The interval is the procedure's, not a Farm Parameter: changing it is a new Version, kept and dated like any other.
- What the turn raises depends on doses recorded in the app. A dose given on paper and never written is invisible to
  it; that is why the first Campaign is the Manager's to raise.
- Two reads a turn whatever the herd's size — the animals, and each one's last dose of each Campaign's product — and
  only when the farm has a Campaign that comes round.
