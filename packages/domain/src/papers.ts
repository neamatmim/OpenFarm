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

/**
 * The footer every **Investor Statement** carries, in both languages.
 *
 * On all three papers, every time, because an Investor reads one of these and nothing else: there is no
 * portal and no login, so the terms have to be in front of him whenever the Farm tells him anything at
 * all. Said here once so that the three cannot come to say it three ways.
 */
export const NO_GUARANTEE_LINES = [
  "কোনো মুনাফার নিশ্চয়তা নেই। ক্ষতি হলে তা মূলধন থেকে যাবে।",
  "No return is guaranteed. A loss comes off capital.",
] as const;

/** What every **Investor Statement** is wrapped in, whichever of the three it is. */
export interface StatementSheet {
  farm: FarmIdentity;
  /** The sheet's own title, Bangla with the English alongside. */
  title: string;
  /** Its own lines, between the letterhead and the footer. A null is left out. */
  body: (string | null)[];
  producedBy: string;
  producedAt: string;
}

/**
 * An Investor Statement, whichever of the three it is: the **Farm Identity** letterhead, the sheet's own
 * title, what it has to say, and then the footer.
 *
 * One wrapper so that the three cannot come to disagree about what a statement looks like, and so that
 * none of them can be written without the footer — an Investor reads one of these and nothing else, and
 * the terms have to be in front of him every time (CONTEXT: Investor Statement).
 */
