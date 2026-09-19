# 14 — Shed hygiene and equipment can be charged to the animals

**What is wrong:** Story 45 names six things that must never be charged to an Animal: wages,
electricity, water, repairs, **shed hygiene** and **equipment**. Three of them are enforced. The last two
are not, and cannot be as the code stands, because there is no standard Category for either — so a farm
that wants to record shed washing or a new crush adds its own Category, and `mayBeChargedToAnimals` lets
the Owner mark any farm-added Category she likes.

The money this reaches is not the Farm's. A Herd Cost is split across the animals of its Side by the days
each stood, and a Venture's animals carry their share into the monthly **Reimbursement** and into the
**Settlement** every Investor is paid on. So a Category marked in error moves investors' capital.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) stories 45 and 46, and its line 21:
"Wages, utilities, repairs, shed hygiene, equipment and feed lost from the store stay the Farm's, and are
how the Farm earns its share." `CONTEXT.md` — **Herd Cost**, **Category**.

- [x] Shed hygiene and equipment are standard Categories, so a farm records them without inventing a name
- [x] Neither may be marked as charged to the animals, and the refusal says why
- [x] A farm that already exists gains both without anyone doing anything
- [x] The Owner meets it on a screen, in her own language, rather than as an English refusal

## Checked before starting

**Three documents say it and one of them is the code.** `CONTEXT.md`'s **Herd Cost** entry: "Shed
hygiene, wages, utilities, repairs and equipment are never Herd Costs: they are the place and the people,
and the Farm's." The schema comment on `money_category.chargedToAnimals`
(`packages/db/src/schema/money.ts:104`) says the same, naming shed hygiene explicitly. Spec story 45 names
all six. `NEVER_THE_ANIMALS` (`packages/api/src/money-store.ts:107`) holds three.

**Why the hole exists.** `mayBeChargedToAnimals` (`:118`) reads
`!(category.key !== null && NEVER_THE_ANIMALS.has(category.key))`. A farm-added Category has `key === null`,
so the guard passes it. That is right in itself — "a Vet visit that named nobody, lab tests, fly spray" are
exactly the farm-added ones the mark is for — but it means the protection only reaches Categories that
have a standard key, and hygiene and equipment have none. `CATEGORY_KEYS`
(`packages/db/src/schema/money.ts:68`) is the record sources plus wages, utilities, repairs, transport and
manure sales.

**Giving them keys is what closes it.** A standard Category carries a key, so `NEVER_THE_ANIMALS` can hold
it; and `isStandardName` (`money-store.ts:126`) then stops the farm adding its own Category under the same
Bangla name. Existing farms are covered without a migration by `missingStandardCategories` (`:138`), which
is what seeds a farm the standard ones it does not have yet.

**This does not close the door entirely, and should not.** A farm can still add a Category called
something else and mark it. The Owner decides for her own Categories — that is what the mark is — and the
lawyer and the Shariah scholar have been asked the policy question separately ([the adviser
questions](../../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md)).
What this ticket fixes is the narrower and plainly wrong thing: the two named items that three documents
say are never charged, and that nothing stops being charged.

**Story 46 is a different question and is not this ticket.** "Equipment bought because a Venture needed it
stays the Farm's" is about who owns the crush afterwards, not about which Category it goes under. Having an
equipment Category is a prerequisite for answering it, not an answer.

**`text(..., { enum })` is not a Postgres enum.** Drizzle types the column in TypeScript and leaves the
column as `text`, so adding a key needs no migration. Generate anyway and check that nothing is produced,
rather than assuming it.

## What was decided while building

**Keys, not a longer list of names.** The fix is that shed hygiene and equipment become standard
Categories — শেড পরিষ্কার and যন্ত্রপাতি — rather than that `NEVER_THE_ANIMALS` learns to recognise
names. A key is the only thing the guard can hold onto, and `isStandardName` then stops a farm adding its
own Category under the same Bangla name and marking that instead.

**The screen already did the right thing.** `money.categories` sends `chargeable`, and the row menu reads
it: opening the menu on যন্ত্রপাতি on the seeded farm offers "বাদ দিন" and nothing else. So the Owner
never meets a mark that could only ever be refused. The refusal itself is still worded, because it guards
the procedure whatever calls it, and it now names all five rather than three.

**An existing farm gains them by opening the screen.** `money.categories` seeds whatever standard
Categories a farm is missing on every call, so nothing had to be migrated or backfilled — confirmed on
the demo farm, which was seeded long before this.

**No migration, checked rather than assumed.** `text(..., { enum })` types the column in TypeScript and
leaves it `text`; `db:generate` said "No schema changes, nothing to migrate".

**The wider discretion was left alone, deliberately.** A farm can still add a differently-named Category
and mark it. That is what the mark is for — "a Vet visit that named nobody, lab tests, fly spray" are
exactly the farm-added ones — and whether the Owner's discretion should be bounded is a question for the
Shariah scholar, who has been asked it in writing. This ticket fixed only the plainly wrong part: two
items that three documents say are never charged, and that nothing stopped being charged.
