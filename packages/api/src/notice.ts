import { and, eq, inArray, isNotNull } from "@OpenFarm/db/operators";
import type { AlertKind } from "@OpenFarm/db/schema/alert";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { NoticeFacts } from "@OpenFarm/domain";

import {
  doersOf,
  holdersOf,
  peopleOfThePen,
  peopleOnTheWork,
  raiseAlerts,
} from "./alerts-store";
import type { Tx } from "./audit";
import { writeTheJudgementOwed } from "./review-store";

// One thing the farm tells a person (the glossary's Notice): what facts it carries, who hears it, and — for the kind
// that is not finished until somebody decides — the queue row that goes with it. One place, so that a kind cannot be
// raised with facts nobody reads, told to the wrong people, or written and never delivered.

/** The work a Notice about a piece of work is about, as its audience is worked out from. */
export interface TheWork {
  id: string;
  penId: string | null;
  assignedRole: RoleName;
  assignedTo: string | null;
  claimedBy: string | null;
}

/** One lot of people a Notice reaches. Named as the farm names them, and worked out when it is raised. */
export type AudiencePart =
  /** Everyone holding one of these Roles. */
  | { readonly roles: readonly RoleName[] }
  /** The people the work is on: whoever claimed or was given it, or else the Role it was assigned to. */
  | "thePeopleOnTheWork"
  /** Whoever actually did it, for news the doer has to have. */
  | "whoeverDidIt"
  /** Whoever works the Pen the Notice is about — the milkers who decide where her litres go. */
  | "thePeopleOfHerPen"
  /** Whoever does this work: the Role the procedure is assigned to. */
  | "whoDoesThisWork"
  /** The person whose own act it was — a phone told its entries were refused. */
  | "whoseActItWas";

/** Who hears a kind of Notice: one lot of people, or several together. */
export type Audience = readonly AudiencePart[];

const theManagers = { roles: ["manager"] } as const;
const theOwner = { roles: ["owner"] } as const;
const theVet = { roles: ["vet"] } as const;

/**
 * Every kind of Notice the farm has, with the facts it carries and who hears it.
 *
 * The facts are typed per kind, and their names are the names already stored, so a Notice raised before this table
 * existed still reads. What each kind *says* is the wording's business (push, digest, SMS, the app's own list); what
 * it *carries* is here, once, where a new kind cannot be added without saying what it needs.
 */
export interface NoticeKind {
  audience: Audience;
  /** True for the kind of Notice that is not finished until a person has decided: raising it writes the judgement
   *  owed beside it, under the reason its facts carry. */
  wantsJudgement?: true;
  /** Left out: whoever wrote the thing it is about. A person is not told what they have just written themselves. */
  leavesOutTheWriter?: true;
  /** Never told to the Owner for want of its own people: the Owner hears of the same thing by another kind already. */
  noOwnerFallback?: true;
  /** What the thing is, as the trail and the screens name it — for the kinds that are always about one sort of thing.
   *  A Needs Review is about whatever was being put right, so it says so when it is raised. */
  entity?: string;
}

