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
 */

/** What the farm is, as both papers print it at their head. */
export interface FarmOfOrigin {
  name: string;
  address: string | null;
  phone: string | null;
  registrationNumber: string | null;
}

/** One animal on either paper. */
export interface SoldAnimal {
  tagNumber: string;
  /** Kilogrammes, formatted for the reader. */
  weight: string;
  /** Taka, formatted for the reader. */
  price: string;
}

export interface SaleReceipt {
  farm: FarmOfOrigin;
  buyerName: string;
  buyerAddress: string | null;
  buyerPhone: string | null;
  /** The day of the sales, as the reader reads it. */
  day: string;
  animals: SoldAnimal[];
  /** Taka, formatted. Worked out from the animals; never typed. */
  total: string;
}

/** The lines of a farm's own heading, leaving out what it has not written down. */
const originLines = (farm: FarmOfOrigin): string[] =>
  [
    `খামার: ${farm.name}`,
    farm.address?.trim() ? `ঠিকানা: ${farm.address}` : null,
    farm.phone?.trim() ? `মোবাইল: ${farm.phone}` : null,
    farm.registrationNumber?.trim()
      ? `নিবন্ধন নম্বর: ${farm.registrationNumber}`
      : null,
  ].filter((line) => line !== null);

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
    ...originLines(receipt.farm),
    "",
    "বিক্রয় রসিদ",
    "",
    `ক্রেতা: ${receipt.buyerName}`,
    receipt.buyerAddress?.trim() ? `ঠিকানা: ${receipt.buyerAddress}` : null,
    receipt.buyerPhone?.trim() ? `মোবাইল: ${receipt.buyerPhone}` : null,
    `তারিখ: ${receipt.day}`,
    "",
    "ট্যাগ নম্বর · ওজন · মূল্য",
    ...receipt.animals.map(
      (one) => `${one.tagNumber} · ${one.weight} কেজি · ${one.price} টাকা`
    ),
    "",
    `মোট: ${receipt.total} টাকা`,
    "",
    "ক্রেতার স্বাক্ষর: ____________________",
    "বিক্রেতার স্বাক্ষর: ____________________",
  ]
    .filter((line) => line !== null)
    .join("\n");
};

export interface TransportCard {
  farm: FarmOfOrigin;
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
    "পশু পরিবহন কার্ড",
    "(মাংস বিধিমালা ২০২১, বিধি ১৮)",
    "",
    ...originLines(card.farm),
    "",
    `গন্তব্য: ${card.destination}`,
    `ক্রেতা: ${card.buyerName}`,
    `তারিখ ও সময়: ${card.when}`,
    `গাড়ি: ${card.vehicle}`,
    `চালক: ${card.driver}`,
    "",
    `পশুর সংখ্যা: ${card.count}`,
    `ট্যাগ নম্বর: ${card.tagNumbers.join(", ")}`,
    "",
    "খামারের স্বাক্ষর: ____________________",
  ].join("\n");
};
