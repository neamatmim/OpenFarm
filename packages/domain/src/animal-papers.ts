import { formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { producedSaid } from "./investor-statements";
import { NONE } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { Produced } from "./paper-saying";
import { dayOrNone } from "./paper-saying";
import type { PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { DocumentRow, Said, Worded } from "./papers";

/**
 * Whether her meat may be sold today, and when it may if not, and a Vet's shortening of the hold when there has been
 * one — on the paper and not only in the trail, because a farm saying "clear" on a hold somebody cut short, without
 * saying so, is asking to be taken at its word exactly where its word is not enough.
 */
export interface WithdrawalStanding {
  clear: boolean;
  /** The farm day she becomes clear, when she is not clear today. */
  clearOn: string | null;
  shortened: {
    on: string;
    reason: string | null;
    /** What her doses alone said, before it was shortened. */
    wouldHaveRunTo: string | null;
  } | null;
}

/** One dose she has had, as both papers report it. */
export interface DoseOnPaper {
  product: Said;
  givenOn: string;
  /** Nothing where the product holds nothing for meat. */
  meatClearOn: string | null;
  /** The Vet who prescribed it, or nothing for a dose given on a campaign over her Pen, or without a Prescription. */
  prescribedBy: string | null;
  /** For a dose given without a Prescription, who advised it and why; nothing for a course's dose or a campaign's. */
  advice: string | null;
  givenBy: string | null;
}

/** Her standing for meat as one line. */
const standingSaid = ({ clear, clearOn }: WithdrawalStanding): Said => {
  if (clear) {
    return { bn: "মুক্ত", en: "Clear" };
  }
  const from = clearOn ? daySaid(clearOn) : null;
  return from
    ? {
        bn: `মুক্ত নয় — ${from.bn} থেকে মুক্ত`,
        en: `Not clear — clear from ${from.en}`,
      }
    : { bn: "মুক্ত নয়", en: "Not clear" };
};

/** The standing and, where a Vet cut the hold short, when, what the doses alone said, and why. */
const standingRows = (standing: WithdrawalStanding): DocumentRow[] => {
  const { shortened } = standing;
  return [
    {
      label: { bn: "মাংসের জন্য", en: "For meat" },
      value: standingSaid(standing),
    },
    ...(shortened
      ? [
          {
            label: { bn: "ভেট অপেক্ষমাণ সময় কমিয়েছেন", en: "Shortened by a vet" },
            value: daySaid(shortened.on),
          },
          ...(shortened.wouldHaveRunTo
            ? [
                {
                  label: {
                    bn: "ওষুধ অনুযায়ী চলত",
                    en: "Doses alone would have run to",
                  },
                  value: daySaid(shortened.wouldHaveRunTo),
                },
              ]
            : []),
          ...(shortened.reason?.trim()
            ? [
                {
                  label: { bn: "কারণ", en: "Reason" },
                  value: shortened.reason,
                },
              ]
            : []),
        ]
      : []),
  ];
};

/** Where a dose came from: a Vet's prescription, a campaign over her Pen, or advice without a Prescription. */
const doseSource = (dose: DoseOnPaper): Said => {
  if (dose.prescribedBy) {
    return {
      bn: `ব্যবস্থাপত্র: ${dose.prescribedBy}`,
      en: `Prescribed by ${dose.prescribedBy}`,
    };
  }
  return dose.advice === null
    ? { bn: "পেনভিত্তিক কর্মসূচি", en: "Campaign" }
    : {
        bn: `ব্যবস্থাপত্র ছাড়া: ${dose.advice}`,
        en: `Not prescribed: ${dose.advice}`,
      };
};

/** Her doses as a table — when, what, when it leaves her meat clear, where it came from and who gave it — or a line
 *  saying there were none. */
const dosesPart = (
  heading: Said,
  doses: readonly DoseOnPaper[],
  none: Said
): PaperSection =>
  doses.length === 0
    ? { kind: "facts", heading, rows: [], note: none }
    : {
        kind: "table",
        heading,
        columns: [
          { label: { bn: "দিন", en: "Given" }, whole: true },
          { label: { bn: "ওষুধ", en: "Product" } },
          { label: { bn: "মাংসের জন্য মুক্ত", en: "Clear for meat" }, whole: true },
          { label: { bn: "কোথা থেকে", en: "Source" } },
          { label: { bn: "যিনি দিয়েছেন", en: "Given by" } },
        ],
        rows: doses.map((dose): Worded[] => [
          daySaid(dose.givenOn),
          dose.product,
          dose.meatClearOn
            ? daySaid(dose.meatClearOn)
            : { bn: "অপেক্ষা নেই", en: "No meat withdrawal" },
          doseSource(dose),
          dose.givenBy ?? NONE,
        ]),
        foot: null,
        note: null,
      };

/** What the passport prints from: everything the farm knows about one animal. */
export interface PassportFacts extends Produced {
  farm: FarmIdentity;
  tagNumber: string;
  sex: "female" | "male";
  breed: Said | null;
  /** Her birth day where the farm knows it, else what the seller said of her age at Intake, a judgment labeled as one. */
  born: string | null;
  estimatedAgeMonths: number | null;
  /** Bought, and from whom where the farm wrote it down; nothing for one born here. */
  boughtFrom: { seller: string | null } | null;
  arrivedOn: string | null;
  /** Every Pen she stood in, newest first; nothing until for the one she still stands in. */
  pens: { penName: string; from: string; until: string | null }[];
  doses: DoseOnPaper[];
  /** Every reading, newest first. */
  weighIns: { kg: number; on: string }[];
  withdrawal: WithdrawalStanding;
  /** A list longer than the paper: the farm says so rather than letting a reader believe they have seen everything. */
  moreThanShown: boolean;
  /** Where she went, when she was sold. */
  leftFor: string | null;
  /** How she left and when, for a death, a cull or a write-off as Lost; nothing for a Sale or while she is here. */
  left: { how: "died" | "culled" | "lost"; on: string } | null;
}

/** How an animal left the farm other than by a Sale, as every paper says it (CONTEXT: Exit). */
const LEFT: Record<NonNullable<PassportFacts["left"]>["how"], Said> = {
  died: { bn: "মারা গেছে", en: "Died" },
  culled: { bn: "বাদ দেওয়া", en: "Culled" },
  lost: { bn: "হারিয়ে গেছে", en: "Lost" },
};

/** What she is, as her paper's first part says it, a line left out where the farm knows nothing to put on it. */
const identityRows = (facts: PassportFacts): DocumentRow[] => {
  const { boughtFrom, left } = facts;
  let age: Worded | null = null;
  if (facts.born) {
    age = daySaid(facts.born);
  } else if (facts.estimatedAgeMonths !== null) {
    age = {
      bn: `আনুমানিক ${formatNumber(facts.estimatedAgeMonths, "bn")} মাস (আসার সময়)`,
      en: `About ${formatNumber(facts.estimatedAgeMonths, "en")} months, estimated at intake`,
    };
  }
  let source: Said = { bn: "খামারে জন্ম", en: "Born here" };
  if (boughtFrom) {
    source = boughtFrom.seller
      ? {
          bn: `${boughtFrom.seller} থেকে কেনা`,
          en: `Bought from ${boughtFrom.seller}`,
        }
      : { bn: "কেনা", en: "Bought" };
  }
  const rows: (DocumentRow | null)[] = [
    { label: { bn: "ট্যাগ নম্বর", en: "Tag number" }, value: facts.tagNumber },
    {
      label: { bn: "লিঙ্গ", en: "Sex" },
      value:
        facts.sex === "female"
          ? { bn: "স্ত্রী", en: "Female" }
          : { bn: "পুরুষ", en: "Male" },
    },
    facts.breed
      ? { label: { bn: "জাত", en: "Breed" }, value: facts.breed }
      : null,
    age
      ? {
          label: facts.born
            ? { bn: "জন্ম", en: "Born" }
            : { bn: "বয়স", en: "Age" },
          value: age,
        }
      : null,
    { label: { bn: "উৎস", en: "Source" }, value: source },
    facts.arrivedOn
      ? {
          label: { bn: "আসার তারিখ", en: "Arrived" },
          value: daySaid(facts.arrivedOn),
        }
      : null,
    facts.leftFor
      ? { label: { bn: "যেখানে গেছে", en: "Left for" }, value: facts.leftFor }
      : null,
    left
      ? {
          label: { bn: "চলে গেছে", en: "Left" },
          value: {
            bn: `${LEFT[left.how].bn} · ${daySaid(left.on).bn}`,
            en: `${LEFT[left.how].en} · ${daySaid(left.on).en}`,
          },
        }
      : null,
  ];
  return rows.filter((one) => one !== null);
};

/** That a list on the paper is longer than the paper, said rather than letting a reader believe they have seen
 *  everything. */
const EARLIER_NOT_SHOWN: Said = {
  bn: "কিছু আগের রেকর্ড এই পাতায় আসেনি।",
  en: "Some earlier records are not on this page.",
};

/**
 * Everything the farm knows about one animal, on one page: what she is and where she came from, whether her meat may be
 * sold, every Pen she stood in, what she has been given and every time she was weighed. On the Farm Identity
 * letterhead, read in Bangla or English. Produced for an animal who has already gone as readily as for one standing in
 * the shed — that is exactly when a buyer or a slaughter vet asks.
 */
export const animalPassportPaper = (facts: PassportFacts): PaperDocument => ({
  letterhead: letterheadOf(facts.farm),
  title: { bn: "পশুর পরিচয়পত্র", en: "Animal passport" },
  preamble: {
    bn: `${facts.tagNumber} সম্পর্কে খামার যা জানে।`,
    en: `Everything the farm knows about ${facts.tagNumber}.`,
  },
  sections: [
    {
      kind: "facts",
      heading: { bn: "পরিচয়", en: "Identity" },
      rows: identityRows(facts),
      note: null,
    },
    {
      kind: "facts",
      heading: { bn: "অপেক্ষমাণ সময়", en: "Withdrawal" },
      rows: standingRows(facts.withdrawal),
      note: null,
    },
    facts.pens.length === 0
      ? {
          kind: "facts",
          heading: { bn: "যেসব পেনে ছিল", en: "Pen history" },
          rows: [],
          note: { bn: "কোনো পেন লেখা নেই।", en: "No pen recorded." },
        }
      : {
          kind: "table",
          heading: { bn: "যেসব পেনে ছিল", en: "Pen history" },
          columns: [
            { label: { bn: "পেন", en: "Pen" } },
            { label: { bn: "থেকে", en: "From" }, whole: true },
            { label: { bn: "পর্যন্ত", en: "Until" }, whole: true },
          ],
          rows: facts.pens.map((spell) => [
            spell.penName,
            daySaid(spell.from),
            spell.until
              ? daySaid(spell.until)
              : { bn: "এখনো আছে", en: "Still there" },
          ]),
          foot: null,
          note: null,
        },
    dosesPart(
      { bn: "চিকিৎসা ও অপেক্ষমাণ সময়", en: "Treatments and withdrawal" },
      facts.doses,
      { bn: "কোনো চিকিৎসা লেখা নেই।", en: "No treatment recorded." }
    ),
    facts.weighIns.length === 0
      ? {
          kind: "facts",
          heading: { bn: "ওজনের রেকর্ড", en: "Weigh-ins" },
          rows: [],
          note: { bn: "কোনো ওজন লেখা নেই।", en: "No weigh-in recorded." },
        }
      : {
          kind: "table",
          heading: { bn: "ওজনের রেকর্ড", en: "Weigh-ins" },
          columns: [
            { label: { bn: "দিন", en: "Day" }, whole: true },
            { label: { bn: "ওজন, কেজি", en: "Weight, kg" }, figures: true },
          ],
          rows: facts.weighIns.map((one) => [
            daySaid(one.on),
            { bn: formatNumber(one.kg, "bn"), en: formatNumber(one.kg, "en") },
          ]),
          foot: null,
          note: null,
        },
  ],
  // Said at the foot of the whole paper: a list cut short may be her pens, her doses or her weigh-ins.
  closing: facts.moreThanShown ? [EARLIER_NOT_SHOWN] : [],
  produced: producedSaid(facts.producedAt, facts.producedBy),
});

/** What the withdrawal summary prints from: her standing today, and what she has had lately. */
export interface WithdrawalSummaryFacts extends Produced {
  farm: FarmIdentity;
  tagNumber: string;
  /** The farm day it was asked. */
  asOf: string;
  withdrawal: WithdrawalStanding;
  /** Everything given inside the look-back, and any older dose still holding her, newest first. */
  doses: DoseOnPaper[];
  lookBackDays: number;
}

/**
 * The sharp question on its own page: has she had anything lately, and may her meat be sold today. The answer comes
 * first, because this is the paper somebody reads at a slaughterhouse gate with a lorry behind them; the doses follow
 * it — a buyer asked what she has had, not only whether she is clear this morning.
 */
export const withdrawalSummaryPaper = (
  facts: WithdrawalSummaryFacts
): PaperDocument => {
  const day = daySaid(facts.asOf);
  const from = dayOrNone(facts.withdrawal.clearOn);
  const tag = facts.tagNumber;
  let answer: Said = {
    bn: `${tag}: ${day.bn} তারিখে মাংসের জন্য মুক্ত।`,
    en: `${tag} is clear for meat on ${day.en}.`,
  };
  if (!facts.withdrawal.clear) {
    answer = facts.withdrawal.clearOn
      ? {
          bn: `${tag}: ${day.bn} তারিখে মাংসের জন্য মুক্ত নয়; ${from.bn} থেকে মুক্ত।`,
          en: `${tag} is not clear for meat on ${day.en}: clear from ${from.en}.`,
        }
      : {
          bn: `${tag}: ${day.bn} তারিখে মাংসের জন্য মুক্ত নয়।`,
          en: `${tag} is not clear for meat on ${day.en}.`,
        };
  }
  return {
    letterhead: letterheadOf(facts.farm),
    title: {
      bn: "চিকিৎসা ও অপেক্ষমাণ সময়ের সারসংক্ষেপ",
      en: "Treatment and withdrawal summary",
    },
    preamble: answer,
    sections: [
      {
        kind: "facts",
        heading: { bn: "অপেক্ষমাণ সময়", en: "Withdrawal" },
        rows: [
          { label: { bn: "ট্যাগ নম্বর", en: "Tag number" }, value: tag },
          { label: { bn: "তারিখ", en: "As of" }, value: day },
          ...standingRows(facts.withdrawal),
        ],
        note: null,
      },
      dosesPart(
        {
          bn: `গত ${formatNumber(facts.lookBackDays, "bn")} দিনের চিকিৎসা`,
          en: `Treatments in the last ${formatNumber(facts.lookBackDays, "en")} days`,
        },
        facts.doses,
        {
          bn: "এই সময়ে কিছু দেওয়া হয়নি।",
          en: "Nothing was given in this time.",
        }
      ),
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
