import type { FarmIdentity } from "./farm";
import { farmOfOriginLines } from "./farm";

/**
 * The papers the farm hands somebody: the receipt for what a buyer bought, the card the lorry
 * carries, an animal's passport, and the one-page answer about her withdrawal.
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

/** One place she stood, and when. */
export interface PenSpell {
  penName: string;
  from: string;
  /** Blank while she is still there. */
  until: string | null;
}

/** One dose she has had, as a paper reports it. */
export interface DoseGiven {
  productName: string;
  givenOn: string;
  /** Null when the product holds nothing for meat. */
  meatClearOn: string | null;
  /** The Vet who prescribed it, or null for a dose given on a campaign over her Pen. A buyer
   *  and a slaughter vet are entitled to ask whose prescription it was. */
  prescribedBy: string | null;
  /** Who actually gave it. */
  givenBy: string | null;
}

/**
 * A Vet's shortening of a hold, when there has been one.
 *
 * On the paper and not only in the trail, because this is the single thing a slaughter vet asks
 * about: a farm saying "clear" on a hold somebody cut short, without saying so, is the farm
 * asking to be taken at its word on exactly the point where its word is not enough.
 */
export interface ShortenedHold {
  on: string;
  reason: string | null;
  /** What her doses alone said, before it was shortened. */
  wouldHaveRunTo: string | null;
}

export interface AnimalPassport {
  farm: FarmIdentity;
  tagNumber: string;
  sex: string;
  breed: string | null;
  /** Her age as the farm can say it — estimated for a bought-in beast. */
  age: string | null;
  /** Where she came from: born here, or bought from somebody. */
  source: string;
  arrived: string | null;
  /** Every pen she has stood in, newest first, with the last thirty days among them. */
  pens: PenSpell[];
  doses: DoseGiven[];
  /** Every reading, newest first: her weight, and the date. */
  weighIns: { weight: string; on: string }[];
  /** Whether her meat may be sold today, and when it may if not — the same answer the
   *  withdrawal summary gives, so the two papers cannot disagree. */
  clear: boolean;
  clearOn: string | null;
  shortened: ShortenedHold | null;
  /** True when a list on this paper is longer than the paper: the farm says so rather than
   *  letting a reader believe they have seen everything. */
  moreThanShown: boolean;
  /** How she left, when she has. */
  leftFor: string | null;
  producedBy: string;
  producedAt: string;
}

