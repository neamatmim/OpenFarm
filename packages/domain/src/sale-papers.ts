import type { Language } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { producedSaid } from "./investor-statements";
import { countSaid, moneySaid } from "./joining-letter";
import { daySaid } from "./nominees";
import type { Produced } from "./paper-saying";
import { TOTAL, dayOrNone, momentSaid, numberSaid } from "./paper-saying";
import type { PaperDocument } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { DocumentRow, Said } from "./papers";

/** What the receipt prints from: every animal one buyer took on one day, and what he still owed for them. */
export interface SaleReceiptFacts extends Produced {
  farm: FarmIdentity;
  buyer: { name: string; address: string | null; phone: string | null };
  /** The farm day of the sales, "YYYY-MM-DD". */
  day: string;
  animals: { tagNumber: string; weightKg: number; priceMoney: number }[];
  /** What he paid that day and still owed, and the day or days he promised to pay it by — or nothing, for a buyer who
   *  paid in full. On the paper he signs, because a trader's promise is worth what the farm can show of it. */
  receivable: {
    paidMoney: number;
    owedMoney: number;
    /** Each tag he still owed on, and the day he promised for it; nothing where he named none. */
    toBePaidBy: { tagNumber: string; day: string | null }[];
  } | null;
}

/** A row of a paper's facts, left out where it would say nothing. */
const rowOf = (label: Said, value: string | null): DocumentRow[] =>
  value?.trim() ? [{ label, value }] : [];

/** The days a buyer promised to pay by: one day said once, and several each beside the tags they were promised for,
 *  since a paper that gave one day for two promises would hold him to the wrong one. */
const promisedSaid = (
  toBePaidBy: NonNullable<SaleReceiptFacts["receivable"]>["toBePaidBy"]
): Said => {
  const days = new Set(toBePaidBy.map((one) => one.day));
  const [first] = toBePaidBy;
  if (days.size === 1 && first) {
    return dayOrNone(first.day);
  }
  const said = (language: Language) =>
    toBePaidBy
      .map((one) => `${one.tagNumber} ${dayOrNone(one.day)[language]}`)
      .join("; ");
  return { bn: said("bn"), en: said("en") };
};

/**
 * The receipt on paper: every animal that went to one buyer on one day, on one sheet — at Eid a man buys five beasts in
 * a morning, and handing him five pieces of paper is how one of them gets lost. On the Farm Identity letterhead, read in
 * Bangla or English, the buyer, the animals with their weights and prices added up, what he still owed and by when,
 * and room for both to sign. Every figure is the farm's own: a receipt somebody typed is a note, not a receipt.
 */
