# 01 — What a Venture Statement is

**What to build:** The surface the three Investor papers sit on, built once so that the two that follow are each about their own content and nothing else.

An Investor has no login and never will. A paper is the whole of what the Farm tells him, so every one of the three carries the same four things whatever else is on it:

- The **Farm Identity** letterhead with the Registration number, as the fifteen Release 1 papers already print it.
- **One Investor, and no other.** Not his neighbour's name, not his neighbour's Units, not what anybody else was paid. The Farm's own management share is the single exception, because story 12 asks for it by name wherever an Investor's payout is shown.
- The footer, in Bangla and English: **no return is guaranteed, and a loss comes off capital.** On every sheet, every time — the terms are in front of him whenever he reads anything.
- **No projection.** Not a future weight, not a future price, not a return. Facts only: what was weighed, what was gained, how many days are left. The Farm's own screens project and will go on projecting; a paper an Investor keeps does not, because he will read it as a promise.

Generating one is an **Export** — an Audit Event in the same write, stamped with the farm, the Registration number, the time and the user, exactly as `papers.ts` does it today. The trail has to answer "what did we send that man, and when", so the Audit Event names the Investor, the Venture and which of the three papers it was.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 82–85, and the **Statements** decisions; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md); `CONTEXT.md` — **Export**, **Farm Identity**, **Registration**, **Investor**, **Venture**, **Unit**.

- [x] A word for these three papers is decided and written into `CONTEXT.md`, with what each of the three is and what they share
- [x] The letterhead, the one-Investor rule, the footer and the no-projection rule live in one place that all three papers take, not copied into each
- [x] The narrowing to one Investor happens on the server: what a procedure returns for one man never carries another man's name, Units, capital or payout, so no paper can leak by being assembled carelessly
- [x] Generating any of the three writes an Audit Event naming the Investor, the Venture and which paper it was
- [x] The Owner alone may generate one
- [x] A paper is refused for an Investor who has no Agreement with that Venture, rather than printing an empty one
- [~] Tests cover the Audit Event written for each of the three, the refusal for an Investor who is not in that Venture, the Manager refused, and a paper carrying the footer

## Checked before starting

**A paper in this farm is a plain multi-line string, and there is no PDF anywhere.** The writers live in `packages/domain/src/papers.ts` — `saleReceipt` (:59), `transportCard` (:120), `animalPassport` (:247), `withdrawalSummary` (:303), `accountantSummary` (:401), `registrationRecord` (:551), `herdSummary` (:589) — each taking values already formatted by its caller, because `@OpenFarm/domain` depends on nothing. Two primitives make every one of them: `field(bn, en, value)` → `` `${bn} / ${en}: ${value}` `` (`papers.ts:27`), and `farmOfOriginLines(farm)` (`packages/domain/src/farm.ts:93`), which is the letterhead and exists precisely so three copies of it cannot disagree. "PDF" in the spec means the browser's own print: `apps/web/src/components/paper.tsx` renders the text in a `<pre>` under an `@page { size: A4 }` rule with a Print button.

**Six steps to a new paper**, as the existing ones did it: the writer and its input type in `domain/src/papers.ts` and exported from the domain index; a `*-words.ts` helper if values need wording (`packages/api/src/paper-words.ts`); a router procedure that reads, calls `languageOf(db, actorId)`, formats with `formatDate`/`formatNumber`, calls the writer, writes the Export, returns `{ text }`; `assertRegistered(context.farm, "…")` where the Registration number is required (`export-store.ts:46`); the new id added to the **closed** `PaperId` union (`paper.tsx:7`, closed because the id is written straight into a stylesheet); and the web mutation, of which `apps/web/src/components/accountant-export.tsx:26-72` is the shortest example.

**There is no Export table.** An Export is an Audit Event with `action: "export"` and nothing else — the write passes `() => Promise.resolve()` because nothing changes. Two shapes exist and this ticket must pick one: `recordExport(context, report, period, extra)` (`export-store.ts:23`) files it under a synthetic `entity: "report"` and is what the period reports use; `exportedPaper(farm, paper, tagNumbers, extra)` (`routers/papers.ts:116`) files it against the **real entity** — `entity: "animal"`, `entityId: her.id` — and is what the per-subject papers use. A statement is about one Investor and one Venture, so the second shape fits: file it against the Venture or the Agreement and put the Investor in the snapshot. Either way the Registration number goes in, as both helpers already do.

