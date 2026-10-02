# O — Quarantine that means something

Survey item O (`../survey.md`), settled with the Owner 2026-10-02. A bull off a haat lorry may carry FMD or lumpy skin
into a pen of thirty. The farm calls him "in Quarantine" for thirty days, but nothing keeps him apart, nothing makes
sure his arrival doses are given, and nothing lets him out if the one Release is passed over.

**What the app already does** (read from the code, 2026-10-02):

- **Quarantine is a State, not a place.** A **Pen** is a name in a Shed and nothing else (`schema/herd.ts:51-65`); an
  Intake takes any Pen (`routers/intake.ts:40-41`, 276-292) and its sheet offers every Pen of every Shed, dairy ones
  too (`routes/_auth/admin/intake.tsx:75-76`; the hint says "whichever pen it goes into, it starts in Quarantine"). A
  bought animal registered by hand in Quarantine takes any Pen as well (`domain/lifecycle.ts:57-62`,
  `routers/animals.ts:848-856`). A **Move** checks Scope, Side and Venture, never State against Pen
  (`entries/move.ts:46-75`, `herd-store.ts:444-510`). Pens are made and renamed by the Owner or the Manager
  (`routers/herd.ts:99-160`). The seed has a Pen named "কোয়ারেন্টিন পেন" (`seed/standing.ts:91`), by name only.
- **The arrival doses** — drench at 7 days, FMD and lumpy skin at 10, HS and BQ at 14, anthrax at 21 — are each raised
  once by his arrival (`standard-playbook.ts:793-1012`; cause `arrival:<animal>:+<days>`, `instances-store.ts:646-655`,
  `work-cause.ts:22-23`), one Instance per SOP per cause (`schema/instance.ts` `sop_instance_cause_uidx`). Each dose
  Step may be skipped "Unwell — to be given later" (`standard-playbook.ts:462`, 485); a skip records the dose not given
  (`effects/treatment.ts:231-236`) and **nothing raises it again**. **None of the dose procedures is adopted on the real
  farm yet**: they wait on the Vet's withdrawal days (`../../openfarm-go-live/README.md`, §1 and §5).
- **The Release** is raised once, thirty days after he entered Quarantine, by that State change
  (`standard-playbook.ts:1051-1092`; `instances-store.ts:676-686`). Its "Every drench and vaccine has been given" is a
  tick with nothing behind it (1075-1079); the Vet checks the work (1062). The Effect reads no doses and no Vet case
  (`effects/release.ts:34-107`). **A release Step skipped "Unwell — stays in quarantine", or an Instance closed
  Missed, is never raised again**: he stays in Quarantine, off the Ready list, until somebody notices.
- **A second door:** `setState` lets the Owner, the Manager or the Vet set Quarantine → Fattening by hand
  (`domain/lifecycle.ts:98-109` `statesSetByHand`, `routers/animals.ts:1013-1100`), with no Step and no walk to a band
  Pen. Not in the survey.

| #   | Ticket                                   | Blocked by |
| --- | ---------------------------------------- | ---------- |
| 01  | Quarantine pens, and Intake into one     | —          |
| 02  | Kept in until released                   | 01         |
| 03  | A Release put off is raised again        | —          |
| 04  | An arrival dose put off is raised again  | 03         |
| 05  | No Release while an arrival dose is owed | 04         |

**Settled with the Owner, 2026-10-02, and not to be re-asked:**

- **Pens can be marked as quarantine pens, by the Manager.** An Intake goes only into a quarantine pen; a bull in
  Quarantine cannot be moved out of them until released. A farm with no quarantine pen yet is told to mark one first.
- **An arrival dose skipped "Unwell — to be given later" is raised again after the farm's set days**, and the bull
  cannot be released from Quarantine while an arrival dose is still owed — **unless the Vet writes why it is not
  needed**.

**Settled in drafting** (the Owner may overrule):

- **Marked by the Owner or the Manager**, as Pens are made. **Unmarking a pen that holds a bull in Quarantine is
  refused.** An animal not in Quarantine may be walked into a quarantine pen (it may double as the sick pen); nothing
  refuses it.
- **Every door into Quarantine needs a quarantine pen**: the Intake and a bought animal registered by hand in
  Quarantine (the opening register included), one rule in `insertAnimal`.
- **The rule for a Move is "a bull in Quarantine is walked only into a quarantine pen"** — which keeps him in, and also
  lets a bull already standing elsewhere when this ships be walked in. **Bulls already in Quarantine in an unmarked pen
  are left where they stand**: nothing moves them, and the Pens page names them ("in Quarantine, not in a quarantine
  pen") for the Manager to walk. The Release walks a bull out after he is Fattening, so it is never refused.
- **A Release put off is raised again** — the release Step skipped (either reason) or the Instance closed Missed, while
  he is still in Quarantine — after **`put_off_days`, 7 by default, the Owner's or the Manager's to set**, again and
  again until he is out. **One Farm Parameter for doses and Releases put off**: both are "he is unwell, later".
- **Any skip of an arrival dose is raised again**, not only "Unwell — to be given later" (an empty bottle is later too),
  and an arrival dose closed Missed likewise; matched by the work, never by the skip's words. Work **Called Off** (the
  Owner retired the procedure) is not owed. A Campaign dose skipped in a Pen round and the tick spray are not arrival
  doses and are left as they are.
- **What is owed** is read from the work: an arrival-raised Instance whose Version gives a dose, due by now, with no
  dose given for him under that procedure (its raised-again work included), and not Excused by the Vet. **A farm with
  no dose procedure adopted owes nothing**, so the Release works as today until the Vet's days are in.
- **The by-hand door stays** (a farm that never adopted the Release needs a way out) **with the same owed-dose rule**;
  "a gate on one door and not the other is no gate" (`routers/animals.ts`, Ready for Sale).
- **An open Vet case does not block the Release**: not asked, and the Vet already checks the Release's work.
