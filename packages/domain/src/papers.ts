import type { FarmIdentity } from "./farm";
import { farmOfOriginLines } from "./farm";

/**
 * The two papers a buyer leaves with: the receipt for what they bought, and the card the lorry
 * carries.
 *
 * Written out as strings rather than assembled on a screen, for the same reason the DLS letter
 * is: they are documents the farm may have to produce again years later, and they should read
 * the same every time. Every figure comes from what the farm already holds — a receipt somebody
 * typed is a note, not a receipt.
 *
 * Dates and numbers arrive already formatted, because how a date looks is the i18n package's
 * business and this package depends on nothing.
 *
 * Labels are Bangla with the English alongside, as the report set asks of every paper the farm
 * produces: the farm reads the Bangla, and a processor's clerk or an inspector from outside the
 * district reads the English without anybody having to explain the form.
 */

/** A field label, in the farm's language and in the one a visitor may read. */
const field = (bn: string, en: string, value: string): string =>
  `${bn} / ${en}: ${value}`;

/** One animal on either paper. */
export interface SoldAnimal {
  tagNumber: string;
  /** Kilogrammes, formatted for the reader. */
  weight: string;
  /** Taka, formatted for the reader. */
  price: string;
}

export interface SaleReceipt {
  farm: FarmIdentity;
  buyerName: string;
  buyerAddress: string | null;
  buyerPhone: string | null;
  /** The day of the sales, as the reader reads it. */
  day: string;
  animals: SoldAnimal[];
  /** Taka, formatted. Worked out from the animals; never typed. */
  total: string;
  /** Who produced this copy and when — the report set asks it of every paper, so that two
   *  copies of one receipt can be told apart and the later one accounted for. */
  producedBy: string;
  producedAt: string;
}

/**
 * The receipt: every animal that went to one buyer on one day, on one sheet.
 *
 * One receipt and not five, because at Eid a man buys five beasts in a morning and handing him
 * five pieces of paper is how one of them gets lost.
 */
export const saleReceipt = (receipt: SaleReceipt): string => {
  if (receipt.animals.length === 0) {
    throw new Error("a receipt with no animals on it is not a receipt");
  }
  return [
    ...farmOfOriginLines(receipt.farm),
    "",
    "বিক্রয় রসিদ / Sale receipt",
    "",
    field("ক্রেতা", "Buyer", receipt.buyerName),
    receipt.buyerAddress?.trim()
      ? field("ঠিকানা", "Address", receipt.buyerAddress)
      : null,
    receipt.buyerPhone?.trim()
      ? field("মোবাইল", "Phone", receipt.buyerPhone)
      : null,
    field("তারিখ", "Date", receipt.day),
    "",
    "ট্যাগ নম্বর · ওজন · মূল্য / Tag · weight · price",
    ...receipt.animals.map(
      (one) => `${one.tagNumber} · ${one.weight} কেজি · ${one.price} টাকা`
    ),
    "",
    field("মোট", "Total", `${receipt.total} টাকা`),
    "",
    "ক্রেতার স্বাক্ষর / Buyer: ____________________",
    "বিক্রেতার স্বাক্ষর / Seller: ____________________",
    "",
    `${receipt.producedAt} · ${receipt.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
};

export interface TransportCard {
  farm: FarmIdentity;
  buyerName: string;
  destination: string;
  vehicle: string;
  driver: string;
  /** The day and time of the movement, as the reader reads them. */
  when: string;
  tagNumbers: string[];
  /** How many, formatted for the reader — the whole card is in Bangla, and a count in Arabic
   *  numerals in the middle of it is the one line an inspector's eye stops on. */
  count: string;
  producedBy: string;
  producedAt: string;
}

/**
 * The card the lorry carries: farm of origin with its registration number, the animals by tag,
 * where they are going, and who is driving (Meat Rules 2021 r.18).
 *
 * The farm's Registration number is required and not merely printed when present. A card without
 * it is not a lawful card, and handing a driver one that looks right and is not would be worse
 * than handing him nothing — so the caller is refused rather than given a page with a hole in it.
 */
export const transportCard = (card: TransportCard): string => {
  if (!card.farm.registrationNumber?.trim()) {
    throw new Error(
      "a transport card cannot be written without the farm's registration number"
    );
  }
  if (card.tagNumbers.length === 0) {
    throw new Error("a transport card with no animals on it is not a card");
  }
  return [
    "পশু পরিবহন কার্ড / Animal transport card",
    "(মাংস বিধিমালা ২০২১, বিধি ১৮ / Meat Rules 2021, r.18)",
    "",
    ...farmOfOriginLines(card.farm),
    "",
    field("গন্তব্য", "Destination", card.destination),
    field("ক্রেতা", "Buyer", card.buyerName),
    field("তারিখ ও সময়", "Date and time", card.when),
    field("গাড়ি", "Vehicle", card.vehicle),
    field("চালক", "Driver", card.driver),
    "",
    field("পশুর সংখ্যা", "Animals", card.count),
    field("ট্যাগ নম্বর", "Tags", card.tagNumbers.join(", ")),
    "",
    "খামারের স্বাক্ষর / Farm: ____________________",
    "",
    `${card.producedAt} · ${card.producedBy}`,
  ].join("\n");
};