export const saleReceiptPaper = (facts: SaleReceiptFacts): PaperDocument => {
  if (facts.animals.length === 0) {
    throw new Error("a receipt with no animals on it is not a receipt");
  }
  const total = facts.animals.reduce((sum, one) => sum + one.priceMoney, 0);
  const { receivable } = facts;
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "বিক্রয় রসিদ", en: "Sale receipt" },
    preamble: {
      bn: "এই রসিদে ক্রেতা যে পশু নিয়েছেন সেগুলোর দাম লেখা আছে।",
      en: "The animals the buyer took, and what they came to.",
    },
    sections: [
      {
        kind: "facts",
        heading: { bn: "ক্রেতা", en: "Buyer" },
        rows: [
          { label: { bn: "নাম", en: "Name" }, value: facts.buyer.name },
          ...rowOf({ bn: "ঠিকানা", en: "Address" }, facts.buyer.address),
          ...rowOf({ bn: "মোবাইল", en: "Phone" }, facts.buyer.phone),
          { label: { bn: "তারিখ", en: "Date" }, value: daySaid(facts.day) },
        ],
        note: null,
      },
      {
        kind: "table",
        heading: { bn: "পশু", en: "Animals" },
        columns: [
          { label: { bn: "ট্যাগ নম্বর", en: "Tag number" }, whole: true },
          { label: { bn: "ওজন, কেজি", en: "Weight, kg" }, figures: true },
          { label: { bn: "দাম", en: "Price" }, figures: true },
        ],
        rows: facts.animals.map((one) => [
          one.tagNumber,
          numberSaid(one.weightKg),
          moneySaid(one.priceMoney),
        ]),
        foot: [TOTAL, "", moneySaid(total)],
        note: null,
      },
      ...(receivable
        ? [
            {
              kind: "facts" as const,
              heading: { bn: "পরিশোধ", en: "Payment" },
              rows: [
                {
                  label: { bn: "পরিশোধ", en: "Paid" },
                  value: moneySaid(receivable.paidMoney),
                },
                {
                  label: { bn: "বাকি", en: "Still owed" },
                  value: moneySaid(receivable.owedMoney),
                },
                {
                  label: { bn: "পরিশোধের তারিখ", en: "To be paid by" },
                  value: promisedSaid(receivable.toBePaidBy),
                },
              ],
              note: null,
            },
          ]
        : []),
      {
        kind: "signatures",
        heading: { bn: "স্বাক্ষর", en: "Signatures" },
        signers: [
          { role: { bn: "ক্রেতা", en: "Buyer" }, name: facts.buyer.name },
          { role: { bn: "বিক্রেতা", en: "Seller" }, name: facts.farm.name },
        ],
        dateBlank: null,
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};

/** What the transport card prints from: one lorry-load — the animals on one vehicle, to one destination, with one
 *  driver. */
export interface TransportCardFacts extends Produced {
  farm: FarmIdentity;
  buyerName: string;
  destination: string;
  vehicle: string;
  driver: string;
  /** When the load left. */
  at: Date;
  tagNumbers: string[];
}

/**
 * The card the lorry carries, on paper: the farm of origin with its registration number on the letterhead, where the
 * load is going, on what and with whom, and the animals by tag (Meat Rules 2021 r.18), and room for the farm to sign.
 *
 * The farm's Registration number is required and not merely printed when present. A card without it is not a lawful
 * card, and handing a driver one that looks right and is not would be worse than handing him nothing — so the caller
 * is refused rather than given a page with a hole in it.
 */
export const transportCardPaper = (
  facts: TransportCardFacts
): PaperDocument => {
  if (!facts.farm.registrationNumber?.trim()) {
    throw new Error(
      "a transport card cannot be written without the farm's registration number"
    );
  }
  if (facts.tagNumbers.length === 0) {
    throw new Error("a transport card with no animals on it is not a card");
  }
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "পশু পরিবহন কার্ড", en: "Animal transport card" },
    preamble: {
      bn: "মাংস বিধিমালা ২০২১, বিধি ১৮ অনুযায়ী।",
      en: "Under the Meat Rules 2021, rule 18.",
    },
    sections: [
      {
        kind: "facts",
        heading: { bn: "চালান", en: "The load" },
        rows: [
          {
            label: { bn: "গন্তব্য", en: "Destination" },
            value: facts.destination,
          },
          { label: { bn: "ক্রেতা", en: "Buyer" }, value: facts.buyerName },
          {
            label: { bn: "তারিখ ও সময়", en: "Date and time" },
            value: momentSaid(facts.at, "dateTime"),
          },
          { label: { bn: "গাড়ি", en: "Vehicle" }, value: facts.vehicle },
          { label: { bn: "চালক", en: "Driver" }, value: facts.driver },
        ],
        note: null,
      },
      {
        kind: "facts",
        heading: { bn: "পশু", en: "Animals" },
        rows: [
          {
            label: { bn: "পশুর সংখ্যা", en: "Animals" },
            value: countSaid(facts.tagNumbers.length),
          },
          {
            label: { bn: "ট্যাগ নম্বর", en: "Tag numbers" },
            value: facts.tagNumbers.join(", "),
          },
        ],
        note: null,
      },
      {
        kind: "signatures",
        heading: { bn: "স্বাক্ষর", en: "Signature" },
        signers: [{ role: { bn: "খামার", en: "Farm" }, name: facts.farm.name }],
        dateBlank: null,
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
