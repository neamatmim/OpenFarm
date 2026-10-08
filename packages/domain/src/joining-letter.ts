import type { Language } from "@OpenFarm/i18n";
import { currencyWords, formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { daySaid, nomineeRowOf } from "./nominees";
import type {
  PaperDocument,
  PaperInvestor,
  PaperSection,
} from "./paper-template";
import { investorRows, letterheadOf } from "./paper-template";
import type { DocumentRow, Said } from "./papers";
import { NO_GUARANTEE } from "./papers";

/**
 * যোগদানপত্র — what one Investor is handed when their money lands, as a paper read in Bangla or in English (ADR 0021).
 *
 * The terms come off their own **Investment Agreement** rather than off the Venture, because each paper froze its own
 * at signing and two Investors on one Venture may hold different ones. Where a dated amendment has moved them since,
 * what is printed is what was in force — and the paper says so, so that two letters printed months apart do not simply
 * disagree with each other in a person's hands.
 */
export interface JoiningLetterFacts {
  farm: FarmIdentity;
  /** Who joined: a person with their Nominees in force, or an Organization with its Signatory and none (ADR 0020). */
  him: PaperInvestor;
  ventureName: string;
  unitPriceMoney: number;
  units: number;
  /** Each movement of their capital: money in, or money the Farm sent back when the Venture was called off. */
  capital: {
    kind: "received" | "returned";
    amountMoney: number;
    /** A farm day. */
    movedOn: string;
    reference: string;
  }[];
  /** What the farm holds of theirs: received less returned, never typed. */
  totalCapitalMoney: number;
  /** What they agreed to, part by part, in both languages of the Version their Agreement was signed in. */
  terms: { heading: Said; clauses: Said[] }[];
  /** Paid by the month: their Units' Monthly Sums, each its farm day and amount; nothing for any other Venture. */
  monthlySums: { dueOn: string; amountMoney: number }[] | null;
  /** The farm day of the amendment those terms come from, or nothing while the paper stands as it was signed. */
  amendedOn: string | null;
  /** The stamped instrument this paper points at: how its duty was paid, what it came to, the day and its number. */
  stamp: {
    kind: "paper" | "e_challan" | "in_app" | "farm_own";
    valueMoney: number;
    /** A farm day. */
    on: string;
    serial: string;
  };
  /** Who signs for the Farm. */
  ownerName: string;
  producedBy: string;
  producedAt: Said;
}

/** Money as a paper in each language writes it: its own numerals, and the farm's currency in its own word. */
export const moneySaid = (amount: number): Said => {
  const said = (language: Language) =>
    `${formatNumber(amount, language)} ${currencyWords(language).sum}`;
  return { bn: said("bn"), en: said("en") };
};

/** A count as a paper in each language writes it. */
export const countSaid = (count: number): Said => ({
  bn: formatNumber(count, "bn"),
  en: formatNumber(count, "en"),
});

const line = (label: Said, value: Said | string): DocumentRow => ({
  label,
  value,
});

/** How its Agreement was made, as the letter's last facts: the stamp, the e-challan, the app, or the Farm's own. */
const stampRows = (
  stamp: JoiningLetterFacts["stamp"]
): { heading: Said; rows: DocumentRow[] } => {
  const day = daySaid(stamp.on);
  switch (stamp.kind) {
    // The Farm's own Units are no Agreement with anybody: no stamp.
    case "farm_own": {
      return {
        heading: { bn: "চুক্তি", en: "Agreement" },
        rows: [
          line(
            { bn: "চুক্তি", en: "Agreement" },
            {
              bn: "খামারের নিজের মূলধন — চুক্তি নেই",
              en: "The Farm's own capital — no Agreement",
            }
          ),
        ],
      };
    }
    case "in_app": {
      return {
        heading: { bn: "চুক্তি সম্পাদন", en: "How it was made" },
        rows: [
          line(
            { bn: "চুক্তি সম্পাদন", en: "Made" },
            {
              bn: "অ্যাপে সম্মতি ও অনুমোদনে — স্ট্যাম্প ছাড়া",
              en: "Agreed and approved in the app — no stamp",
            }
          ),
          line({ bn: "অনুমোদনের তারিখ", en: "Approved on" }, day),
          line({ bn: "সম্মত কাগজের নম্বর", en: "Agreed paper no." }, stamp.serial),
        ],
      };
    }
    case "e_challan": {
      return {
        heading: { bn: "স্ট্যাম্প শুল্ক", en: "Stamp duty" },
        rows: [
          line(
            { bn: "স্ট্যাম্প শুল্ক (ই-চালান)", en: "Stamp duty (e-challan)" },
            moneySaid(stamp.valueMoney)
          ),
          line({ bn: "পরিশোধের তারিখ", en: "Paid on" }, day),
          line({ bn: "ই-চালান নম্বর", en: "e-challan no." }, stamp.serial),
        ],
      };
    }
    default: {
      return {
        heading: { bn: "স্ট্যাম্প", en: "Stamp" },
        rows: [
          line(
            { bn: "স্ট্যাম্প মূল্য", en: "Stamp value" },
            moneySaid(stamp.valueMoney)
          ),
          line({ bn: "স্ট্যাম্পের তারিখ", en: "Stamped on" }, day),
          line({ bn: "স্ট্যাম্প সিরিয়াল", en: "Stamp serial" }, stamp.serial),
        ],
      };
    }
  }
};

/** Their capital as it arrived: each movement with its day and bank reference, and what the farm holds of it. */
const capitalTable = (facts: JoiningLetterFacts): PaperSection => ({
  kind: "table",
  heading: { bn: "প্রাপ্ত মূলধন", en: "Capital received" },
  columns: [
    { label: { bn: "তারিখ", en: "Date" } },
    { label: { bn: "ব্যাংকের রেফারেন্স", en: "Bank reference" } },
    { label: { bn: "টাকা", en: "Amount" }, figures: true },
  ],
  rows: facts.capital.map((one) => [
    daySaid(one.movedOn),
    one.kind === "returned"
      ? {
          bn: `${one.reference} · ফেরত`,
          en: `${one.reference} · returned`,
        }
      : one.reference,
    one.kind === "returned"
      ? {
          bn: `− ${moneySaid(one.amountMoney).bn}`,
          en: `− ${moneySaid(one.amountMoney).en}`,
        }
      : moneySaid(one.amountMoney),
  ]),
  foot: [{ bn: "মোট", en: "Total" }, "", moneySaid(facts.totalCapitalMoney)],
  note: null,
});

/**
 * A Venture paid by the month: their Units' Monthly Sums, and what the letter acknowledges — in the words the advisers
 * approved on 2026-10-02. Nothing for any other Venture.
 */
const monthlySumsTable = (
  sums: JoiningLetterFacts["monthlySums"]
): PaperSection[] =>
  sums && sums.length > 0
    ? [
        {
          kind: "table",
          heading: { bn: "মাসের টাকার তালিকা", en: "Monthly Sums" },
          columns: [
            { label: { bn: "তারিখ", en: "Due on" } },
            { label: { bn: "টাকা", en: "Amount" }, figures: true },
          ],
          rows: sums.map((one) => [
            daySaid(one.dueOn),
            moneySaid(one.amountMoney),
          ]),
          foot: null,
          note: {
            bn: "এই পত্র গরু কেনার অংশ প্রাপ্তির স্বীকৃতি; মাসের টাকা এলে তা অগ্রগতি প্রতিবেদনে দেখানো হবে।",
            en: "This letter acknowledges the Cattle Part received; Monthly Sums, as they come, are shown on the progress statement.",
          },
        },
      ]
    : [];

/** Who signs the letter: the Investor — or an Organization's Signatory for it — and the Owner for the Farm. */
const signersOf = (facts: JoiningLetterFacts) => {
  const { organization } = facts.him;
  const investor = organization
    ? {
        role: { bn: "বিনিয়োগকারী প্রতিষ্ঠানের পক্ষে", en: "For the Investor" },
        name: organization.signatory.name,
      }
    : { role: { bn: "বিনিয়োগকারী", en: "Investor" }, name: facts.him.name };
  return [
    investor,
    { role: { bn: "খামারের পক্ষে", en: "For the Farm" }, name: facts.ownerName },
  ];
};

/**
 * The paper an Investor gets when they join: that the Farm has their money, and what they have agreed to.
 *
 * Every arrival is printed with its own day and bank reference rather than summed into one figure, because the whole
 * use of this paper is that a person can hold it beside their own bank statement and see the same lines. A total
 * nobody can check against anything is not an acknowledgment.
 */
export const joiningLetterPaper = (
  facts: JoiningLetterFacts
): PaperDocument => {
  if (facts.capital.length === 0) {
    throw new Error(
      "a joining letter cannot acknowledge capital that has not arrived"
    );
  }
  const { organization } = facts.him;
  const stamp = stampRows(facts.stamp);
  const [first, ...later] = facts.terms;
  const terms: PaperSection[] = [
    ...(first
      ? [
          {
            kind: "clauses" as const,
            heading: { bn: "শর্তাবলি", en: "Terms" },
            clauses: first.clauses,
          },
        ]
      : []),
    ...later.map((part) => ({
      kind: "clauses" as const,
      heading: part.heading,
      clauses: part.clauses,
    })),
  ];
  const amended = facts.amendedOn ? daySaid(facts.amendedOn) : null;
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "যোগদানপত্র", en: "Investor joining letter" },
    preamble: amended
      ? {
          bn: `নিচের শর্তাবলি ${amended.bn} তারিখের সংশোধনী অনুযায়ী।`,
          en: `The terms below are as amended on ${amended.en}.`,
        }
      : { bn: "", en: "" },
    sections: [
      {
        kind: "parties",
        heading: organization
          ? { bn: "বিনিয়োগকারী প্রতিষ্ঠান", en: "The Investor" }
          : { bn: "বিনিয়োগকারী", en: "The Investor" },
        parties: [
          {
            role: { bn: "", en: "" },
            rows: investorRows(facts.him),
            // An Organization names no Nominee: its share is its own (ADR 0020).
            nominees: organization ? [] : facts.him.nominees.map(nomineeRowOf),
            lines: [],
          },
        ],
      },
      {
        kind: "facts",
        heading: { bn: "ভেঞ্চার ও ইউনিট", en: "Venture and Units" },
        rows: [
          line({ bn: "ভেঞ্চার", en: "Venture" }, facts.ventureName),
          line(
            { bn: "প্রতি ইউনিট", en: "Unit price" },
            moneySaid(facts.unitPriceMoney)
          ),
          line({ bn: "ইউনিট", en: "Units held" }, countSaid(facts.units)),
        ],
        note: null,
      },
      capitalTable(facts),
      ...monthlySumsTable(facts.monthlySums),
      ...terms,
      { kind: "facts", heading: stamp.heading, rows: stamp.rows, note: null },
      {
        kind: "signatures",
        heading: { bn: "স্বাক্ষর", en: "Signatures" },
        signers: signersOf(facts),
        dateBlank: null,
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    closing: [NO_GUARANTEE],
    produced: {
      bn: `${facts.producedAt.bn} · ${facts.producedBy}`,
      en: `${facts.producedAt.en} · ${facts.producedBy}`,
    },
  };
};