/** One dose, with what it holds and where it came from. */
const doseLine = (dose: DoseGiven): string =>
  [
    `${dose.givenOn} · ${dose.productName}`,
    dose.meatClearOn
      ? `মাংসের জন্য মুক্ত / clear for meat: ${dose.meatClearOn}`
      : "মাংসে অপেক্ষা নেই / no meat withdrawal",
    dose.prescribedBy
      ? `ব্যবস্থাপত্র / prescribed by: ${dose.prescribedBy}`
      : "পেনভিত্তিক কর্মসূচি / campaign",
    dose.givenBy ? `দিয়েছেন / given by: ${dose.givenBy}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

/** The lines that disclose a shortened hold, and nothing at all when none was shortened. */
const shorteningLines = (shortened: ShortenedHold | null): (string | null)[] =>
  shortened
    ? [
        "",
        "⚠ ভেট অপেক্ষমাণ সময় কমিয়েছেন / A vet shortened the withdrawal",
        field("তারিখ", "On", shortened.on),
        shortened.wouldHaveRunTo
          ? field(
              "ওষুধ অনুযায়ী চলত",
              "Doses alone would have run to",
              shortened.wouldHaveRunTo
            )
          : null,
        shortened.reason ? field("কারণ", "Reason", shortened.reason) : null,
      ]
    : [];

/**
 * Everything the farm knows about one animal, on one page: what she is, where she came from,
 * every pen she has stood in, what she has been given and every time she has been weighed.
 *
 * Produced for an animal who has already gone as readily as for one standing in the shed — that
 * is exactly when a buyer or a slaughter vet asks, and a record that stopped being readable the
 * moment she left would be no use to anybody.
 */
export const animalPassport = (passport: AnimalPassport): string =>
  [
    ...farmOfOriginLines(passport.farm),
    "",
    "পশুর পরিচয়পত্র / Animal passport",
    "",
    field("ট্যাগ নম্বর", "Tag", passport.tagNumber),
    field("লিঙ্গ", "Sex", passport.sex),
    passport.breed ? field("জাত", "Breed", passport.breed) : null,
    passport.age ? field("বয়স", "Age", passport.age) : null,
    field("উৎস", "Source", passport.source),
    passport.clear
      ? "মাংসের জন্য মুক্ত / CLEAR for meat"
      : `মাংসের জন্য মুক্ত নয় / NOT CLEAR for meat${
          passport.clearOn ? ` — ${passport.clearOn}` : ""
        }`,
    passport.arrived ? field("আসার তারিখ", "Arrived", passport.arrived) : null,
    passport.leftFor ? field("যেখানে গেছে", "Left for", passport.leftFor) : null,
    "",
    "যেসব পেনে ছিল / Pen history",
    ...(passport.pens.length > 0
      ? passport.pens.map(
          (spell) =>
            `${spell.penName} · ${spell.from}${spell.until ? ` – ${spell.until}` : " –"}`
        )
      : ["—"]),
    "",
    "চিকিৎসা ও অপেক্ষমাণ সময় / Treatments and withdrawal",
    ...(passport.doses.length > 0 ? passport.doses.map(doseLine) : ["—"]),
    ...shorteningLines(passport.shortened),
    "",
    "ওজনের রেকর্ড / Weigh-ins",
    ...(passport.weighIns.length > 0
      ? passport.weighIns.map((one) => `${one.on} · ${one.weight} কেজি`)
      : ["—"]),
    passport.moreThanShown
      ? "(আগের রেকর্ড এই পাতায় আসেনি / earlier records not shown)"
      : null,
    "",
    `${passport.producedAt} · ${passport.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

export interface WithdrawalSummary {
  farm: FarmIdentity;
  tagNumber: string;
  /** The day this was asked, as the reader reads it. */
  asOf: string;
  clear: boolean;
  /** The day she becomes clear, when she is not clear today. */
  clearOn: string | null;
  /** Disclosed whether she is clear or not: a hold cut short is the thing a slaughter vet asks
   *  about, and it matters most in the case where the answer is "clear". */
  shortened: ShortenedHold | null;
  /** Everything given inside the look-back, newest first. */
  doses: DoseGiven[];
  /** How far back the farm looked, in the reader's own digits. */
  lookBackDays: string;
  producedBy: string;
  producedAt: string;
}

/**
 * The sharp question on its own page: has she had anything lately, and may her meat be sold
 * today.
 *
 * The answer comes first and in both languages, because this is the paper somebody reads at a
 * slaughterhouse gate with a lorry behind them. The doses follow it — a buyer asked what she has
 * had, not only whether she is clear this morning.
 */
export const withdrawalSummary = (summary: WithdrawalSummary): string =>
  [
    ...farmOfOriginLines(summary.farm),
    "",
    "চিকিৎসা ও অপেক্ষমাণ সময়ের সারসংক্ষেপ / Treatment and withdrawal summary",
    "",
    field("ট্যাগ নম্বর", "Tag", summary.tagNumber),
    field("তারিখ", "As of", summary.asOf),
    "",
    summary.clear
      ? "মাংসের জন্য মুক্ত / CLEAR for meat"
      : `মাংসের জন্য মুক্ত নয় / NOT CLEAR for meat${
          summary.clearOn ? ` — ${summary.clearOn}` : ""
        }`,
    ...shorteningLines(summary.shortened),
    "",
    `গত ${summary.lookBackDays} দিনের চিকিৎসা / Treatments in the last ${summary.lookBackDays} days`,
    ...(summary.doses.length > 0 ? summary.doses.map(doseLine) : ["—"]),
    "",
    `${summary.producedAt} · ${summary.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

/** One Dispatch on the milk dispatch record, formatted for the reader. */
export interface DispatchLine {
  /** When the milk left, formatted for the reader. */
  at: string;
  litres: string;
  buyerName: string;
  buyerAddress: string | null;
  challan: string | null;
  fatPercent: string | null;
  snfPercent: string | null;
}

export interface MilkDispatchRecord {
  farm: FarmIdentity;
  from: string;
  to: string;
  dispatches: DispatchLine[];
  totalLitres: string;
  producedBy: string;
  producedAt: string;
}

/**
 * The milk dispatch record: every Dispatch in a period, with the buyer's name and address and the
 * challan — what the Safe Food Act (s.38) asks a producer to be able to show about who took its milk —
 * headed by the farm and stamped with who produced it and when.
 */
export const milkDispatchRecord = (record: MilkDispatchRecord): string =>
  [
    ...farmOfOriginLines(record.farm),
    "",
    "দুধ হস্তান্তরের রেকর্ড / Milk dispatch record",
    field("সময়কাল", "Period", `${record.from} — ${record.to}`),
    "",
    ...(record.dispatches.length === 0
      ? ["এই সময়ে কোনো দুধ হস্তান্তর হয়নি / No milk was dispatched in this period"]
      : record.dispatches.flatMap((one) => [
          `${one.at} · ${one.litres} লিটার / litres · ${one.buyerName}`,
          one.buyerAddress?.trim()
            ? `  ${field("ঠিকানা", "Address", one.buyerAddress)}`
            : null,
          one.challan ? `  ${field("চালান", "Challan", one.challan)}` : null,
          one.fatPercent !== null || one.snfPercent !== null
            ? `  ${field("ফ্যাট / এসএনএফ", "Fat / SNF", `${one.fatPercent ?? "—"}% / ${one.snfPercent ?? "—"}%`)}`
            : null,
        ])),
    "",
    field("মোট", "Total", `${record.totalLitres} লিটার / litres`),
    "",
    `${record.producedAt} · ${record.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
