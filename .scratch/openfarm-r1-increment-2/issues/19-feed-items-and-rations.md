# 19 — Feed Items and a Ration per Pen

**What to build:** The Manager defines the farm's Feed Items in Bangla and gives each Pen a Ration: how many kg of each Item one animal in that Pen gets per day. Changing a Ration publishes a new Version of it, exactly like an SOP, so what a Pen was fed in March can still be shown in June. The target for one feeding is computed from the animals in the Pen at that moment, the Ration in force, and how often the Playbook feeds that Pen — nobody types a number the farm already knows.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user story 72.

- [x] Feed Items are created and retired by the Manager, Bangla required and English optional, like the Playbook
- [x] A Ration is named, versioned, and Pens are put on it; in-flight work reads the Version in force when it was raised
- [x] The target kg per Item for a session is derived from the animals in the Pen × kg per animal per day ÷ how often the Playbook feeds it, and is shown with its working
- [x] A Pen with no Ration is a state the screen names rather than a zero it displays
- [x] Tests cover deriving the target across a headcount change and a Ration Version change

**How it was built.**

- **A Ration is named and shared, not private to a Pen.** The first cut gave every Pen its own, which the glossary already ruled out — *"a named, versioned list … assigned to a Pen"* — and which the farm would feel: three milking pens on the same recipe means three copies to change and three chances to forget one. Pens are put on a Ration; changing it is one change.
- **The working is shown because a number nobody can check is a number nobody trusts.** `3 animals × 2.5 kg ÷ 2 a day`, in Bangla digits, beside the figure.
- **Which Ration, and which animals, are two different questions.** The Version is the one in force when the work was raised, because what the farm did has to stay explicable. The animals are always the animals standing in the Pen *now*, because they are who eats — a cow who arrived this morning is fed this evening. The first cut mixed the two and could answer with a figure that was never true on any day.
- **A Feed Item is retired, never removed**, and carries the unit it is measured in — straw comes in bales and molasses in litres, and a Ration line means whatever the Item says.
- **A Pen on no Ration says so.** It is something the Manager has not done yet, not a Pen whose animals are fed nothing.

**Review outcomes folded in.**

- **The screen lost the Manager's work in two ways.** Opening a Ration fed three times a day and changing one figure saved it at twice a day, because the form never read what was there. And a Ration naming a retired Feed Item dropped that line on the next save, silently, while the panel above still showed it. Both are fixed: the form starts from the Ration as it stands, and every Item the Ration already names is offered, retired or not.
- **The trail recorded a change that never happened.** Retiring a feed the farm does not have wrote an Audit Event saying it had been retired and returned success. It is looked up first, and neither write records an `after` without reading a `before`.
- **Any Staff member could read every Pen's Ration**, ignoring Pen Assignment, which the day's work has respected since increment 1.
- **Bangla-first broke on the one line that mattered**: the figure was rendered with Western digits and a literal "kg" beside a sentence that was already being formatted properly.
- Also: the Pen picker was labelled as the Ration; bad input for "times a day" was quietly rewritten to 1 instead of refused; a saved Ration refetched the entire app; and what comes out of the jsonb column is parsed now rather than asserted to be what it should be.

**Named, and written down.** "Feeding Target" is now a glossary entry, because **Target Window** was already Fattening's word and two targets in one system is how a spec stops being readable. The herd count in a Pen is the *animals* in it — "head" is on the Animal entry's own avoid list.

**Settled in ticket 20.** This shipped with "how often" stated on the Ration, beside a feeding SOP that would carry a schedule saying the same thing — two places to disagree, and a disagreement that feeds every bucket at the wrong size while the working still looks right. Ticket 20 removed the second place rather than checking the two against each other: the Ration is the recipe, and the schedule of the SOP that feeds is the only answer to how often. A Feeding Target therefore exists only once something in the Playbook actually feeds, which is the honest dependency.
