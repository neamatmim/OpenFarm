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
  /** One Receivable gone past its day: who owes it, what is still owing on it, and the first day it was late. */
  milk_unaccounted: {
    /** Litres gone in the week that nobody can account for. */
    litres: number;
    /** As a whole percent of what went into the tank. */
    percent: number;
    /** The farm day ("YYYY-MM-DD") the week began. */
    since: string;
  };
  medicine_short: {
    /** What the doses the count did not find had cost, to the taka. */
    shortMoney: number;
    /** The farm day ("YYYY-MM-DD") it was counted. */
    countedOn: string;
  };
  still_here_after_eid: {
    /** The first day of that Eid's Qurbani ("YYYY-MM-DD"), as the Farm kept it. */
    day: string;
    /** How many animals aimed at it are still on the Farm, the Farm's own and a Venture's together. */
    animals: number;
    /** How many of them are a Venture's, whose window moves only by an Amendment. */
    inVentures: number;
  };
  sold_under_cost: {
    tag: string;
    /** What she fetched. */
    priceMoney: number;
    /** What she had cost the farm, bought for and every charge on her, to the taka. */
    costMoney: number;
    /** Her weight on the day at the low price a kilo — her Venture's or the farm's market price; null while unset. */
    lowMoney: number | null;
    /** The kilos the low price was worked on, and whose they were: her last weighing less the farm's allowance, or the
     *  weight typed on the day. Missing from a notice told before the floor read her weighing. */
    floorKg?: number;
    floorFrom?: "scale" | "day";
  };
  entered_twice: {
    /** Who the money went to or came from. */
    name: string;
    amountMoney: number;
    /** The farm day ("YYYY-MM-DD") it was for. */
    day: string;
    /** Who entered it the second time, knowing. */
    by: string;
  };
  monthly_sum_missed: {
    ventureId: string;
    venture: string;
    investor: string;
    /** What he has missed altogether, his Units' sums past their seven days. */
    missedMoney: number;
    /** The farm day ("YYYY-MM-DD") the latest missed sum fell due. */
    dueOn: string;
  };
  /** Never what she cost: that is the Owner's, as every price is. */
  mortality_undiagnosed: {
    tag: string;
    kind: "died" | "culled";
    cause: string;
  };
  mortality_recorded: {
    tag: string;
    kind: "died" | "culled";
    /** The cause as the writer gave it. */
    cause: string;
    /** What she cost the farm, bought for and every charge on her, to the taka, when it was written. */
    costMoney: number;
    /** Whose she was, where she was a Venture's; nothing for the Farm's own. */
    venture: string | null;
  };
  large_shrink: {
    tag: string;
    /** Her last weighing on the farm, and the farm day it was. */
    lastKg: number;
    lastOn: string;
    /** What the sale's scale said. */
    saleKg: number;
    /** How much of her last weight she lost, to a tenth of a percent. */
    percent: number;
  };
  arrival_weight_short: {
    tag: string;
    /** Who the farm bought her from, as the Intake names them; empty where nobody wrote it down. */
    seller: string;
    /** What she weighed coming off the lorry, and at her first Weigh-in. */
    arrivalKg: number;
    weighedKg: number;
    /** How many days after she came the first Weigh-in was. */
    days: number;
    /** How far under, to a tenth of a percent. */
    percent: number;
  };
  cash_short: {
    /** Whose hand was counted. */
    name: string;
    /** How far the count came under what the farm said the hand held, to the taka. */
    shortMoney: number;
    /** The farm day ("YYYY-MM-DD") it was counted. */
    countedOn: string;
  };
  settings_changed: {
    /** Who changed them: the Manager, by name. */
    name: string;
    /** How many of the farm's settings the change named. */
    count: number;
  };
  feed_price_jump: {
    /** The Feed Item's Bangla name, as the store names it. */
    feed: string;
    /** Its English name, where the farm keeps one: an English reader is told in English. */
    feedEn?: string | null;
    /** The Feed Item's unit, said in the reader's language where it is read. */
    unit: string;
    /** What a unit of this purchase cost, to the paisa. */
    unitPriceMoney: number;
    /** What a unit of the last purchase before it cost. */
    previousUnitPriceMoney: number;
    /** How far it rose, to a tenth of a percent. */
    percent: number;
  };
  dose_not_prescribed: {
    tag: string;
    /** The product, as the Drug List names it in Bangla. */
    product: string;
    /** Its English name, where the Drug List keeps one. */
    productEn?: string | null;
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
    shortMoney: number;
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
  credit_after_write_off: {
    counterpartyId: string;
    buyer: string;
    /** What this Sale or Dispatch left him owing. */
    lentMoney: number;
    /** What stays written off of all he took, and the farm day the Owner last wrote any off. */
    writtenOffMoney: number;
    writtenOffOn: string;
  };
  receivable_overdue: {
    counterpartyId: string;
    buyer: string;
    owingMoney: number;
    /** The farm day ("YYYY-MM-DD") it first went overdue. */
    overdueFrom: string;
  };
  low_stock: {
    feedItemId: string;
    nameBn: string;
    nameEn?: string | null;
    unit: string;
    onHand: number;
    threshold: number;
  };
  money_awaiting_approval: {
    moneyEventId: string;
    amountMoney: number;
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
  reimbursement_due: {
    ventureId: string;
    venture: string;
    /** The month just over it owes for, "YYYY-MM": worded where it is read, in the reader's language. */
    month: string;
    /** What the transfer comes to: the month's own figure and every line it carries. */
    owedMoney: number;
  };
  /** `reason` is the server's own message, kept for the trail; `why` is what the notice says — missing from one raised
   *  before it was kept, which is said as `wrong`. */
  entry_rejected: {
    count: number;
    reason: string;
    why?: "wrong" | "not_yours";
  };
  /** When the Day Turning last turned whole, as an ISO instant: the screen says it in the reader's own date. */
  day_not_turning: { since: string };
  /** When a copy last succeeded — or, for a farm whose copies have never once worked, when the first was tried. */
  backup_overdue: { since: string };
  /** The monthly copy that failed: when it was tried. */
  monthly_copy_failed: { since: string };
  /** Work that went late while the farm's day was not turning, counted rather than told one by one. */
  work_missed: { count: number; since: string };
  /** One sign-in address guessed at: whose account it is, where the farm knows one, how many wrong passwords in the
   *  hour, and when the first of them came. */
  password_guessed: {
    login: string;
    name: string | null;
    guesses: number;
    since: string;
  };
  /** A Lot with something left in it, near its last day — or past it. What it is, which Lot, the day, and how much
   *  is left: a box of medicine counted in doses, a bag of feed in its Feed Item's unit. */
  lot_expiring: LotFacts;
  lot_expired: LotFacts;
  medicine_low_stock: {
    productId: string;
    name: string;
    nameEn?: string | null;
    onHand: number;
    threshold: number;
  };
  /** A dose given from the Lot that expires first while that Lot was already past its day. */
  expired_dose_given: {
    tag: string;
    name: string;
    nameEn?: string | null;
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
  /** An Investor saying, through the portal, that they sent money towards one of their Agreements (ADR 0018): who,
   *  which Venture, how much, the day and the way, as the note now stands. Kept up to date as the note changes. */
  pay_in_note_sent: {
    noteId: string;
    ventureId: string;
    venture: string;
    investor: string;
    amountMoney: number;
    /** The farm day ("YYYY-MM-DD") they say it went. */
    sentOn: string;
    way: "bank_transfer" | "cheque" | "deposit_slip" | "mobile_money";
  };
}

/** What a notice about a Lot carries. */
export interface LotFacts {
  what: "medicine" | "feed";
  itemId: string;
  name: string;
  /** Its English name, where the farm keeps one. */
  nameEn?: string | null;
  /** The Feed Item's unit; null for medicine, which is counted in doses. */
  unit: string | null;
  lotNumber: string | null;
  expiresOn: string;
  left: number;
}