Both helpers carry a closed union of paper names (`ExportedReport` at `export-store.ts:11`, and `exportedPaper`'s `paper` argument), and `exportedPaper`'s other field is `tagNumbers`, which is an Animal's. Widen what is there rather than adding a third helper beside them: one place that knows what an Export snapshot holds.

**Labels are literal `bn / en` pairs in the source, not i18n keys.** `packages/domain` has no dependency on `@OpenFarm/i18n`, so the message catalogue is unreachable from a paper writer; `field("ক্রেতা", "Buyer", …)` is the pattern, and `papers.ts:20` says why — the farm reads the Bangla and an outsider reads the English without anybody explaining the form. The registers do it the other way (`sayingIn(language).both(key)`, `registers/register.ts:143`) but their titles are still literal, deliberately, so that rewording a heading on a screen cannot retitle a paper the farm may have to produce years later. `languageOf(db, actorId)` (`reader-language.ts:6`) decides only the dates and digits.

**Nothing on the reading side is keyed on one Investor today, and the leak is one careless client away.** `ventures.agreements` and `ventures.movements` return every Investor on the Venture; `settlementOf`'s `Payout` rows carry every Investor's **name**; `investors.list` returns every Investor on the farm. Tickets 02 and 06 both need one man's own figures, so the narrowing is built here, once, rather than twice — and on the server, because a payload that reached the browser holding another man's payout has already left the farm whatever the paper printed.

**A router may not touch the database directly.** `packages/api/src/audit-guard.test.ts` scans every router source and fails on `context.db.insert/update/delete` or an opened transaction — everything goes through `audited`. A new statement procedure is read-plus-Export, so this is a constraint to know rather than to work around.

**The vocabulary needs deciding, and "Statement" is not free.** `CONTEXT.md` has no term for these three papers. It does list _statement_ under **Bank Check**'s _Avoid_, for the bank's own statement — a different real thing that also belongs to a Venture, and one the Settlement already refuses to close over. Whatever word is chosen has to be readable in a sentence beside "the bank's statement" without either being mistaken for the other. Say it in `CONTEXT.md` before writing it into code; see the three Bangla names the prototype settled — যোগদানপত্র, অগ্রগতি, হিসাব নিকাশ.

**Say Average Daily Gain in full.** `CONTEXT.md` lists "ADG on its own" under _Avoid_. The prototype ticket writes ADG throughout; the code and the papers should not.

## What was decided while building

**Built with ticket 02, because a surface with no paper on it cannot be tested.** This ticket's last criterion asked for the Audit Event of "each of the three", which only the three can prove — and the repo's testing decisions put the seam at the oRPC router, so shipping scaffolding with no procedure over it would have been untested code by construction. The যোগদানপত্র went in beside it and proves the surface end to end; the criterion is marked partial because the other two papers will each add their own Export test. Nothing about the surface is waiting on them.

**The word is Investor Statement**, and it was not a fresh choice: the spec's **Statements** section and the roles matrix row ("Investor statement — generate, issue, record acknowledgement") both already say it, and both are CONFIRMED by the Owner. `CONTEXT.md` now carries it with the three Bangla names, and says in its own last line what it is not — the bank's statement, which is what a **Bank Check** reads a month against. That was the collision this ticket flagged, and naming it inside the entry is what keeps the two readable side by side.

**`exportedPaper` moved out of `routers/papers.ts` and into `export-store.ts`,** beside `recordExport`, and lost its `tagNumbers` argument to a caller-supplied `extra`. The animals' papers keep their tags through a four-line `aboutAnimals` wrapper in the router that still says why the tags are there. One place now knows what an Export snapshot holds, which is what this ticket asked for rather than a third helper beside two.

**The narrowing is keyed on the Agreement, not the Investor** — `hisStanding(tx, farmId, agreementId)` in `investor-statement-store.ts`. That is the natural key for a paper (one man, one Venture, one set of frozen terms), and it also sidesteps the contradiction found while building: see the note on ticket 02.

**A test caught the percentages printing in Arabic numerals** in the middle of a Bangla sentence — `৬০%` was coming out `60%`. The fix was the reader's own formatter, and then a review pointed out the deeper version of the same thing: the reader is the *Owner at the screen*, and an English-preferring Owner would have printed `বিনিয়োগকারী 60%` and an English date inside a Bangla sentence. The seven terms are whole sentences a man reads for his own terms, so they pin Bangla whoever prints them, exactly as the transport card pins its own. The bilingual labels around them are unchanged. The wording moved to `investor-statement-words.ts`, beside `paper-words.ts`, because `routers/papers.ts` carries no Bangla and this router should not either.

**The shared surface got shared properly.** The first version exported the footer alone and let `joiningLetter` compose the letterhead itself, which a review correctly called out: the criterion asks for a surface the next two papers *take*, and what was there was one they would each have to remember. `investorStatement({ farm, title, body, producedBy, producedAt })` now wraps every statement in letterhead, title, body, footer — so none of the three can be written without the footer, which is the point of it.

**Refunds: a joining letter could say the Farm held money it had already sent back.** The capital read asked for `capital_in` alone, so an Agreement on a cancelled Venture — every taka refunded — still passed the "has capital arrived" check and printed a total. It now reads both kinds, prints a refund as its own line marked ফেরত, totals what the Farm actually holds, and refuses with `capital_returned` when that is nothing. A test walks a Venture called off for missing its Floor; removing the refund read turns that one test red and leaves the other ten green.

## Left as it is, on purpose

**No screen.** Neither this ticket nor 02 has a UI criterion, and none of increment 6's six tickets does — the papers are reachable through the API and recorded on the trail, but nobody can print one yet. `PaperId` in `apps/web/src/components/paper.tsx` is a closed union and would need an entry; adding one with no screen behind it would be three dead lines. The screens want a ticket of their own, and whoever writes it should know that a fortnight-old cached answer can reach it — see the Screens note in the release map.
