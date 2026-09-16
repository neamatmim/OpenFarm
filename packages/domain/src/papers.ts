import type { FarmIdentity, RegistrationStanding } from "./farm";
import { farmOfOriginLines } from "./farm";
import type { Side } from "./lifecycle";
import type { MoneySummary } from "./money-summary";

/**
 * The papers the farm hands somebody: the receipt for what a buyer bought, the card the lorry
 * carries, an animal's passport, the one-page answer about her withdrawal, the milk dispatch record, and
 * the accountant's summary of the farm's money.
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
export interface PenSpellLine {
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
  pens: PenSpellLine[];
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

/** The accountant's summary as it is written: the farm, the period, its money added up, and who asked for it
 *  when. */
export interface AccountantSummary {
  farm: FarmIdentity;
  from: string;
  to: string;
  summary: MoneySummary;
  /** Taka as the reader reads it. */
  taka: (amount: number) => string;
  producedBy: string;
  producedAt: string;
}

const SIDE_LABEL: Record<Side, [string, string]> = {
  dairy: ["দুগ্ধ", "Dairy"],
  fattening: ["মোটাতাজাকরণ", "Fattening"],
};

/**
 * The accountant's summary: a period's income against expense, and the same by Category, by Counterparty
 * and by Side, with the money the Owner has not approved said apart. The farm does not keep books; its
 * accountant keeps them from this and the CSV that goes with it.
 */
