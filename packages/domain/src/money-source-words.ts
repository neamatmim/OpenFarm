import type { MessageKey } from "@OpenFarm/i18n";

/**
 * What each record a Money Event comes from is called, by the word the money book names it with — and the list of what
 * was changed after a month was closed, on the screen, the paper and the CSV alike — so the two never call one record
 * two things.
 */
export const MONEY_SOURCE_WORD = {
  dispatch: "money.from.dispatch",
  intake: "money.from.intake",
  buying_trip: "money.from.buyingTrip",
  selling_trip: "money.from.sellingTrip",
  sale: "money.from.sale",
  feed_in: "money.from.feedIn",
  medicine_purchase: "money.from.medicinePurchase",
  vet_fee: "money.from.vetFee",
  sale_broker: "money.from.saleBroker",
  wage_draw: "money.from.wageDraw",
  internal_sale_in: "money.from.internalSaleIn",
  internal_sale_out: "money.from.internalSaleOut",
  reimbursement: "money.from.reimbursement",
  settlement_adjustment: "money.from.settlementAdjustment",
  farm_share: "money.from.farmShare",
  farm_loss: "money.from.farmLoss",
  venture_made_good: "money.from.ventureMadeGood",
  venture_capital_out: "money.from.ventureCapitalOut",
  venture_capital_back: "money.from.ventureCapitalBack",
  venture_capital_return: "money.from.ventureCapitalReturn",
  receivable_payment: "money.from.receivablePayment",
  supplier_payment: "suppliers.payment",
  by_hand: "money.from.byHand",
} as const satisfies Record<string, MessageKey>;
