import type { AlertKind } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import type { ReviewReason } from "@OpenFarm/db/schema/review";

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

/**
 * Every kind of Notice the farm has, with the facts it carries and who hears it.
 *
 * The facts are typed per kind, and their names are the names already stored, so a Notice raised before this table
 * existed still reads. What each kind *says* is the wording's business (push, digest, SMS, the app's own list); what
 * it *carries* is here, once, where a new kind cannot be added without saying what it needs.
 */
export interface NoticeKind<Facts> {
  audience: Audience;
  /** True for the kind of Notice that is not finished until a person has decided: raising it writes the judgement
   *  owed beside it, under the reason its facts carry. */
  wantsJudgement?: true;
  /** What the thing is, as the trail and the screens name it — for the kinds that are always about one sort of thing.
   *  A Needs Review is about whatever was being put right, so it says so when it is raised. */
  entity?: string;
  /** Narrows `Facts` at the call site; never read. */
  readonly facts?: (facts: Facts) => void;
}

/** Work that is late, and the same work escalated to the Owner: named, placed, and dated. */
export interface WorkFacts {
  sopBn: string;
  sopEn: string;
  /** Null for work about the whole farm, which stands in no Pen. */
  pen: string | null;
  dueAt: string;
  minutesOverdue?: number;
}

/** What a Notice of each kind carries. The names are the farm's own and are what is stored. */
export interface NoticeFacts {
  instance_overdue: WorkFacts;
  instance_escalated: WorkFacts;
  instance_sent_back: WorkFacts & { reason: string };
  needs_review: Partial<WorkFacts> & {
    /** What the farm could not put right on its own. */
    reason: ReviewReason;
    stepId?: string;
    /** Why an Effect stood aside, for a Correction the farm has moved past. */
    because?: string;
    /** For an Entry the world moved past, or a phone whose clock or count is out: what it sent, and what the farm
     *  made of it. */
    kind?: string;
    seq?: number;
    why?: string;
    closedAt?: Date;
    count?: number;
    /** For a weighing nobody could have grown into: what the scale said, and what the farm found odd about it. */
    weightKg?: number;
    note?: string;
  };
  sop_published: { sopBn: string; number: number };
  sop_proposed: { sopBn: string; sopEn: string };
  withdrawal_ending: { tag: string; animalId: string; until: string };
  withdrawal_changed: { tag: string; until: string };
  notifiable_diagnosis: { tag: string; disease: string };
  low_stock: {
    feedItemId: string;
    nameBn: string;
    unit: string;
    onHand: number;
    threshold: number;
  };
  money_awaiting_approval: {
    moneyEventId: string;
    amountBdt: number;
    categoryBn: string;
    /** The English beside it, where the farm has one. */
    categoryEn: string | null;
  };
  registration_renewal_due: { expiresOn: string | null };
  entry_rejected: { count: number; reason: string };
}

/** The farm's own list of who hears what, beside the delivery table that says when. */
export const NOTICES: {
  [Kind in AlertKind]: NoticeKind<NoticeFacts[Kind]>;
} = {
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
  sop_proposed: { audience: [theOwner], entity: "sop_proposal" },
  // The Manager and the milkers of her Pen: they are the people who decide where tomorrow morning's litres go.
  withdrawal_ending: {
    audience: [theManagers, "thePeopleOfHerPen"],
    entity: "withdrawal",
  },
  withdrawal_changed: { audience: [theManagers], entity: "animal" },
  // The Manager takes the letter to the office and the Owner answers for the farm if it does not go.
  notifiable_diagnosis: {
    audience: [{ roles: ["owner", "manager"] }],
    entity: "diagnosis",
  },
  low_stock: { audience: [theManagers], entity: "stock_low" },
  money_awaiting_approval: { audience: [theOwner], entity: "money_event" },
  registration_renewal_due: { audience: [theOwner], entity: "sop_instance" },
  // Their own phone is holding the entries, so it is their own news.
  entry_rejected: { audience: ["whoseActItWas"], entity: "sync_batch" },
};

/** A Notice as it was raised, for whoever carries it out of the transaction to a pocket. */
export interface Raised {
  id: string;
  userId: string;
  kind: AlertKind;
  entity: string;
  entityId: string;
  params: Record<string, unknown>;
}

/** What raising one needs to know beyond its facts: which thing it is about, and — where the audience depends on it —
 *  the work or the person. */
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
}

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
  about: About
): Promise<string[]> => {
  const people: string[] = [];
  for (const part of audience) {
    // Sequential: each lot is a query, and there are one or two of them.
    // oxlint-disable-next-line no-await-in-loop
    people.push(...(await somePeople(tx, farmId, part, about)));
  }
  return [...new Set(people)];
};

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
  notice: { kind: Kind; about: About; facts: NoticeFacts[Kind] },
  now: Date
): Promise<Raised[]> => {
  const kind = NOTICES[notice.kind] as NoticeKind<NoticeFacts[Kind]>;
  const params = notice.facts as Record<string, unknown>;
  const entity = notice.about.entity ?? kind.entity ?? "";
  if (kind.wantsJudgement) {
    await writeTheJudgementOwed(
      tx,
      farmId,
      {
        entity,
        entityId: notice.about.id,
        reason: params.reason as ReviewReason,
        auditEventId: notice.about.auditEventId ?? "",
      },
      now
    );
  }
  const people = await peopleFor(tx, farmId, kind.audience, notice.about);
  const written = {
    kind: notice.kind,
    entity,
    entityId: notice.about.id,
    params,
  };
  const rows = await raiseAlerts(tx, farmId, people, written, now);
  return rows.map((row) => ({ ...row, ...written }));
};