export const accountantSummary = (paper: AccountantSummary): string => {
  const { summary, taka } = paper;
  const inAndOut = (line: { inBdt: number; outBdt: number }) =>
    `আয় / in ${taka(line.inBdt)} · ব্যয় / out ${taka(line.outBdt)}`;
  return [
    ...farmOfOriginLines(paper.farm),
    "",
    "আয় ও ব্যয় / Income and expense",
    field("সময়কাল", "Period", `${paper.from} — ${paper.to}`),
    "",
    field("মোট আয়", "Income", taka(summary.incomeBdt)),
    field("মোট ব্যয়", "Expense", taka(summary.expenseBdt)),
    field("বাকি", "Net", taka(summary.netBdt)),
    summary.awaiting.count > 0
      ? field(
          "মালিকের অনুমোদনের অপেক্ষায়",
          "Awaiting the Owner's approval",
          `${summary.awaiting.count} · ${inAndOut(summary.awaiting)}`
        )
      : null,
    "",
    "খাত অনুযায়ী / By Category",
    ...summary.byCategory.map(
      (line) =>
        `  ${line.nameBn}${line.nameEn ? ` / ${line.nameEn}` : ""}: ${inAndOut(line)}`
    ),
    "",
    "যার সাথে লেনদেন / By Counterparty",
    ...summary.byCounterparty.map(
      (line) => `  ${line.name ?? "—"}: ${inAndOut(line)}`
    ),
    "",
    "দিক অনুযায়ী / By Side",
    ...summary.bySide.map((line) => {
      const [bn, en] = line.side
        ? SIDE_LABEL[line.side]
        : ["পুরো খামার", "Whole farm"];
      return `  ${bn} / ${en}: ${inAndOut(line)}`;
    }),
    "",
    `${paper.producedAt} · ${paper.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
};

/** The Registration register (R1) as it is written: the farm, its registration, and who produced it when.
 *  Dates arrive formatted for the reader. */
export interface RegistrationRecord {
  farm: FarmIdentity;
  office: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  /** Whether it has run out, or is about to: the first thing an inspector reads. */
  standing: RegistrationStanding;
  /** When the certificate was last photographed; null for a farm that has not. */
  certificateTakenOn: string | null;
  producedBy: string;
  producedAt: string;
}

/** The registers the Inspector View prints, by the name the trail records each under. */
export const INSPECTOR_REGISTERS = [
  "registration",
  "herd_summary",
  "vaccination_register",
  "treatment_register",
  "disease_history",
  "mortality_register",
] as const;
export type InspectorRegister = (typeof INSPECTOR_REGISTERS)[number];

/** The registers an inspector may also take away as a CSV (the report set: R3, R4 and R6 as PDF and CSV). */
export const REGISTERS_WITH_CSV: readonly InspectorRegister[] = [
  "vaccination_register",
  "treatment_register",
  "mortality_register",
];

/** The health registers, which cover a period: a year of vaccinations, thirty days of treatments, six months of
 *  diagnoses, a year of deaths. */
export type HealthRegister = Extract<
  InspectorRegister,
  | "vaccination_register"
  | "treatment_register"
  | "disease_history"
  | "mortality_register"
>;

/** One line under a row's heading on a register: a label in both of the farm's languages, and what it says. */
export interface RegisterPaperField {
  bn: string;
  en: string;
  said: string;
}

/** One row of a register as the paper prints it: the line it is headed by, and the fields indented under it. */
export interface RegisterPaperRow {
  heading: string;
  fields: RegisterPaperField[];
}

/** A register as a paper: the farm it came from, what it is, the period it covers, and its rows — everything
 *  already written out for the reader, because how a date looks is the i18n package's business. */
export interface RegisterPaper {
  farm: FarmIdentity;
  title: { bn: string; en: string };
  from: string;
  to: string;
  /** What the paper says instead of rows when the period holds nothing: "no deaths in this period". */
  none: { bn: string; en: string };
  rows: RegisterPaperRow[];
  producedBy: string;
  producedAt: string;
}

/**
 * Any of the Inspector View's registers as a paper.
 *
 * Every one reads the same way — the farm of origin, the register's name, the period, then a row headed by
 * what identifies it with its fields indented under — because an inspector reads four of them in a row and
 * should not have to learn four layouts. What each register puts on those lines is the register's own business;
 * this writes them out.
 */
export const registerPaper = (paper: RegisterPaper): string =>
  [
    ...farmOfOriginLines(paper.farm),
    "",
    `${paper.title.bn} / ${paper.title.en}`,
    field("সময়কাল", "Period", `${paper.from} — ${paper.to}`),
    "",
    ...(paper.rows.length === 0
      ? [`${paper.none.bn} / ${paper.none.en}`]
      : paper.rows.flatMap((row) => [
          row.heading,
          ...row.fields.map((one) => `  ${field(one.bn, one.en, one.said)}`),
        ])),
    "",
    `${paper.producedAt} · ${paper.producedBy}`,
  ].join("\n");

const STANDING_LABEL: Record<RegistrationStanding, string> = {
  valid: "বৈধ / Valid",
  ending_soon: "মেয়াদ শেষ হতে চলেছে / Ending soon",
  expired: "মেয়াদ শেষ / Expired",
  unknown: "মেয়াদ লেখা নেই / No expiry recorded",
};

/**
 * R1, the Registration: the farm's DLS registration as an inspector reads it first — number, office, when it
 * was issued and when it runs out, whether it still stands, and that the certificate has been photographed.
 */
export const registrationRecord = (record: RegistrationRecord): string =>
  [
    ...farmOfOriginLines(record.farm),
    "",
    // The number is already in the farm's own lines above.
    "নিবন্ধন / Registration",
    field("ইস্যুকারী দপ্তর", "Issuing office", record.office ?? "—"),
    field("ইস্যুর তারিখ", "Issued", record.issuedOn ?? "—"),
    field("মেয়াদ শেষ", "Expires", record.expiresOn ?? "—"),
    field("অবস্থা", "Standing", STANDING_LABEL[record.standing]),
    field(
      "সনদের ছবি",
      "Certificate photographed",
      record.certificateTakenOn ?? "—"
    ),
    "",
    `${record.producedAt} · ${record.producedBy}`,
  ].join("\n");

/** One Side's herd, one Pen's, as the summary prints them — labels already in both languages. */
export interface HerdSummaryLine {
  label: string;
  animals: string;
  /** Each State with its count, already written out. */
  states: string;
}

export interface HerdSummary {
  farm: FarmIdentity;
  asOf: string;
  total: string;
  bySide: HerdSummaryLine[];
  byPen: HerdSummaryLine[];
  producedBy: string;
  producedAt: string;
}

/**
 * R2, the herd summary: every animal on the farm on the day, by Side and State and by Pen — the count an
 * inspector checks against the sheds.
 */
export const herdSummary = (summary: HerdSummary): string =>
  [
    ...farmOfOriginLines(summary.farm),
    "",
    "পশুর সারসংক্ষেপ / Herd summary",
    field("তারিখ", "As of", summary.asOf),
    field("মোট পশু", "Animals", summary.total),
    "",
    "দিক ও অবস্থা অনুযায়ী / By Side and State",
    ...summary.bySide.flatMap((line) => [
      `  ${line.label}: ${line.animals}`,
      `    ${line.states}`,
    ]),
    "",
    "পেন অনুযায়ী / By Pen",
    ...summary.byPen.flatMap((line) => [
      `  ${line.label}: ${line.animals}`,
      `    ${line.states}`,
    ]),
    "",
    `${summary.producedAt} · ${summary.producedBy}`,
  ].join("\n");

/** One death on the printed mortality register, its day, cause and disposal already written out for the reader. */
export interface MortalityRegisterLine {
  tagNumber: string;
  diedOn: string;
  cause: string;
  /** How the carcass went, with the detail beside it; the words for awaiting while a stillborn calf's waits. */
  disposal: string;
  /** The office's reference, for a death the farm attributes to a notifiable disease reported under one. */
  reportReference: string | null;
}

export interface MortalityRegister {
  farm: FarmIdentity;
  from: string;
  to: string;
  deaths: MortalityRegisterLine[];
  producedBy: string;
  producedAt: string;
}

/**
 * R6, the mortality register: every death and cull in a period — the animal, the day, the cause, how the carcass
 * was disposed of, and the DLS reference when it was notifiable — a line to each in the CSV's order.
 */
export const mortalityRegister = (register: MortalityRegister): string =>
  [
    ...farmOfOriginLines(register.farm),
    "",
    "মৃত্যুর রেজিস্টার / Mortality register",
    field("সময়কাল", "Period", `${register.from} — ${register.to}`),
    "",
    ...(register.deaths.length === 0
      ? ["এই সময়ে কোনো মৃত্যু হয়নি / No deaths in this period"]
      : register.deaths.flatMap((one) => [
          one.tagNumber,
          `  ${field("তারিখ", "Date", one.diedOn)}`,
          `  ${field("কারণ", "Cause", one.cause)}`,
          `  ${field("নিষ্পত্তি", "Disposal", one.disposal)}`,
          ...(one.reportReference
            ? [
                `  ${field("ডিএলএস রেফারেন্স", "DLS reference", one.reportReference)}`,
              ]
            : []),
        ])),
    "",
    `${register.producedAt} · ${register.producedBy}`,
  ].join("\n");

/** One vaccine dose on the printed vaccination register, its day already written out for the reader. */
export interface VaccinationRegisterLine {
  tagNumber: string;
  vaccine: string;
  givenOn: string;
  /** The vial's Lot Number: the dose's own, or its Campaign's. Null for a dose recorded before the product
   *  was marked a vaccine. */
  lotNumber: string | null;
  givenBy: string | null;
}

export interface VaccinationRegister {
  farm: FarmIdentity;
  from: string;
  to: string;
  doses: VaccinationRegisterLine[];
  producedBy: string;
  producedAt: string;
}

/**
 * R3, the vaccination register: every vaccine dose in a period, per animal — the vaccine, the date, the Lot
 * Number, and who gave it, a line to each in the CSV's order. What an inspector reads for FMD and anthrax.
 */
export const vaccinationRegister = (register: VaccinationRegister): string =>
  [
    ...farmOfOriginLines(register.farm),
    "",
    "টিকার রেজিস্টার / Vaccination register",
    field("সময়কাল", "Period", `${register.from} — ${register.to}`),
    "",
    ...(register.doses.length === 0
      ? ["এই সময়ে কোনো টিকা দেওয়া হয়নি / No vaccinations in this period"]
      : register.doses.flatMap((one) => [
          one.tagNumber,
          `  ${field("টিকা", "Vaccine", one.vaccine)}`,
          `  ${field("তারিখ", "Date", one.givenOn)}`,
          `  ${field("লট নম্বর", "Lot number", one.lotNumber ?? "—")}`,
          `  ${field("যিনি দিয়েছেন", "Given by", one.givenBy ?? "—")}`,
        ])),
    "",
    `${register.producedAt} · ${register.producedBy}`,
  ].join("\n");

/** One dose on the printed treatment register, its days and route already written out for the reader. */
export interface TreatmentRegisterLine {
  givenOn: string;
  tagNumber: string;
  diagnosis: string | null;
  drug: string;
  dose: string | null;
  route: string | null;
  course: string | null;
  givenBy: string | null;
  prescribedBy: string | null;
  milkClearOn: string | null;
  meatClearOn: string | null;
}

export interface TreatmentRegister {
  farm: FarmIdentity;
  from: string;
  to: string;
  doses: TreatmentRegisterLine[];
  producedBy: string;
  producedAt: string;
}

/**
 * R4, the treatment register: every dose in a period, a line to each field in the DLS guideline's column order as
 * the CSV has it — the date, the
 * animal, the diagnosis, the drug, the dose and route, which dose of the course, who gave it, the prescribing
 * Vet, and when the milk and the meat were clear. What an inspector and a slaughter vet ask for first.
 */
export const treatmentRegister = (register: TreatmentRegister): string =>
  [
    ...farmOfOriginLines(register.farm),
    "",
    "চিকিৎসার রেজিস্টার / Treatment register",
    field("সময়কাল", "Period", `${register.from} — ${register.to}`),
    "",
    ...(register.doses.length === 0
      ? ["এই সময়ে কোনো চিকিৎসা হয়নি / No treatments in this period"]
      : register.doses.flatMap((one) => [
          `${one.givenOn} · ${one.tagNumber}`,
          `  ${field("রোগ", "Diagnosis", one.diagnosis ?? "—")}`,
          `  ${field("ওষুধ", "Drug", one.drug)}`,
          `  ${field("ডোজ", "Dose", one.dose ?? "—")}`,
          `  ${field("পথ", "Route", one.route ?? "—")}`,
          `  ${field("কোর্স", "Course", one.course ?? "—")}`,
          `  ${field("যিনি দিয়েছেন", "Given by", one.givenBy ?? "—")}`,
          `  ${field("প্রেসক্রিপশন", "Prescribed by", one.prescribedBy ?? "—")}`,
          `  ${field("দুধ মুক্ত", "Milk clear", one.milkClearOn ?? "—")}`,
          `  ${field("মাংস মুক্ত", "Meat clear", one.meatClearOn ?? "—")}`,
        ])),
    "",
    `${register.producedAt} · ${register.producedBy}`,
  ].join("\n");

/** One diagnosis on the printed disease history. */
export interface DiseaseHistoryLine {
  diagnosedOn: string;
  tagNumber: string;
  disease: string;
  diagnosedBy: string;
  notifiable: boolean;
  reportReference: string | null;
  /** What became of the animal, already written out. */
  outcome: string;
}

export interface DiseaseHistory {
  farm: FarmIdentity;
  from: string;
  to: string;
  diagnoses: DiseaseHistoryLine[];
  producedBy: string;
  producedAt: string;
}

/**
 * R5, the disease history: every diagnosis in a period by date and animal, the notifiable ones marked with the
 * reference their letter to the office was delivered under, and what became of the animal since.
 */
export const diseaseHistory = (history: DiseaseHistory): string =>
  [
    ...farmOfOriginLines(history.farm),
    "",
    "রোগের ইতিহাস / Disease history",
    field("সময়কাল", "Period", `${history.from} — ${history.to}`),
    "",
    ...(history.diagnoses.length === 0
      ? ["এই সময়ে কোনো রোগ নির্ণয় হয়নি / No diagnoses in this period"]
      : history.diagnoses.flatMap((one) => [
          `${one.diagnosedOn} · ${one.tagNumber} · ${one.disease}${one.notifiable ? " · জ্ঞাপনযোগ্য / Notifiable" : ""}`,
          `  ${field("ভেট", "Vet", one.diagnosedBy)}`,
          one.notifiable
            ? `  ${field("ডিএলএস রেফারেন্স", "DLS reference", one.reportReference ?? "এখনো দেওয়া হয়নি / not yet delivered")}`
            : null,
          `  ${field("পরিণতি", "Outcome", one.outcome)}`,
        ])),
    "",
    `${history.producedAt} · ${history.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
