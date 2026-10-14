import { sameName } from "@OpenFarm/domain";

import type { ReceivableTyped } from "./receivable";
import { NO_RECEIVABLE } from "./receivable";

// What the Dispatch sheet fills in once a milk buyer is named: the terms of his recent milk. Here rather than in the
// sheet, because which box is free to fill — and when the money is his to say — is easier read, and tested, apart.

/** A milk buyer as the farm's recent Dispatches to him left him. */
export interface MilkBuyerTerms {
  name: string;
  address: string | null;
  phone: string | null;
  /** His last price at the gate; nothing where all his milk went with its price to follow. */
  pricePerLiterMoney: number | null;
  /** Whether he takes his milk on credit, as most of his recent Dispatches did. Missing from an answer kept from before
   *  the farm said it: read as paying at the gate, as every buyer was. */
  paysLater?: boolean;
  /** Whether his last milk went with its price to follow, for his statement to set. Missing from an answer kept from
   *  before the farm said it: read as priced at the gate, as every buyer's was. */
  priceToFollow?: boolean;
}

/** The boxes of the sheet a buyer's name and terms go into, as typed. */
interface TermsTyped {
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  price: string;
}

/** What is typed of the buyer and the money, and the buyer whose terms are in the boxes, if any. */
export interface BuyerTyping<Form extends TermsTyped> {
  form: Form;
  receivable: ReceivableTyped;
  /** The buyer whose terms filled the sheet, so naming another — or nobody the farm knows — takes them back out. */
  filledFrom: MilkBuyerTerms | null;
  /** Sent with its price to follow, for the buyer's statement to set: no price, nothing paid. */
  priceToFollow: boolean;
}

/** Nothing said of the money, and nobody's terms in the boxes: the sheet as it opens. */
export const NOBODY_PICKED = {
  receivable: NO_RECEIVABLE,
  filledFrom: null,
  priceToFollow: false,
};

/** The farm's milk buyer by the name typed, compared as the farm compares names, or nobody while it names none whole. */
export const buyerCalled = <Buyer extends MilkBuyerTerms>(
  buyers: readonly Buyer[],
  typed: string
): Buyer | null => buyers.find((one) => sameName(one.name, typed)) ?? null;

/** What a buyer's terms write into the boxes; nobody's, nothing. */
const termsTyped = (buyer: MilkBuyerTerms | null) => ({
  buyerAddress: buyer?.address ?? "",
  buyerPhone: buyer?.phone ?? "",
  price:
    buyer?.pricePerLiterMoney === null || buyer === null
      ? ""
      : String(buyer.pricePerLiterMoney),
});

/**
 * Whether milk may go to him with its price to follow: a buyer who takes his milk on credit, or one the farm does not
 * know yet, whose terms the sheet sets now. One who pays at the gate is priced at the gate, as the farm insists.
 */
export const mayFollow = (buyer: MilkBuyerTerms | null): boolean =>
  buyer === null || buyer.paysLater === true;

/** Whether his milk goes with its price to follow: his last did, and he takes his milk on credit; nobody's, not. */
const toFollowOf = (buyer: MilkBuyerTerms | null): boolean =>
  buyer?.priceToFollow === true && buyer.paysLater === true;

/** All of it on credit, nothing paid at the gate: a buyer who takes his milk on credit and pays on his round. */
const ALL_ON_CREDIT: ReceivableTyped = {
  owed: true,
  paidNow: "0",
  promisedBy: "",
};

/** What a buyer's taking it on credit or not says of the money; nobody's, nothing. */
const receivableOf = (buyer: MilkBuyerTerms | null): ReceivableTyped =>
  buyer?.paysLater === true ? ALL_ON_CREDIT : NO_RECEIVABLE;

const sameReceivable = (a: ReceivableTyped, b: ReceivableTyped) =>
  a.owed === b.owed && a.paidNow === b.paidNow && a.promisedBy === b.promisedBy;

/**
 * The sheet once the buyer's name reads as it now does. Where it names a buyer the farm knows other than the one whose
 * terms are in the boxes — or names nobody the farm knows, after one did — that one's terms go back out and this one's
 * go in: a box only where it is empty or still holds what the buyer before put there, so nothing somebody typed is
 * written over; and the money only while it is as the sheet opened or as the buyer before left it. A name typed before
 * the farm's buyers had answered is the same: asked again once they do, it fills the boxes nobody typed in.
 */
export const afterNaming = <Form extends TermsTyped>(
  typing: BuyerTyping<Form>,
  name: string,
  buyers: readonly MilkBuyerTerms[]
): BuyerTyping<Form> => {
  const form = { ...typing.form, buyerName: name };
  const picked = buyerCalled(buyers, name);
  const before = typing.filledFrom;
  if (picked?.name === before?.name) {
    return { ...typing, form };
  }
  const his = termsTyped(picked);
  const theirs = termsTyped(before);
  const free = (box: keyof typeof his) =>
    form[box].trim() === "" || (before !== null && form[box] === theirs[box]);
  const moneyFree =
    (sameReceivable(typing.receivable, NO_RECEIVABLE) &&
      !typing.priceToFollow) ||
    (before !== null &&
      sameReceivable(typing.receivable, receivableOf(before)) &&
      typing.priceToFollow === toFollowOf(before));
  return {
    form: {
      ...form,
      buyerAddress: free("buyerAddress") ? his.buyerAddress : form.buyerAddress,
      buyerPhone: free("buyerPhone") ? his.buyerPhone : form.buyerPhone,
      price: free("price") ? his.price : form.price,
    },
    receivable: moneyFree ? receivableOf(picked) : typing.receivable,
    filledFrom: picked,
    priceToFollow:
      mayFollow(picked) &&
      (moneyFree ? toFollowOf(picked) : typing.priceToFollow),
  };
};