/** The farm's own list of who hears what, beside the delivery table that says when. */
export const NOTICES: Record<AlertKind, NoticeKind> = {
  // The Manager, and whoever the work is actually on: work nobody has picked up is exactly the work that goes late.
  instance_overdue: {
    audience: [theManagers, "thePeopleOnTheWork"],
    entity: "sop_instance",
  },
  // The one rung of escalation: work still open after the window is the Owner's to know about.
  instance_escalated: { audience: [theOwner], entity: "sop_instance" },
  // Sent back to whoever did it: work reappearing on a list with no reason anywhere is how people stop trusting it.
  instance_sent_back: { audience: ["whoeverDidIt"], entity: "sop_instance" },
  // The Manager's to settle, with their judgement recorded; the Owner reads it on their own exception list.
  needs_review: { audience: [theManagers], wantsJudgement: true },
  // Whoever does the work it changes, and nobody else: a procedure the milkers run is not the Vet's news.
  sop_published: { audience: ["whoDoesThisWork"], entity: "sop_version" },
  // A change somebody wants made to the Playbook is the Owner's to accept or not.
  sop_proposed: { audience: [theOwner], entity: "sop_proposal" },
  // Whoever does its work: it is their list it leaves, or comes back to. About the act, not the procedure, so a
  // procedure retired a second time is told a second time.
  sop_retired: { audience: ["whoDoesThisWork"], entity: "audit_event" },
  sop_restored: { audience: ["whoDoesThisWork"], entity: "audit_event" },
  // The Manager and the milkers of her Pen: they are the people who decide where tomorrow morning's litres go.
  withdrawal_ending: {
    audience: [theManagers, "thePeopleOfHerPen"],
    entity: "withdrawal",
  },
  // A hold starting or being cut short changes where tomorrow's milk goes, which is the Manager's to know.
  withdrawal_changed: { audience: [theManagers], entity: "animal" },
  // The Manager takes the letter to the office and the Owner answers for the farm if it does not go.
  notifiable_diagnosis: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "diagnosis",
  },
  // The store is the Manager's to keep filled.
  low_stock: { audience: [theManagers], entity: "stock_low" },
  // Money over the farm's threshold waits for the Owner, and nobody else can say yes to it.
  money_awaiting_approval: { audience: [theOwner], entity: "money_event" },
  // The Registration is in the Owner's name, and renewing it is theirs to do.
  registration_renewal_due: { audience: [theOwner], entity: "sop_instance" },
  // Whose money it is, is the Owner's business and nobody else's — the Manager reads a Venture's
  // figures but never its Investors. And producing the paper is the Owner's act besides.
  investor_statement_due: { audience: [theOwner], entity: "venture" },
  // Their own phone is holding the entries, so it is their own news.
  entry_rejected: { audience: ["whoseActItWas"], entity: "sync_batch" },
  // The farm's own machinery is the Owner's: she holds every root credential, and the Manager cannot reach the
  // server, the database or the backups to put either right (deploy runbook).
  day_not_turning: { audience: [theOwner], entity: "scheduler_state" },
  backup_overdue: { audience: [theOwner], entity: "backup_run" },
  // Who signs in to the farm, and whether somebody is guessing at it, is the Owner's.
  password_guessed: { audience: [theOwner], entity: "password_guess" },
  // The store is the Manager's to keep, and what is going off in it with it — the same as what is running low.
  lot_expiring: { audience: [theManagers], entity: "lot" },
  lot_expired: { audience: [theManagers], entity: "lot" },
  medicine_low_stock: { audience: [theManagers], entity: "drug_product" },
  // The Vet answers for what was given to an animal, and the Manager for the box it came out of.
  expired_dose_given: {
    audience: [theManagers, { roles: ["vet"] }],
    entity: "treatment",
  },
  // Who has asked to put money in is the Owner's business alone, as every Investor is: the Manager reads no Request
  // (ADR 0008). Work waiting for her, not a Needs Review, which is the system unable to settle something.
  join_requested: { audience: [theOwner], entity: "request_to_join" },
  // Money an Investor says they sent is the Owner's to look for in the Venture Account and record: hers alone, as every
  // Investor's money is (ADR 0018).
  pay_in_note_sent: { audience: [theOwner], entity: "pay_in_note" },
  // The Manager rings the buyer; the Owner answers for whom the farm lends to. About the one Sale or Dispatch gone past
  // its day, so each is told once however many mornings it stays late.
  receivable_overdue: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "receivable",
  },
  // Lending again to a buyer the Owner wrote off is the Owner's to hear; about the Sale or the Dispatch, so it is told
  // once (the Owner, 2026-10-07).
  credit_after_write_off: {
    audience: [theOwner],
    entity: "receivable",
  },
  // The Manager walks the farm for her; the Owner answers for an animal gone, and a Venture's is Investors' money. Each
  // Missing told once, however many mornings the round cannot find her.
  animal_missing: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "missing",
  },
  // The Owner signs the count off and asks where the feed went; the Manager answers for the store. About the one
  // count, so a count put right is not told again.
  store_shortfall: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "step_completion",
  },
  // The Manager rings the Vet and keeps the Pen shut; the Owner answers for the herd. About one Pen and the first
  // sighting in the window, so a Pen is told once however many more are seen in it.
  pen_sores_seen: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "pen",
  },
  // The Owner asks where the milk went; the Manager answers for the tank. About the farm day it was read on, so it is
  // said once an evening while the week stays over the line.
  milk_unaccounted: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "farm_day",
  },
  // The Manager walks the Pen and counts again; an animal gone is told to the Owner once the Manager marks her Missing
  // (the Owner, 2026-09-29). About the evening's work for the Pen, which the Manager opens to count again.
  // The Vet answers for every Withdrawal: a dose nobody prescribed is theirs to see, and to shorten or lengthen.
  dose_not_prescribed: {
    audience: [theVet],
    entity: "treatment",
  },
  head_count_differs: {
    audience: [theManagers],
    entity: "sop_instance",
  },
  // The settings are how the farm runs, and the Manager keeps most of them: the Owner hears of each change he makes. About
  // the one change, so each is told once.
  settings_changed: {
    audience: [theOwner],
    entity: "farm",
  },
  // The Owner asks why; the Manager bought it. About the one arrival, so it is told once however often it is put right.
  feed_price_jump: {
    audience: [theOwner],
    entity: "feed_in",
  },
  // The Owner asks the Manager who bought him; about the Intake, so a reading put right is not told again.
  arrival_weight_short: {
    audience: [theOwner],
    entity: "intake",
  },
  // The Owner asks the Manager what happened on the way; about the Sale, so a Correction does not tell it twice.
  large_shrink: {
    audience: [theOwner],
    entity: "sale",
  },
  // A death or a cull is the Owner's to hear at once, unless she wrote it; about the Mortality, so told once.
  mortality_recorded: {
    audience: [theOwner],
    entity: "mortality",
    leavesOutTheWriter: true,
  },
  // A death no Diagnosis was named for is every Vet's to look at, unless the Vet wrote it; about the Mortality, once.
  mortality_undiagnosed: {
    audience: [theVet],
    entity: "mortality",
    leavesOutTheWriter: true,
    // With no Vet, the Owner already hears of the death itself (`mortality_recorded`).
    noOwnerFallback: true,
  },
  // The Owner signs the count off and asks where the cash went; the Manager counted it. About the one count, so a count
  // put right is not told again.
  cash_short: {
    audience: [theOwner],
    entity: "step_completion",
  },
  // Who has paid into a Venture is the Owner's business alone, as every Investor is; she rings him, and no other
  // Investor hears. About one Agreement's month, so each missed month is told once however many mornings it stays so.
  monthly_sum_missed: { audience: [theOwner], entity: "monthly_sum" },
  // The Venture Account is the Owner's, and so is the transfer out of it; about the Venture and the month, told once.
  reimbursement_due: { audience: [theOwner], entity: "venture" },
  // The Owner asks the Manager tomorrow whether it was two bills; about the second entry, told once.
  // The Owner asks the Manager, who both buys the medicine and counts it; about the count, told once.
  medicine_short: {
    audience: [theOwner],
    entity: "step_completion",
  },
  // The next market is the Owner's and the Manager's to choose; about the Eid, so it is told once.
  still_here_after_eid: {
    audience: [theOwner, theManagers],
    entity: "eid",
  },
  // Her cost is the Owner's alone to read; about the Sale, so a Correction does not tell it twice.
  sold_under_cost: {
    audience: [theOwner],
    entity: "sale",
  },
  entered_twice: {
    audience: [theOwner],
    entity: "money_event",
  },
};

