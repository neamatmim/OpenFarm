import type { ReceivableTyped } from "./receivable";
import { NO_RECEIVABLE } from "./receivable";

// What the Dispatch sheet fills in once a milk buyer is picked: the terms of the last milk he took. Here rather than in
// the sheet, because which box is free to fill — and when the money is his to say — is easier read, and tested, apart.

/** A milk buyer as the farm's last Dispatch to him left him. */
export interface MilkBuyerTerms {
  name: string;
  address: string | null;
  phone: string | null;
  pricePerLiterMoney: number;
  /** Missing from an answer kept from before the farm said it: read as paying at the gate, as every buyer was. */
  paysLater?: boolean;
}

/** The boxes of the sheet a buyer's terms go into, as typed. */
interface TermsTyped {
  buyerAddress: string;
  buyerPhone: string;
  price: string;
}

/** A name as the farm compares it: one Unicode form, trimmed, whatever letters were capitalized. */
const compared = (name: string) => name.normalize("NFC").trim().toLowerCase();

/** The farm's milk buyer by the name typed, or nobody while it names none of them whole. */
export const buyerCalled = <Buyer extends MilkBuyerTerms>(
  buyers: readonly Buyer[],
  typed: string
): Buyer | null =>
  buyers.find((one) => compared(one.name) === compared(typed)) ?? null;

/** What his terms write into the sheet's boxes. */
const termsTyped = (buyer: MilkBuyerTerms): TermsTyped => ({
  buyerAddress: buyer.address ?? "",
  buyerPhone: buyer.phone ?? "",
  price: String(buyer.pricePerLiterMoney),
});

/** Owing all of it, nothing paid at the gate: a buyer who pays on his round. */
const OWES_IT_ALL: ReceivableTyped = {
  owed: true,
  paidNow: "0",
  promisedBy: "",
};

/** What his paying later or not says of the money. */
const receivableOf = (buyer: MilkBuyerTerms): ReceivableTyped =>
  buyer.paysLater === true ? OWES_IT_ALL : NO_RECEIVABLE;

const sameReceivable = (a: ReceivableTyped, b: ReceivableTyped) =>
  a.owed === b.owed && a.paidNow === b.paidNow && a.promisedBy === b.promisedBy;

/**
 * The sheet once this buyer is picked. A box is filled only where it is empty or still holds what the buyer picked before
 * put there, so nothing somebody typed is written over; and the money is his to say only while it is as the sheet opened,
 * or as the buyer before left it.
 */
export const withBuyerTerms = <Form extends TermsTyped>(
  form: Form,
  receivable: ReceivableTyped,
  buyer: MilkBuyerTerms,
  before: MilkBuyerTerms | null
): { form: Form; receivable: ReceivableTyped } => {
  const his = termsTyped(buyer);
  const theirs = before ? termsTyped(before) : null;
  const free = (box: keyof TermsTyped) =>
    form[box].trim() === "" || form[box] === theirs?.[box];
  const moneyFree =
    sameReceivable(receivable, NO_RECEIVABLE) ||
    (before !== null && sameReceivable(receivable, receivableOf(before)));
  return {
    form: {
      ...form,
      buyerAddress: free("buyerAddress") ? his.buyerAddress : form.buyerAddress,
      buyerPhone: free("buyerPhone") ? his.buyerPhone : form.buyerPhone,
      price: free("price") ? his.price : form.price,
    },
    receivable: moneyFree ? receivableOf(buyer) : receivable,
  };
};
