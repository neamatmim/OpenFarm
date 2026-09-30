import type { ReviewReason } from "./alerts";

// What a Notice of each kind carries: the facts it is raised with, stored as they were then, and read back by the
// words it says. Here rather than beside who hears it, because the farm's list and the phone both read them and
// neither may reach into the server for a type.

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
  /**
   * What the farm could not put right on its own, and whatever the thing being put right carried with it — a
   * corrected Step names its work and its Step, a late Entry what a phone sent, a doubted weighing what the scale
   * said. Five different things want a Manager's judgement, and what each of them has to show is its own.
   */
  needs_review: { reason: ReviewReason } & Record<string, unknown>;
  /** The English name beside it since 2026-09-23; a Notice raised before then has only the Bangla. */
  sop_published: { sopBn: string; sopEn?: string; number: number };
  sop_proposed: { sopBn: string; sopEn: string };
  /** A procedure taken out of force, or put back: its names, and which it is, for the way to its card. */
  sop_retired: { sopBn: string; sopEn: string; definitionId: string };
  sop_restored: { sopBn: string; sopEn: string; definitionId: string };
  withdrawal_ending: { tag: string; animalId: string; until: string };
  withdrawal_changed: { tag: string; until: string };
  notifiable_diagnosis: { tag: string; disease: string };
  /** One Baki gone past its day: who owes it, what is still owing on it, and the first day it was late. */
  milk_unaccounted: {
    /** Litres gone in the week that nobody can account for. */
    litres: number;
    /** As a whole percent of what went into the tank. */
    percent: number;
    /** The farm day ("YYYY-MM-DD") the week began. */
    since: string;
  };
  cash_short: {
    /** Whose hand was counted. */
    name: string;
    /** How far the count came under what the farm said the hand held, to the taka. */
    shortBdt: number;
    /** The farm day ("YYYY-MM-DD") it was counted. */
    countedOn: string;
  };
  feed_price_jump: {
    /** The Feed Item's Bangla name, as the store names it. */
    feed: string;
    /** The Feed Item's unit, said in the reader's language where it is read. */
    unit: string;
    /** What a unit of this purchase cost, to the paisa. */
    unitPriceBdt: number;
    /** What a unit of the last purchase before it cost. */
    previousUnitPriceBdt: number;
    /** How far it rose, to a tenth of a percent. */
    percent: number;
  };
  dose_not_prescribed: {
    tag: string;
    /** The product, as the Drug List names it in Bangla. */
    product: string;
    /** Who advised it and why, in the words of whoever recorded it. */
    advice: string;
  };
  head_count_differs: {
    pen: string;
    /** How many the person counting found standing in it. */
    counted: number;
    /** How many the register put there when it was counted. */
    expected: number;
  };
  pen_sores_seen: {
    pen: string;
    /** How many animals in it were seen with sores in the window. */
    animals: number;
    /** The farm day ("YYYY-MM-DD") the first of them was seen. */
    since: string;
  };
  store_shortfall: {
    /** What the count found missing, in taka at the store's average price when it was counted. */
    shortBdt: number;
    /** The farm day ("YYYY-MM-DD") the store was counted. */
    countedOn: string;
  };
  animal_missing: {
    tag: string;
    /** The Pen the round looked for her in. */
    pen: string;
    /** The farm day ("YYYY-MM-DD") the round could not find her. */
    since: string;
  };
  baki_overdue: {
    counterpartyId: string;
    buyer: string;
    owingBdt: number;
    /** The farm day ("YYYY-MM-DD") it first went overdue. */
    overdueFrom: string;
  };
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
  investor_statement_due: {
    ventureId: string;
    venture: string;
    /** How many Investors are waiting, so the Owner knows the size of the evening's post. */
    investors: number;
    /** Which occasion it is: a month as "YYYY-MM", or what happened — buying closing, the first Sale,
     *  the Wind-up Period starting. */
    occasion: string;
  };
  entry_rejected: { count: number; reason: string };
  /** When the Day Turning last turned whole, as an ISO instant: the screen says it in the reader's own date. */
  day_not_turning: { since: string };
  /** When a copy last succeeded — or, for a farm whose copies have never once worked, when the first was tried. */
  backup_overdue: { since: string };
  /** A Lot with something left in it, near its last day — or past it. What it is, which Lot, the day, and how much
   *  is left: a box of medicine counted in doses, a bag of feed in its Feed Item's unit. */
  lot_expiring: LotFacts;
  lot_expired: LotFacts;
  medicine_low_stock: {
    productId: string;
    name: string;
    onHand: number;
    threshold: number;
  };
  /** A dose given from the Lot that expires first while that Lot was already past its day. */
  expired_dose_given: {
    tag: string;
    name: string;
    lotNumber: string | null;
    expiresOn: string;
  };
  /** An invited Investor asking to join a Venture through the portal: who, which Venture, and how many Units as the
   *  Request now stands. Kept up to date as the Request changes, so it says what is waiting for an answer. */
  join_requested: {
    requestId: string;
    ventureId: string;
    venture: string;
    investor: string;
    units: number;
  };
}

/** What a notice about a Lot carries. */
export interface LotFacts {
  what: "medicine" | "feed";
  itemId: string;
  name: string;
  /** The Feed Item's unit; null for medicine, which is counted in doses. */
  unit: string | null;
  lotNumber: string | null;
  expiresOn: string;
  left: number;
}