/** A Notice as it was raised, for whoever carries it out of the transaction to a pocket. */
export interface Raised {
  /** The Alert row itself, so what became of telling somebody is recorded against it. */
  id: string;
  userId: string;
  kind: AlertKind;
  entity: string;
  entityId: string;
  params: Record<string, unknown>;
}

/** The kinds of Notice that are not finished until a person has decided. */
type WantsJudgement = "needs_review";

/** What raising one needs to know beyond its facts: which thing it is about, and — where the audience depends on it —
 *  the work or the person. A kind that wants a person's judgement must also say which Audit Event raised it and what
 *  sort of thing it is about: the queue row is written from both, and neither can be worked out here. */
export type AboutFor<Kind extends AlertKind> = Kind extends WantsJudgement
  ? About & { entity: string; auditEventId: string }
  : About;

export interface About {
  /** The thing the Notice is about, as the screens and the trail name it. One per thing per kind. */
  id: string;
  /** What sort of thing that is, for a kind that can be about more than one — a Needs Review about a Step, an Entry,
   *  a weighing. Taken from the kind when it is left out. */
  entity?: string;
  /** The work, for a kind whose audience is the people on it or whoever did it. */
  work?: TheWork;
  /** The person, for a kind that is somebody's own news. */
  person?: string;
  /** Her Pen, for a kind the people who work it hear. */
  penId?: string | null;
  /** The Role a procedure is assigned to, for news its doers hear. */
  assignedRole?: RoleName;
  /** The Audit Event that raised it, which a judgement owed is read back from either end. */
  auditEventId?: string;
  /** Who wrote the thing it is about, for a kind that leaves them out. */
  writtenBy?: string;
}