export const investorStatement = (sheet: StatementSheet): string =>
  [
    ...farmOfOriginLines(sheet.farm),
    "",
    sheet.title,
    "",
    ...sheet.body,
    "",
    ...NO_GUARANTEE_LINES,
    "",
    `${sheet.producedAt} · ${sheet.producedBy}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

/** One movement of his capital as a paper prints it: what moved, which way, when, and on what reference. */
export interface CapitalLine {
  /** Money he put in, or money the Farm sent back when the Venture was called off. */
  kind: "received" | "returned";
  /** Taka, formatted for the reader. */
  amount: string;
  /** The day the bank moved it, as the reader reads it. */
  on: string;
  reference: string;
}

/**
 * যোগদানপত্র — what one Investor is handed when his money lands.
 *
 * The terms come off his own **Investment Agreement** rather than off the Venture, because each paper
 * froze its own at signing and two men on one Venture may hold different ones. Where a dated amendment
 * has moved them since, what is printed is what was in force — and the paper says so underneath, so that
 * two letters printed months apart do not simply disagree with each other in a man's hands.
 */
export interface JoiningLetter {
  farm: FarmIdentity;
  /** Him, and the person his family would come to the Farm about. */
  him: {
    name: string;
    phone: string;
    address: string | null;
    nid: string | null;
    nominee: {
      name: string;
      phone: string | null;
      relation: string | null;
    } | null;
  };
  ventureName: string;
  /** Taka, formatted. */
  unitPrice: string;
  /** Whole Units, formatted for the reader. */
  units: string;
  capital: CapitalLine[];
  /** Taka, formatted. What the farm holds of his: received less returned, never typed. */
  totalCapital: string;
  /** What he agreed to, numbered, in the words of the Version his Agreement was signed in (termsOf). */
  terms: string[];
  /** The day of the amendment those terms come from, as the reader reads it, or nothing while the paper
   *  still stands as it was signed. */
  amendedOn: string | null;
  /** The stamped instrument this paper points at, as the schema groups it: how its duty was paid, what it came
   *  to, the day, and the stamp paper's serial or the e-challan's number. */
  stamp: StampLine;
  producedBy: string;
  producedAt: string;
}

/** How an Agreement's stamp duty was paid, as a paper prints it. */
export interface StampLine {
  kind: "paper" | "e_challan";
  /** Taka and the day, formatted for the reader. */
  value: string;
  on: string;
  /** The stamp paper's serial, or the e-challan's number. */
  serial: string;
}

/** The stamp's three lines: stamp paper by its serial, or duty paid by e-challan by the challan's number. */
export const stampLines = (stamp: StampLine): string[] =>
  stamp.kind === "e_challan"
    ? [
        field(
          "স্ট্যাম্প শুল্ক (ই-চালান)",
          "Stamp duty (e-challan)",
          `${stamp.value} টাকা`
        ),
        field("পরিশোধের তারিখ", "Paid on", stamp.on),
        field("ই-চালান নম্বর", "e-challan no.", stamp.serial),
      ]
    : [
        field("স্ট্যাম্প মূল্য", "Stamp value", `${stamp.value} টাকা`),
        field("স্ট্যাম্পের তারিখ", "Stamped on", stamp.on),
        field("স্ট্যাম্প সিরিয়াল", "Stamp serial", stamp.serial),
      ];

/**
 * The paper an Investor gets when he joins: that the Farm has his money, and what he has agreed to.
 *
 * Every arrival is printed with its own day and bank reference rather than summed into one figure,
 * because the whole use of this sheet is that a man can hold it beside his own bank statement and see
 * the same lines. A total nobody can check against anything is not an acknowledgement.
 */
export const joiningLetter = (letter: JoiningLetter): string => {
  if (letter.capital.length === 0) {
    throw new Error(
      "a joining letter cannot acknowledge capital that has not arrived"
    );
  }
  return investorStatement({
    farm: letter.farm,
    title: "যোগদানপত্র / Investor joining letter",
    producedBy: letter.producedBy,
    producedAt: letter.producedAt,
    body: [
      field("বিনিয়োগকারী", "Investor", letter.him.name),
      letter.him.address?.trim()
        ? field("ঠিকানা", "Address", letter.him.address)
        : null,
      field("মোবাইল", "Phone", letter.him.phone),
      letter.him.nid?.trim()
        ? field("জাতীয় পরিচয়পত্র", "NID", letter.him.nid)
        : null,
      letter.him.nominee
        ? field(
            "নমিনি",
            "Nominee",
            [
              letter.him.nominee.name,
              letter.him.nominee.relation?.trim() || null,
              letter.him.nominee.phone?.trim() || null,
            ]
              .filter((part) => part !== null)
              .join(" · ")
          )
        : null,
      "",
      field("ভেঞ্চার", "Venture", letter.ventureName),
      field("প্রতি ইউনিট", "Unit price", `${letter.unitPrice} টাকা`),
      field("ইউনিট", "Units held", letter.units),
      "",
      "প্রাপ্ত মূলধন / Capital received",
      ...letter.capital.map(
        (one) =>
          `  ${one.on} · ${one.amount} টাকা · ${one.reference}${one.kind === "returned" ? " · ফেরত / returned" : ""}`
      ),
      field("মোট", "Total", `${letter.totalCapital} টাকা`),
      "",
      "শর্তাবলি / Terms",
      ...letter.terms.map((one) => `  ${one}`),
      letter.amendedOn
        ? `  (${letter.amendedOn} তারিখের সংশোধনী অনুযায়ী / as amended on ${letter.amendedOn})`
        : null,
      "",
      ...stampLines(letter.stamp),
      "",
      "বিনিয়োগকারীর স্বাক্ষর / Investor: ____________________",
      "খামারির স্বাক্ষর / For the Farm: ____________________",
    ],
  });
};

/** A label in both of the farm's languages: a paper the farm hands somebody is Bangla with the English alongside. */
export interface Said {
  bn: string;
  en: string;
}

/** One line of a document: what it is, and what it says. */
export interface DocumentRow {
  label: Said;
  value: string;
}

/** One Animal on the progress sheet, everything already worded for the reader. */
export interface ProgressAnimal {
  tagNumber: string;
  /** Kilogrammes off the lorry, and at her latest reading. */
  intake: string;
  latest: string;
  /** Her own daily gain, or the words for a beast nobody has weighed since she came. */
  gain: string;
}

/** One line of where the money has gone: what it is called, and what it came to. */
export interface SpendLine {
  label: string;
  amount: string;
}

/** অগ্রগতি — how one Investor's animals are doing, and where his money has gone. */
export interface ProgressStatement {
  farm: FarmIdentity;
  investorName: string;
  ventureName: string;
  /** His Units, and what share of the Venture they are — his own, never anybody else's. */
  units: string;
  share: string;
  /** Standing, sold and lost, formatted for the reader. */
  standing: string;
  sold: string;
  died: string;
  /** Averages over the animals that have been weighed, and how many that is. */
  weighed: string;
  averageIntake: string | null;
  averageLatest: string | null;
  /** The herd's daily gain, or nothing where nobody has been weighed yet. */
  herdGain: string | null;
  daysToWindow: string;
  animals: ProgressAnimal[];
  spend: SpendLine[];
  spendTotal: string;
  budgets: {
    /** What the plan set aside for buying animals, and what of it is not yet drawn against. */
    cattle: { planned: string; left: string };
    /** What the plan set aside for keeping them, and what keeping them has cost so far. */
    running: { planned: string; spent: string };
  };
  producedBy: string;
  producedAt: string;
}

/**
 * The sheet an Investor is sent while the run goes on: what his animals weigh, and what his money has
 * gone on.
 *
 * The spend is at Category level and no finer. He is owed a true account of where the money went — "trust
 * us" is what every scheme that went wrong said — but a unit price per kilogramme or a supplier's name is
 * the Farm's buying, not his business.
 *
 * No projection. The days to the window are a count of days; there is no weight he will reach and no
 * price he will get, because he keeps this sheet and would read either as a promise.
 */
export const progressStatement = (sheet: ProgressStatement): string =>
  investorStatement({
    farm: sheet.farm,
    title: "অগ্রগতি / Progress statement",
    producedBy: sheet.producedBy,
    producedAt: sheet.producedAt,
    body: [
      field("বিনিয়োগকারী", "Investor", sheet.investorName),
      field("ভেঞ্চার", "Venture", sheet.ventureName),
      field("ইউনিট", "Units held", `${sheet.units} (${sheet.share}%)`),
      "",
      "পশুর অবস্থা / The cattle",
      field("  দাঁড়িয়ে আছে", "Standing", sheet.standing),
      field("  বিক্রি হয়েছে", "Sold", sheet.sold),
      field("  মারা গেছে", "Lost", sheet.died),
      field("  ওজন নেওয়া হয়েছে", "Weighed", sheet.weighed),
      sheet.averageIntake
        ? field(
            "  গড় ওজন (শুরুতে)",
            "Average weight at intake",
            `${sheet.averageIntake} কেজি`
          )
        : null,
      sheet.averageLatest
        ? field(
            "  গড় ওজন (এখন)",
            "Average weight now",
            `${sheet.averageLatest} কেজি`
          )
        : null,
      sheet.herdGain
        ? field("  দৈনিক বৃদ্ধি", "Daily gain", `${sheet.herdGain} কেজি`)
        : null,
      field(
        "  লক্ষ্য সময় বাকি",
        "Days to the window",
        `${sheet.daysToWindow} দিন`
      ),
      "",
      "যে পশুগুলো আছে / The animals standing",
      // A column header standing over nothing is a heading the reader has to work out the meaning of.
      // Said in words instead — a Venture can be read before it has bought anything, because the
      // joining letter is wanted while it is still Open and the sheet that makes it makes this one too.
      ...(sheet.animals.length === 0
        ? ["  এখনো কোনো পশু নেই / none yet"]
        : [
            "  ট্যাগ · শুরুর ওজন · এখনকার ওজন · দৈনিক বৃদ্ধি / Tag · at intake · now · daily gain",
            ...sheet.animals.map(
              (one) =>
                `  ${one.tagNumber} · ${one.intake} কেজি · ${one.latest} কেজি · ${one.gain}`
            ),
          ]),
      "",
      "খরচ / What the money has gone on",
      ...sheet.spend.map((one) => `  ${one.label}: ${one.amount} টাকা`),
      field("  মোট", "Total", `${sheet.spendTotal} টাকা`),
      "",
      "বাজেট / The budgets",
      field(
        "  পশু কেনার বাজেট",
        "Cattle budget",
        `${sheet.budgets.cattle.planned} টাকা · বাকি ${sheet.budgets.cattle.left} টাকা`
      ),
      field(
        "  পরিচালনার বাজেট",
        "Running budget",
        `${sheet.budgets.running.planned} টাকা · খরচ হয়েছে ${sheet.budgets.running.spent} টাকা`
      ),
    ],
  });

/** One Settlement Adjustment as his closing sheet says it. */
export interface StatementAdjustment {
  reason: string;
  raisedAt: string;
  outcome: string;
  /** What his Units are worth of it, unsigned, and which way it went. */
  amount: string;
  rose: boolean;
  paid: string;
}

/** হিসাব নিকাশ — the sheet an Investor checks the whole run against. */
export interface SettlementStatement {
  farm: FarmIdentity;
  producedBy: string;
  producedAt: string;
  investorName: string;
  ventureName: string;
  approvedOn: string;
  proceeds: string;
  charges: SpendLine[];
  charged: string;
  /**
   * The run's profit, unsigned, and whether it was one. A minus sign tucked in after the taka mark is
   * how a loss gets read as a small profit; the label says which it is instead.
   */
  result: string;
  inProfit: boolean;
  /** How it divides: the Investors' percentage, the Units, what a Unit took, the rounding to the Farm,
   *  and the Farm's own management share. */
  investorsPercent: string;
  units: string;
  perUnit: string;
  /** Whether a Unit gained. On a losing run it lost, and the label has to say so as the others do. */
  perUnitRose: boolean;
  /** What one Unit put in and what one Unit got back — the line he reads first. */
  perUnitIn: string;
  perUnitBack: string;
  rounding: string;
  farmShare: string;
  /** Whether the Farm's share was a share of profit. On a losing run the Farm bears its part too, and a
   *  figure labelled "the Farm's share" beside a loss would read as the Farm taking money. */
  farmShareRose: boolean;
  /** The Owner's own money back at cost, which was never a charge against the run. */
  advance: string | null;
  advanceRepaid: boolean;
  /** His: Units, capital in, what his Units took, and what went out to him. */
  his: {
    units: string;
    capital: string;
    share: string;
    shareRose: boolean;
    payout: string;
    reference: string | null;
    paidOn: string | null;
  };
  /** What became of the cattle, already worded. */
  herd: string[];
  adjustments: StatementAdjustment[];
}

/**
 * The closing sheet. If he cannot follow it line by line to his own payout, the Farm has not accounted
 * to him — so every figure the payout was worked out from is on it, in the order it was worked out.
 *
 * A loss reads as a loss. The label changes, the figure carries no sign, and a share that went the wrong
 * way is shown as coming off his capital rather than being added to it. `৳-১২,৩৪৫` under a heading that
 * says Profit is how a man reads a loss as a small gain.
 */
export const settlementStatement = (sheet: SettlementStatement): string =>
  investorStatement({
    farm: sheet.farm,
    title: "হিসাব নিকাশ / Settlement statement",
    producedBy: sheet.producedBy,
    producedAt: sheet.producedAt,
    body: [
      field("বিনিয়োগকারী", "Investor", sheet.investorName),
      field("ভেঞ্চার", "Venture", sheet.ventureName),
      field("হিসাব অনুমোদিত", "Approved on", sheet.approvedOn),
      "",
      "যা পাওয়া গেল / What the animals fetched",
      field("  মোট বিক্রি", "Proceeds", `${sheet.proceeds} টাকা`),
      "",
      "যা খরচ হলো / What the run was charged",
      ...sheet.charges.map((one) => `  ${one.label}: ${one.amount} টাকা`),
      field("  মোট খরচ", "Total charged", `${sheet.charged} টাকা`),
      "",
      sheet.inProfit
        ? field("লাভ", "Profit", `${sheet.result} টাকা`)
        : field("ক্ষতি", "Loss", `${sheet.result} টাকা`),
      "",
      "ভাগ / How it divides",
      field(
        "  বিনিয়োগকারীদের অংশ",
        "Investors' share",
        `${sheet.investorsPercent}%`
      ),
      field("  মোট ইউনিট", "Units", sheet.units),
      sheet.perUnitRose
        ? field("  প্রতি ইউনিট মুনাফা", "Profit per Unit", `${sheet.perUnit} টাকা`)
        : field("  প্রতি ইউনিট ক্ষতি", "Loss per Unit", `${sheet.perUnit} টাকা`),
      // The line he reads before any other: one Unit in, one Unit back.
      field(
        "  প্রতি ইউনিট",
        "Per Unit",
        `${sheet.perUnitIn} টাকা দিয়ে ${sheet.perUnitBack} টাকা / ${sheet.perUnitIn} in, ${sheet.perUnitBack} back`
      ),
      field("  ভগ্নাংশ খামারে", "Rounding to the Farm", `${sheet.rounding} টাকা`),
      sheet.farmShareRose
        ? field("  খামারের অংশ", "The Farm's share", `${sheet.farmShare} টাকা`)
        : field(
            "  খামারের ভাগের ক্ষতি",
            "The Farm's share of the loss",
            `${sheet.farmShare} টাকা`
          ),
      sheet.advance
        ? field(
            "  মালিকের অগ্রিম ফেরত",
            "Owner's Advance repaid",
            `${sheet.advance} টাকা${sheet.advanceRepaid ? "" : " · এখনো যায়নি / not yet sent"}`
          )
        : null,
      "",
      "আপনার হিসাব / Yours",
      field("  ইউনিট", "Units held", sheet.his.units),
      field("  মূলধন ফেরত", "Capital returned", `${sheet.his.capital} টাকা`),
      sheet.his.shareRose
        ? field(
            "  মুনাফার অংশ",
            "Your share of the profit",
            `${sheet.his.share} টাকা`
          )
        : field(
            "  ক্ষতির অংশ (মূলধন থেকে)",
            "Your share of the loss, off capital",
            `${sheet.his.share} টাকা`
          ),
      field("  মোট প্রাপ্য", "Your payout", `${sheet.his.payout} টাকা`),
      sheet.his.reference
        ? field(
            "  পাঠানো হয়েছে",
            "Sent",
            `${sheet.his.paidOn} · ${sheet.his.reference}`
          )
        : field("  পাঠানো হয়েছে", "Sent", "এখনো যায়নি / not yet sent"),
      "",
      // Read from the records rather than frozen with the account: a **Sale** is the one Correction a
      // settled Venture still allows, being the late news itself, and putting a price right would move
      // the average below without moving a taka of the account above. The heading says which it is.
      "পালের হিসাব (নথি অনুযায়ী) / What became of the cattle, as the records stand",
      ...sheet.herd.map((one) => `  ${one}`),
      ...(sheet.adjustments.length === 0
        ? []
        : [
            "",
            "বণ্টন সমন্বয় / Settlement Adjustments",
            ...sheet.adjustments.flatMap((one) => [
              `  ${one.raisedAt} · ${one.reason}`,
              `    ${one.rose ? "বেড়েছে / up" : "কমেছে / down"} ${one.amount} টাকা · ${one.outcome} · পাঠানো ${one.paid} টাকা`,
            ]),
          ]),
      "",
      "এই হিসাব অনুমোদনের দিনেই স্থির করা হয়েছে। পরে কিছু এলে তা বণ্টন সমন্বয় হিসেবে আসবে, এই কাগজ বদলে নয়।",
      "These figures were frozen on the day this settlement was approved. Anything arriving later comes as a Settlement Adjustment, not by this sheet being rewritten.",
    ],
  });
