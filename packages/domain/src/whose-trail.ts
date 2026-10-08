/**
 * Whose each audited record's trail is: the farm's, which the Owner and the Manager read, or the Owner's alone.
 *
 * Every record the farm audits is named here, and an Audit Event can name no other, so a new kind of record is
 * written down as one or the other before it is ever written — a list of only the Owner's would let a new one
 * through to the Manager by saying nothing. The Owner's are who trusted the farm with money and on what paper, what
 * each Venture holds and made, and what the Owner prices the farm's animals and money at: the investors page, every
 * Venture's money and the returns refuse the Manager (roles matrix), and a trail that showed him every field of them
 * before and after would be the same pages by another door.
 */
export const WHOSE_TRAIL = {
  // Who is guessing at a sign-in is the Owner's, as the people who sign in are.
  password_guess: "owner",
  abortion: "farm",
  alert: "farm",
  animal: "farm",
  audit_event: "farm",
  backup_run: "farm",
  breed: "farm",
  buying_trip: "farm",
  diagnosis: "farm",
  dispatch: "farm",
  dls_report: "farm",
  drug_product: "farm",
  eid: "farm",
  eid_announcement: "farm",
  excused_dose: "farm",
  // The farm's settings: the Manager reads them, less the Owner's figures in them (`withoutTheOwnersFigures`).
  farm: "farm",
  farm_day: "farm",
  feed_in: "farm",
  feed_item: "farm",
  handover: "farm",
  intake: "farm",
  invite: "farm",
  lot: "farm",
  medicine_purchase: "farm",
  missing: "farm",
  money_category: "farm",
  money_event: "farm",
  mortality: "farm",
  needs_review: "farm",
  notifiable_disease: "farm",
  observation: "farm",
  pen: "farm",
  prescription: "farm",
  push_subscription: "farm",
  ration: "farm",
  ready_set_aside: "farm",
  receivable: "farm",
  receivable_payment: "farm",
  receivable_write_off: "farm",
  registration_certificate: "farm",
  repeat_breeder_answer: "farm",
  report: "farm",
  sale: "farm",
  scheduler_state: "farm",
  selling_trip: "farm",
  shed: "farm",
  shed_phone: "farm",
  sop: "farm",
  sop_instance: "farm",
  sop_proposal: "farm",
  sop_training: "farm",
  sop_version: "farm",
  step_completion: "farm",
  stock_low: "farm",
  store: "farm",
  sync_batch: "farm",
  sync_entry: "farm",
  treatment: "farm",
  user: "farm",
  vet_case: "farm",
  vet_fee: "farm",
  wage_draw: "farm",
  weigh_in: "farm",
  withdrawal: "farm",

  // Who put money in, on what paper, and who would receive it: the investors page.
  investor: "owner",
  investor_access: "owner",
  investment_agreement: "owner",
  nomination: "owner",
  agreement_offer: "owner",
  amendment_offer: "owner",
  nomination_offer: "owner",
  portal_consent: "owner",
  request_to_join: "owner",
  pay_in_note: "owner",
  paper_template: "owner",
  paper_template_version: "owner",
  // What each Venture holds, spends, buys across and made.
  venture: "owner",
  venture_plan: "owner",
  venture_movement: "owner",
  venture_settlement: "owner",
  venture_bank_check: "owner",
  internal_sale: "owner",
  // The Farm's own accounts in full, and what they held against their statements: the Owner's check, as a Venture's is.
  farm_account: "owner",
  farm_account_check: "owner",
  // What the Owner prices the farm's animals and money at: the returns.
  head_price: "owner",
  dairy_entry_price: "owner",
  bank_rate: "owner",
  // When the farm's years change: the Owner's to record, everyone's to read the years by.
  financial_year_change: "farm",
  fattening_joining: "owner",
} as const satisfies Record<string, "farm" | "owner">;

/** A kind of record the farm audits. */
export type AuditEntity = keyof typeof WHOSE_TRAIL;

/** The records whose trail is the Owner's alone. */
export const OWNERS_TRAIL = (Object.keys(WHOSE_TRAIL) as AuditEntity[]).filter(
  (entity) => WHOSE_TRAIL[entity] === "owner"
);