/**
 * What one sweep has already looked up. Telling a hundred cows' Managers is one question, not a hundred: the answer is
 * the same for every Notice in the same act, and the sweep runs whenever anybody opens the app.
 */
export type Remembered = Map<string, string[]>;

/** Made once for a run of tellings, so the people each lot names are looked up once between them. */
export const rememberingPeople = (): Remembered => new Map();

/** What this lot of people is, as one telling asks for them: the same question twice is the same answer. */
const asked = (part: AudiencePart, about: About): string | null => {
  if (typeof part !== "string") {
    return `roles:${[...part.roles].toSorted().join(",")}`;
  }
  if (part === "thePeopleOfHerPen") {
    return about.penId ? `pen:${about.penId}` : null;
  }
  if (part === "whoDoesThisWork") {
    return about.assignedRole ? `roles:${about.assignedRole}` : null;
  }
  // The people on one piece of work, or whoever did it, are that work's own — a different answer every time.
  return null;
};

const somePeople = async (
  tx: Tx,
  farmId: string,
  part: AudiencePart,
  about: About
): Promise<string[]> => {
  if (typeof part !== "string") {
    return await holdersOf(tx, farmId, part.roles);
  }
  if (part === "whoseActItWas") {
    return about.person ? [about.person] : [];
  }
  if (part === "thePeopleOfHerPen") {
    return about.penId ? await peopleOfThePen(tx, farmId, about.penId) : [];
  }
  if (part === "whoDoesThisWork") {
    return about.assignedRole
      ? await holdersOf(tx, farmId, [about.assignedRole])
      : [];
  }
  if (!about.work) {
    return [];
  }
  return part === "whoeverDidIt"
    ? await doersOf(tx, farmId, about.work)
    : await peopleOnTheWork(tx, farmId, about.work);
};

/** Everyone a kind of Notice reaches, each lot of them worked out and counted once. */
const peopleFor = async (
  tx: Tx,
  farmId: string,
  audience: Audience,
  about: About,
  remembering: Remembered
): Promise<string[]> => {
  const people: string[] = [];
  for (const part of audience) {
    const question = asked(part, about);
    const answered = question === null ? undefined : remembering.get(question);
    // Sequential: each lot is a query, and there are one or two of them.
    // oxlint-disable-next-line no-await-in-loop
    const lot = answered ?? (await somePeople(tx, farmId, part, about));
    if (question !== null) {
      remembering.set(question, lot);
    }
    people.push(...lot);
  }
  return [...new Set(people)];
};

/** Raises again, as new, the notices of this about these people have dismissed: what comes back is what was raised. */
const raiseAgain = async (
  tx: Tx,
  farmId: string,
  people: readonly string[],
  written: {
    kind: AlertKind;
    entityId: string;
    params: Record<string, unknown>;
  },
  now: Date
): Promise<{ id: string; userId: string }[]> =>
  people.length === 0
    ? []
    : await tx
        .update(alert)
        .set({
          dismissedAt: null,
          carriedAt: null,
          createdAt: now,
          params: written.params,
        })
        .where(
          and(
            eq(alert.farmId, farmId),
            eq(alert.kind, written.kind),
            eq(alert.entityId, written.entityId),
            inArray(alert.userId, [...people]),
            isNotNull(alert.dismissedAt)
          )
        )
        .returning({ id: alert.id, userId: alert.userId });

/** Of these people, those not disabled. */
const stillHere = async (
  tx: Tx,
  userIds: readonly string[]
): Promise<string[]> => {
  if (userIds.length === 0) {
    return [];
  }
  const gone = await tx.query.user.findMany({
    where: { id: { in: [...userIds] }, disabledAt: { isNotNull: true } },
    columns: { id: true },
  });
  const left = new Set(gone.map((one) => one.id));
  return userIds.filter((one) => !left.has(one));
};

/** Whether a kind's people, all gone, leave it to the Owner: not news about one person's own act or work. */
const fallsToTheOwner = (audience: Audience) =>
  !audience.some((one) => one === "whoseActItWas" || one === "whoDoesThisWork");

/**
 * Tells the farm's people one thing, once.
 *
 * Who hears it is the kind's to say, not the caller's. A kind that is not finished until somebody decides writes the
 * Manager's queue row in the same act, so a judgement owed and the notice about it cannot come apart. What comes back
 * is what was actually written — nothing on a second raising of the same thing — for the request to carry to a pocket
 * once its transaction has closed, which is the only place a push may happen.
 */
export const tell = async <Kind extends AlertKind>(
  tx: Tx,
  farmId: string,
  notice: { kind: Kind; about: AboutFor<Kind>; facts: NoticeFacts[Kind] },
  now: Date,
  /** What this telling has already looked up, when it is one of many in a sweep. */
  remembering: Remembered = new Map()
): Promise<Raised[]> => {
  const kind = NOTICES[notice.kind];
  const about: About = notice.about;
  const entity = about.entity ?? kind.entity ?? "";
  if (kind.wantsJudgement) {
    const judgement = notice.facts as NoticeFacts[WantsJudgement];
    await writeTheJudgementOwed(
      tx,
      farmId,
      {
        entity,
        entityId: about.id,
        reason: judgement.reason,
        // Required of a kind that wants a judgement, so there is always one to write.
        auditEventId: about.auditEventId ?? "",
      },
      now
    );
  }
  const params = notice.facts as Record<string, unknown>;
  // Only people still at the farm: one the Owner has disabled holds their Roles on paper, to be given back, but is
  // nobody to tell — and counted, they kept the Owner from hearing what was theirs.
  const everyone = await stillHere(
    tx,
    await peopleFor(tx, farmId, kind.audience, about, remembering)
  );
  const named =
    kind.leavesOutTheWriter && about.writtenBy
      ? everyone.filter((one) => one !== about.writtenBy)
      : everyone;
  // Nobody of its people on the farm — the Vet gone, no Manager yet — and it still reaches somebody: the Owner, who is
  // always there (the Owner, 2026-10-06). Never for news only one person's own act or work is about. Once raised it is
  // told, so the sweep that asks what is untold stops raising it again on every turn.
  const people =
    // Its people gone, not only the writer left out of them: news of one's own act is still nobody's.
    everyone.length === 0 &&
    !kind.noOwnerFallback &&
    fallsToTheOwner(kind.audience)
      ? await peopleFor(tx, farmId, [theOwner], about, remembering)
      : named;
  const written = {
    kind: notice.kind,
    entity,
    entityId: about.id,
    params,
  };
  // A judgement owed again on a record whose last notice was read and dismissed is new work for the Manager: the notice
  // is raised again rather than dropped by the once-only index, or the second review waits on a list nobody is pointed at.
  const reopened = kind.wantsJudgement
    ? await raiseAgain(tx, farmId, people, written, now)
    : [];
  const rows = await raiseAlerts(tx, farmId, people, written, now);
  return [...reopened, ...rows].map((row) => ({ ...row, ...written }));
};
