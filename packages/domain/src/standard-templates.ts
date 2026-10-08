import type {
  TemplateContent,
  TemplateKind,
  TemplateSection,
} from "./paper-template";
import type { Said } from "./papers";

/**
 * The wording OpenFarm gives a farm to start from, one for each kind of paper: what every farm has before its Owner
 * changes a word. Drafts for the farm's lawyer to read, not advice — the lawyer's and the Shariah scholar's answers
 * (the investor map's ticket 11) are what make any of them fit to sign, and a Version records who approved it and
 * when.
 *
 * The Investment Agreement is what the farm printed before its wording could be edited — kept whole, so the Agreements
 * signed then are recorded against the words they were — with the data section and the nominee lines added to it for
 * the Personal Data Protection Act 2026. The Master Agreement and its Venture Schedule are the shape the Owner asked
 * the lawyer about — one stamped agreement per Investor, and a short schedule for each Venture he joins — and wait on
 * that answer before anybody signs one.
 */

const PARTIES: TemplateSection = {
  kind: "parties",
  heading: { bn: "চুক্তির পক্ষ", en: "Parties" },
  first: { bn: "প্রথম পক্ষ — মুদারিব", en: "First party — Mudarib" },
  second: { bn: "দ্বিতীয় পক্ষ — বিনিয়োগকারী", en: "Second party — Investor" },
};

const STAMP: TemplateSection = {
  kind: "stamp",
  heading: { bn: "স্ট্যাম্প বা ই-চালান", en: "Stamp or e-challan" },
};

const SIGNATURES: TemplateSection = {
  kind: "signatures",
  heading: { bn: "স্বাক্ষর", en: "Signatures" },
  witnesses: 2,
};

const BANK_ONLY = {
  bn: "মূলধন কেবল ভেঞ্চারের ব্যাংক হিসাবে ব্যাংকের মাধ্যমে দেওয়া হবে, নগদে নয়।",
  en: "Capital is paid by bank into the Venture Account only, never in cash.",
};

/** The Venture and his part of it, line by line. */
const HIS_PART_ROWS = [
  { label: { bn: "ভেঞ্চার", en: "Venture" }, value: "{ventureName}" },
  { label: { bn: "ইউনিট", en: "Units" }, value: "{units}" },
  {
    label: { bn: "প্রতি ইউনিটের মূল্য", en: "Price per Unit" },
    value: "{unitPrice} টাকা",
  },
  { label: { bn: "মোট মূলধন", en: "Total capital" }, value: "{capital} টাকা" },
];

const WINDOW_ROWS = [
  {
    label: { bn: "বিক্রয়ের লক্ষ্য সময়", en: "Target sale window" },
    value: "{windowStart} – {windowEnd}",
  },
  {
    label: { bn: "গুটিয়ে আনার সময়", en: "Wind-up period" },
    value: "{windUpDays} দিন",
  },
];

/**
 * The Investment Agreement exactly as the farm printed it before its wording could be edited, in Bangla, with its
 * English new beside it: what the Agreements signed then are recorded against, and never the standard wording since.
 */
export const FIRST_PRINTED_AGREEMENT: TemplateContent = {
  title: { bn: "মুদারাবা বিনিয়োগ চুক্তি", en: "Mudarabah Investment Agreement" },
  preamble: {
    bn: "এই চুক্তি ____________ তারিখে নিচের দুই পক্ষের মধ্যে সম্পাদিত হলো।",
    en: "This Agreement is made on ____________ between the two parties below.",
  },
  sections: [
    PARTIES,
    {
      kind: "facts",
      heading: { bn: "ভেঞ্চার ও মূলধন", en: "Venture and capital" },
      rows: [...HIS_PART_ROWS, ...WINDOW_ROWS],
      note: BANK_ONLY,
    },
    {
      kind: "clauses",
      heading: { bn: "শর্তাবলি", en: "Terms" },
      clauses: [
        {
          bn: "এটি একটি মুদারাবা চুক্তি: আপনার মূলধন, খামারের পরিচালনা।",
          en: "This is a mudarabah: your capital, the Farm's management.",
        },
        {
          bn: "মুনাফা ভাগ হবে বিনিয়োগকারী {investorsPercent}% এবং খামার {farmPercent}%, মূলধন সম্পূর্ণ ফেরতের পর।",
          en: "Profit is shared {investorsPercent}% to the Investor and {farmPercent}% to the Farm, after capital has been returned in full.",
        },
        {
          bn: "ক্ষতি হলে তা মূলধন থেকে যাবে; খামার কোনো মুনাফার নিশ্চয়তা দেয় না।",
          en: "A loss falls on capital; the Farm guarantees no profit.",
        },
        {
          bn: "কোনো পশু মারা গেলে তা এই ভেঞ্চারের ক্ষতি, কোনো একজন বিনিয়োগকারীর নয়।",
          en: "An animal that dies is a loss to this Venture, not to any one Investor.",
        },
        {
          bn: "বিক্রয়ের লক্ষ্য সময়: {windowStart} থেকে {windowEnd}।",
          en: "Target sale window: {windowStart} to {windowEnd}.",
        },
        {
          bn: "এরপর {windUpDays} দিনের গুটিয়ে আনার সময়; সে সময়ের পরেও যে পশু থাকবে খামার তা কিনে নেবে। ভেঞ্চার শেষ হওয়ার আগে মূলধন তুলে নেওয়ার সুযোগ নেই।",
          en: "Then a wind-up period of {windUpDays} days; the Farm buys any animal still unsold after it. Capital cannot be withdrawn before the Venture ends.",
        },
        {
          bn: "মতভেদ হলে সালিস: {arbitrator}।",
          en: "Any dispute goes to arbitration by {arbitrator}.",
        },
      ],
    },
    STAMP,
    SIGNATURES,
  ],
};

/**
 * The five rules a Nominee stands by, the same on every paper that names them: a share of the collecting, never of the
 * inheritance; a Nominee who dies first; a minor's Receiver; the Farm clear once it pays; and the latest মনোনয়নপত্র.
 * From the several-nominees map's wording draft, for the lawyer to read.
 */
const NOMINEE_RULES: Said[] = [
  {
    bn: "প্রত্যেক নমিনি তাঁর অংশটুকু খামার থেকে সংগ্রহ করে বিনিয়োগকারীর আইনগত উত্তরাধিকারীদের বুঝিয়ে দেবেন। অংশ কেবল বলে কে কতটুকু সংগ্রহ করবেন; কে উত্তরাধিকারী আর কে কত পাবেন, তা আইন ঠিক করে।",
    en: "Each Nominee collects their part from the Farm and hands it to the Investor's lawful heirs. A share says only who collects how much; who inherits, and how much, the law decides.",
  },
  {
    bn: "বিনিয়োগকারীর আগে কোনো নমিনি মারা গেলে তাঁর অংশ বাকি নমিনিরা নিজ নিজ অংশের অনুপাতে সংগ্রহ করবেন; কেউ না থাকলে টাকা সরাসরি আইনগত উত্তরাধিকারীদের দেওয়া হবে।",
    en: "If a Nominee dies before the Investor, the others collect their part in proportion to their own shares; if none is left, the money is paid to the lawful heirs.",
  },
  {
    bn: "নমিনির বয়স আঠারো না হওয়া পর্যন্ত তাঁর অংশ তাঁর গ্রহণকারী সংগ্রহ করবেন; আঠারো হলে নমিনি নিজেই সংগ্রহ করবেন।",
    en: "Until a Nominee turns eighteen, their Receiver collects their part; from eighteen, the Nominee collects it.",
  },
  {
    bn: "খামার কোনো নমিনিকে বা নাবালক নমিনির গ্রহণকারীকে তাঁর অংশ দিলে সেই অংশের দায় থেকে খামার মুক্ত; উত্তরাধিকারীরা তাঁদের পাওনা যাঁকে দেওয়া হয়েছে তাঁর কাছ থেকে বুঝে নেবেন।",
    en: "Once the Farm pays a Nominee, or a minor Nominee's Receiver, their part, it owes nothing more for that part; the heirs settle what they are owed with whoever was paid.",
  },
  {
    bn: "বিনিয়োগকারী পরে নতুন মনোনয়নপত্রে সই করলে সেটিই তাঁর সব চুক্তির জন্য প্রযোজ্য হবে।",
    en: "If the Investor later signs a new Nomination, that one governs all their Agreements.",
  },
];

/** What the Investor confirms of every Nominee a paper names, printed under him beside the table. */
const EACH_NOMINEE_KNOWS: Said = {
  bn: "বিনিয়োগকারী নিশ্চিত করছেন যে তাঁর প্রত্যেক নমিনি জানেন, খামার তাঁদের নাম, সম্পর্ক, জন্মতারিখ ও ফোন রাখছে, শুধু বিনিয়োগকারীর উত্তরাধিকারীদের টাকা দেওয়ার জন্য।",
  en: "The Investor confirms that each Nominee knows the Farm holds their name, relationship, date of birth and phone, only to pay the Investor's heirs.",
};

/** Printed once for each minor Nominee, and only for them, and signed by their Receiver. */
const RECEIVER_LINE: Said = {
  bn: "নমিনি {nomineeName}-এর বয়স আঠারো বছরের কম। তাঁর গ্রহণকারী হিসেবে আমি, {receiverName} ({receiverRelation}), আঠারো বছর না হওয়া পর্যন্ত তাঁর অংশ সংগ্রহ করতে এবং তাঁর এই তথ্য রাখায় সম্মতি দিচ্ছি। সই: ____________",
  en: "Nominee {nomineeName} is under eighteen. As their Receiver I, {receiverName} ({receiverRelation}), agree to collect their part until they turn eighteen, and consent to their data being kept. Signature: ____________",
};

/** Printed in place of the table when an Investor names no Nominee. */
const NO_NOMINEE_LINE: Said = {
  bn: "বিনিয়োগকারী কোনো নমিনি মনোনীত করেননি। তাঁর মৃত্যু হলে তাঁর মূলধন ও প্রাপ্য তাঁর আইনগত উত্তরাধিকারীদের দেওয়া হবে, সাধারণত উত্তরাধিকার সনদ দেখে।",
  en: "The Investor has named no Nominee. If they die, their capital and share are paid to their lawful heirs, usually against a succession certificate.",
};

/**
 * The Terms' clause on the Investor's death, opening the five rules: the money goes to the heirs — through the
 * Nominees where they named any, and otherwise straight to the heirs. Worded to read right on a paper naming nobody.
 */
const HEIRS_CLAUSE: Said = {
  bn: "বিনিয়োগকারীর মৃত্যু হলে তাঁর মূলধন ও প্রাপ্য তাঁর আইনগত উত্তরাধিকারীদের দেওয়া হবে — নমিনি থাকলে তাঁদের মাধ্যমে, নিচের নিয়মে; না থাকলে সরাসরি, সাধারণত উত্তরাধিকার সনদ দেখে।",
  en: "If the Investor dies, their capital and share are paid to their lawful heirs — through their Nominees where they named any, as follows; otherwise directly, usually against a succession certificate.",
};

/** What the Farm holds of the Investor to keep the Agreement: the Data part's first clause. */
const DATA_HOLDS: Said = {
  bn: "এই চুক্তি পালন করতে, বিনিয়োগকারীকে টাকা দিতে এবং আইন যে হিসাব রাখতে বলে তা রাখতে খামার বিনিয়োগকারীর নাম, ফোন, ঠিকানা, এনআইডি নম্বর, ব্যাংক হিসাব, আর তাঁর নমিনি ও গ্রহণকারীর তথ্য, আর এই চুক্তির সব টাকার হিসাব রাখবে।",
  en: "To keep this Agreement, pay the Investor and keep the books the law requires, the Farm holds the Investor's name, phone, address, NID number, bank account, the details of their Nominees and Receivers, and every money record under this Agreement.",
};

/**
 * তথ্য / Data: what the farm holds of the Investor to keep the Agreement, where, who sees it, for how long, and what he
 * may ask — resting the record on the Agreement itself, and keeping the portal apart from it. From the investor-portal
 * map's draft for the lawyer.
 */
const DATA: TemplateSection = {
  kind: "clauses",
  heading: { bn: "তথ্য", en: "Data" },
  clauses: [
    DATA_HOLDS,
    {
      bn: "এই তথ্য সিঙ্গাপুরে খামারের পক্ষে চালানো একটি সার্ভারে রাখা হয়, আর প্রতি রাতে এর একটি তালাবদ্ধ (এনক্রিপ্ট করা) কপি অন্য জায়গায় রাখা হয়।",
      en: "This data is kept on a server in Singapore run for the Farm, and an encrypted copy is kept elsewhere each night.",
    },
    {
      bn: "খামারে বিনিয়োগকারীর ব্যক্তিগত তথ্য শুধু মালিক দেখেন। টাকা পাঠাতে ব্যাংক এবং আইন চাইলে কর কর্তৃপক্ষ ছাড়া আর কাউকে তা দেওয়া হয় না।",
      en: "At the Farm, only the Owner sees the Investor's personal data. It is given to nobody but the bank, to make payments, and the tax authority where the law requires.",
    },
    {
      bn: "শেষ ভেঞ্চারের হিসাব মেটার পর বারো বছর এই তথ্য রাখা হবে, কারণ আইন খামারকে এতদিন হিসাবের খাতা রাখতে বলে।",
      en: "It is kept for twelve years after the last Venture settles, because the law asks the Farm to keep its books that long.",
    },
    {
      bn: "বিনিয়োগকারী যেকোনো সময় মালিককে লিখে তাঁর তথ্যের কপি চাইতে, ভুল ঠিক করাতে বা মুছে ফেলতে বলতে পারেন; আইন যা রাখতে বলে তা ছাড়া। বিস্তারিত “আপনার তথ্য” কাগজে আছে, যা এই চুক্তির সঙ্গে দেওয়া হলো।",
      en: 'The Investor may at any time write to the Owner to have a copy of their data, have it corrected, or have it erased, except what the law requires be kept. The details are in "আপনার তথ্য", handed over with this Agreement.',
    },
    {
      bn: "খামারের অনলাইন পোর্টালে নিজের হিসাব দেখানো এই চুক্তির অংশ নয়; তা হবে শুধু বিনিয়োগকারী আলাদা সম্মতিপত্রে সই করলে।",
      en: "Showing the Investor their own record in the Farm's online portal is not part of this Agreement; it happens only if the Investor signs a separate consent.",
    },
  ],
};

/**
 * The standard Investment Agreement from the several-nominees wording (2026-09-26) until the clauses for capital paid by
 * the month were added (2026-10-02): kept whole, so a farm still on exactly these words can be caught up to the
 * standard that followed, and a farm that changed them is left with its own.
 */
export const STANDARD_AGREEMENT_BEFORE_MONTHLY: TemplateContent = {
  ...FIRST_PRINTED_AGREEMENT,
  sections: FIRST_PRINTED_AGREEMENT.sections.flatMap(
    (section): TemplateSection[] => {
      if (section.kind === "parties") {
        return [
          {
            ...section,
            nomineeLines: [EACH_NOMINEE_KNOWS],
            receiverLine: RECEIVER_LINE,
            noNomineeLine: NO_NOMINEE_LINE,
          },
        ];
      }
      if (section.kind !== "clauses") {
        return [section];
      }
      // The heirs clause and its rules go before the last term, the Arbitrator, who settles any dispute over them too.
      const arbitration = section.clauses.at(-1);
      const terms = {
        ...section,
        clauses: [
          ...section.clauses.slice(0, -1),
          HEIRS_CLAUSE,
          ...NOMINEE_RULES,
          ...(arbitration ? [arbitration] : []),
        ],
      };
      return [terms, DATA];
    }
  ),
};

/** The two rows "Venture and capital" adds for a Venture paid by the month, after the total capital. */
const PAID_BY_THE_MONTH_ROWS = [
  {
    label: { bn: "গরু কেনার অংশ (প্রতি ইউনিট)", en: "Cattle Part (per Unit)" },
    value: "{cattlePart} টাকা, কেনা শুরুর আগে",
    only: "by_the_month" as const,
  },
  {
    label: { bn: "মাসের টাকা (প্রতি ইউনিট)", en: "Monthly Sum (per Unit)" },
    value:
      "{monthlySum} টাকা, {firstSumDue} থেকে {lastSumDue} পর্যন্ত প্রতি মাসের ১০ তারিখে ({sums})",
    only: "by_the_month" as const,
  },
];

/**
 * The clauses for capital paid by the month, M1–M7, as the lawyer and the Shariah scholar approved them on 2026-10-02
 * (`.scratch/openfarm-paid-monthly/clauses-sheet.html`): after the profit and loss clauses, before the sale window.
 * Printed only on the Agreement of a Venture paid by the month.
 */
const PAID_BY_THE_MONTH_TERMS = [
  {
    bn: "বিনিয়োগকারী তাঁর মূলধন দুই ভাগে দেবেন: প্রতি ইউনিটের গরু কেনার অংশ কেনা শুরুর আগে, আর বাকিটা ওপরের তালিকা অনুযায়ী প্রতি মাসের ১০ তারিখে। তাঁর মোট মূলধন ওপরে লেখা পুরো অঙ্ক।",
    en: "The Investor pays their capital in two parts: each Unit's Cattle Part before buying starts, and the rest in the Monthly Sums above, each on the 10th of its month. Their total capital is the full amount written above.",
  },
  {
    bn: "গরু কেনার অংশ দিয়ে কেবল পশু কেনা হবে; মাসের টাকা দিয়ে পশুর খাবার, ওষুধ ও যত্ন। সব বিনিয়োগকারীর গরু কেনার অংশ না আসা পর্যন্ত কেনা শুরু হবে না।",
    en: "The Cattle Parts buy the animals only; the Monthly Sums keep them — feed, medicine and care. Buying does not start until every Investor's Cattle Part is in.",
  },
  {
    bn: "কোনো মাসের টাকা সেই মাসের ১০ তারিখের পর সাত দিনের মধ্যে না এলে তা বাকি পড়েছে বলে গণ্য হবে। বাকি পড়া টাকা পশু বিক্রি শুরুর আগ পর্যন্ত দেওয়া যাবে, এবং দেওয়া হলে তা অন্য যেকোনো মূলধনের মতোই গণ্য হবে; বিক্রি শুরুর পর আর নেওয়া হবে না।",
    en: "A Monthly Sum not received within seven days of its 10th is missed. A missed sum may still be paid until selling begins, and then counts like any other capital; once selling has begun it is not taken.",
  },
  {
    bn: "হিসাব নিকাশে মুনাফা বা ক্ষতির ভাগ হবে প্রত্যেক বিনিয়োগকারী আসলে যত মূলধন দিয়েছেন তার অনুপাতে। সব মাসের টাকা দিলে এই ভাগ তাঁর ইউনিট অনুযায়ী ভাগের সমান।",
    en: "At Settlement, profit or loss is shared in proportion to the capital each Investor actually paid. Paid in full, that is the same as their share by Units.",
  },
  {
    bn: "দেরিতে দেওয়া বা না দেওয়ার জন্য খামার কোনো জরিমানা, চার্জ বা অতিরিক্ত টাকা নেবে না।",
    en: "The Farm takes no fine, charge or extra payment of any kind for a sum paid late or not paid.",
  },
  {
    bn: "কোনো মাসের টাকা না এলেও পশুর খাওয়া বন্ধ হবে না: খামারের মালিক নিজের টাকা সুদ ছাড়া অগ্রিম দিতে পারেন। হিসাব নিকাশে মূলধন ফেরতের আগে তিনি কেবল যত দিয়েছেন ততটুকুই ফেরত পাবেন; এ টাকায় তাঁর কোনো মুনাফা বা ক্ষতি নেই।",
    en: "If a month's money does not come, the animals are still fed: the Owner may advance her own money, interest-free. At Settlement it is repaid before capital, and no more than was advanced; it earns nothing and bears no loss.",
  },
  {
    bn: "কোনো বিনিয়োগকারী মাসের টাকা দেওয়া বন্ধ করলে তাঁর চুক্তি বহাল থাকবে এবং তিনি যত দিয়েছেন তার অনুপাতে ভাগ পাবেন; তাঁর না-দেওয়া অংশ অন্য কাউকে দেওয়া হবে না।",
    en: "If an Investor stops paying their Monthly Sums, their Agreement stands and they share in proportion to what they paid; the part they did not pay is not offered to anyone else.",
  },
].map((clause) => ({ ...clause, only: "by_the_month" as const }));

/** M8, approved with the rest: after the heirs clause, printed only on the Agreement of a Venture paid by the month. */
const SUMS_AFTER_DEATH = {
  bn: "মাসের টাকা বাকি থাকা অবস্থায় বিনিয়োগকারীর মৃত্যু হলে তাঁর নমিনি — নমিনি না থাকলে আইনগত উত্তরাধিকারীরা — বাকি মাসগুলোর টাকা দিতে পারবেন; না দিলে যত দেওয়া হয়েছে তার ভিত্তিতে হিসাব হবে।",
  en: "If the Investor dies with Monthly Sums still to come, their Nominee — or, with none, their lawful heirs — may pay the rest; otherwise they are settled on what was paid.",
  only: "by_the_month" as const,
};

/**
 * The standard Investment Agreement from 2026-10-02 until a lost animal made good and the Farm's own capital were added
 * (2026-10-05): the one before it, with the rows and clauses for capital paid by the month in the places the advisers
 * approved them — printed only on such a Venture's Agreement, so every other Agreement reads exactly as it did. Kept
 * whole, so a farm still on exactly these words is caught up to the standard that followed, and a farm that changed
 * them is left with its own.
 */
export const STANDARD_AGREEMENT_PAID_BY_THE_MONTH: TemplateContent = {
  ...STANDARD_AGREEMENT_BEFORE_MONTHLY,
  sections: STANDARD_AGREEMENT_BEFORE_MONTHLY.sections.map((section) => {
    if (section.kind === "facts") {
      const total = section.rows.findIndex(
        (row) => row.label.en === "Total capital"
      );
      return {
        ...section,
        rows: [
          ...section.rows.slice(0, total + 1),
          ...PAID_BY_THE_MONTH_ROWS,
          ...section.rows.slice(total + 1),
        ],
      };
    }
    if (section.kind !== "clauses" || section.heading.en !== "Terms") {
      return section;
    }
    const window = section.clauses.findIndex((clause) =>
      clause.en.startsWith("Target sale window")
    );
    const heirs = section.clauses.indexOf(HEIRS_CLAUSE);
    return {
      ...section,
      clauses: [
        ...section.clauses.slice(0, window),
        ...PAID_BY_THE_MONTH_TERMS,
        ...section.clauses.slice(window, heirs + 1),
        SUMS_AFTER_DEATH,
        ...section.clauses.slice(heirs + 1),
      ],
    };
  }),
};

/** A lost or stolen animal of a Venture, made good by the Farm at her cost to date (lose-less A-04, 2026-10-05). */
const LOST_CLAUSE = {
  bn: "কোনো পশু হারিয়ে গেলে বা চুরি হলে খামার এই ভেঞ্চারকে সেদিন পর্যন্ত তার পেছনে যত খরচ হয়েছে তা ব্যাংকে ফিরিয়ে দেবে; তা বিনিয়োগকারীদের কোনো ক্ষতি নয়।",
  en: "If an animal is lost or stolen, the Farm makes it good to this Venture by bank at what it has cost to date; it is no loss to the Investors.",
};

/** The Farm's own capital in the Venture, told to every Investor before they sign; printed only where the Farm holds
 *  Units (2026-10-05). */
const FARM_CAPITAL_CLAUSE = {
  bn: "খামার নিজেও নিজের টাকায় এই ভেঞ্চারের {ventureUnits}টি ইউনিটের মধ্যে {farmUnits}টি নিয়েছে, সবার মতো একই দামে ও একই শর্তে। সেই টাকার জন্য খামার অন্য যেকোনো বিনিয়োগকারীর মতোই মুনাফা ও ক্ষতির ভাগ নেবে, আর পরিচালনার জন্য তার ভাগ আগের মতোই থাকবে।",
  en: "The Farm itself holds {farmUnits} of this Venture's {ventureUnits} Units with its own money, at the same price and on the same terms as everyone. On that money it shares profit and loss as any Investor does, and takes its share for managing the Venture as before.",
  only: "farm_capital" as const,
};

/**
 * The standard Investment Agreement from 2026-10-05 until an Organization could be an Investor (2026-10-08): the
 * paid-by-the-month standard, with the two clauses after the death clause. Kept whole, so a farm still on exactly these
 * words is caught up to the standard that followed.
 */
export const STANDARD_AGREEMENT_WITH_FARM_CAPITAL: TemplateContent = {
  ...STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
  sections: STANDARD_AGREEMENT_PAID_BY_THE_MONTH.sections.map((section) => {
    if (section.kind !== "clauses" || section.heading.en !== "Terms") {
      return section;
    }
    const death = section.clauses.findIndex((clause) =>
      clause.en.startsWith("An animal that dies")
    );
    return {
      ...section,
      clauses: [
        ...section.clauses.slice(0, death + 1),
        LOST_CLAUSE,
        FARM_CAPITAL_CLAUSE,
        ...section.clauses.slice(death + 1),
      ],
    };
  }),
};

/** An Organization's share outlives its Signatory, and a winding-up is the law's to settle (ADR 0020, 2026-10-08). */
const ORGANIZATION_CLAUSE = {
  bn: "বিনিয়োগকারী একটি প্রতিষ্ঠান, যার পক্ষে তার স্বাক্ষরকারী সই করছেন। মূলধন ও প্রাপ্য প্রতিষ্ঠানেরই; স্বাক্ষরকারী বদলালে এই চুক্তির কিছুই বদলায় না, আর খামার নতুন স্বাক্ষরকারীর সঙ্গে কাজ করবে। প্রতিষ্ঠান বিলুপ্ত হলে তার মূলধন ও প্রাপ্য তাঁকেই দেওয়া হবে, যে আইনে প্রতিষ্ঠানটি গঠিত সেই আইন যাঁকে তার পক্ষে কাজ করার অধিকার দেয়।",
  en: "The Investor is an organization, signing through its Signatory. Its capital and share are its own; a change of Signatory changes nothing in this Agreement, and the Farm deals with the new Signatory. If the organization is wound up, its capital and share are paid to whoever the law it was formed under entitles to act for it.",
  only: "an_organization" as const,
};

/** What the Farm holds of an Organization to keep its Agreement: the Data part's first clause, said of one. */
const ORGANIZATION_DATA = {
  bn: "এই চুক্তি পালন করতে, বিনিয়োগকারী প্রতিষ্ঠানকে টাকা দিতে এবং আইন যে হিসাব রাখতে বলে তা রাখতে খামার প্রতিষ্ঠানের নাম, ঠিকানা, ট্রেড লাইসেন্স, নিবন্ধন ও টিআইএন, ব্যাংক হিসাব, তার স্বাক্ষরকারীর নাম, ফোন ও এনআইডি নম্বর, আর এই চুক্তির সব টাকার হিসাব রাখবে।",
  en: "To keep this Agreement, pay the Investor and keep the books the law requires, the Farm holds the organization's name, address, trade license, registration and TIN, its bank account, its Signatory's name, phone and NID number, and every money record under this Agreement.",
  only: "an_organization" as const,
};

/** The clauses about an Investor's death and Nominees, which an Organization has neither of: printed for a person only. */
const A_PERSONS = new Set<Said>([HEIRS_CLAUSE, ...NOMINEE_RULES, DATA_HOLDS]);

/**
 * The standard Investment Agreement from an Organization being an Investor (2026-10-08) until Nominees gave their NID:
 * the one before it, with the death, Nominee and data clauses printed for a person only, and in their place for an
 * Organization the clause that its share is its own and what the Farm holds of it. A person's Agreement reads exactly
 * as it did. Kept whole, so a farm still on exactly these words is caught up to the standard that followed.
 */
export const STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS: TemplateContent = {
  ...STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
  sections: STANDARD_AGREEMENT_WITH_FARM_CAPITAL.sections.map((section) => {
    if (section.kind !== "clauses") {
      return section;
    }
    return {
      ...section,
      clauses: section.clauses.flatMap((clause) => {
        if (clause === SUMS_AFTER_DEATH) {
          return [{ ...clause, only: ["by_the_month", "a_person"] as const }];
        }
        if (!A_PERSONS.has(clause)) {
          return [clause];
        }
        const forAPerson = { ...clause, only: "a_person" as const };
        if (clause === NOMINEE_RULES.at(-1)) {
          return [forAPerson, ORGANIZATION_CLAUSE];
        }
        if (clause === DATA_HOLDS) {
          return [forAPerson, ORGANIZATION_DATA];
        }
        return [forAPerson];
      }),
    };
  }),
};

const masterAgreement: TemplateContent = {
  title: {
    bn: "মুদারাবা মূল বিনিয়োগ চুক্তি",
    en: "Mudarabah Master Investment Agreement",
  },
  preamble: {
    bn: "এই মূল চুক্তি ____________ তারিখে নিচের দুই পক্ষের মধ্যে সম্পাদিত হলো। বিনিয়োগকারী যে ভেঞ্চারে যোগ দেবেন তার জন্য একটি তফসিল স্বাক্ষরিত হবে, এবং প্রতিটি তফসিল এই চুক্তির অংশ বলে গণ্য হবে।",
    en: "This Master Agreement is made on ____________ between the two parties below. A Schedule is signed for each Venture the Investor joins, and each Schedule forms part of this Agreement.",
  },
  sections: [
    PARTIES,
    {
      kind: "clauses",
      heading: { bn: "সাধারণ শর্তাবলি", en: "General terms" },
      clauses: [
        {
          bn: "এটি একটি মুদারাবা চুক্তি: বিনিয়োগকারীর মূলধন, খামারের পরিচালনা। প্রতিটি ভেঞ্চার আলাদা; একটির লাভ বা ক্ষতি অন্যটিতে যায় না।",
          en: "This is a mudarabah: the Investor's capital, the Farm's management. Each Venture stands alone; the profit or loss of one never passes to another.",
        },
        {
          bn: "প্রতিটি ভেঞ্চারের ইউনিট, মূলধন, মুনাফার ভাগ এবং বিক্রয়ের লক্ষ্য সময় সেই ভেঞ্চারের তফসিলে লেখা থাকবে।",
          en: "The Units, capital, profit split and target sale window of each Venture are set out in that Venture's Schedule.",
        },
        {
          bn: "মুনাফা ভাগ হবে তফসিলে লেখা হারে, মূলধন সম্পূর্ণ ফেরতের পর।",
          en: "Profit is shared at the rate in the Schedule, after capital has been returned in full.",
        },
        {
          bn: "ক্ষতি হলে তা মূলধন থেকে যাবে; খামার কোনো মুনাফার নিশ্চয়তা দেয় না। তবে খামারের অবহেলা বা এই চুক্তি ভঙ্গের কারণে ক্ষতি প্রমাণিত হলে তার দায় খামারের।",
          en: "A loss falls on capital; the Farm guarantees no profit. A loss proven to come from the Farm's negligence or its breach of this Agreement is the Farm's to bear.",
        },
        {
          bn: "কোনো পশু মারা গেলে তা সেই ভেঞ্চারের ক্ষতি, কোনো একজন বিনিয়োগকারীর নয়।",
          en: "An animal that dies is a loss to its Venture, not to any one Investor.",
        },
        {
          bn: "বিক্রয়ের লক্ষ্য সময়ের পর {windUpDays} দিনের গুটিয়ে আনার সময়; সে সময়ের পরেও যে পশু থাকবে খামার তা কিনে নেবে। ভেঞ্চার শেষ হওয়ার আগে মূলধন তুলে নেওয়ার সুযোগ নেই।",
          en: "After the target sale window comes a wind-up period of {windUpDays} days; the Farm buys any animal still unsold after it. Capital cannot be withdrawn before a Venture ends.",
        },
        {
          bn: "সব টাকা কেবল ভেঞ্চারের ব্যাংক হিসাবের মাধ্যমে আসা-যাওয়া করবে, নগদে নয়।",
          en: "All money moves through the Venture Account by bank only, never in cash.",
        },
        {
          bn: "প্রতিটি ভেঞ্চারে খামার বিনিয়োগকারীকে যোগদানপত্র, চলাকালীন অগ্রগতি এবং শেষে হিসাব নিকাশ দেবে।",
          en: "For each Venture the Farm gives the Investor a joining letter, progress statements while it runs, and a settlement statement at the end.",
        },
        HEIRS_CLAUSE,
        ...NOMINEE_RULES,
        {
          bn: "যে কোনো পক্ষ লিখিত নোটিশ দিয়ে এই চুক্তি শেষ করতে পারেন; তবে চলমান ভেঞ্চার তার নিজের শর্তে শেষ হবে।",
          en: "Either party may end this Agreement by written notice; a Venture already running is completed on its own terms.",
        },
        {
          bn: "মতভেদ হলে সালিস: {arbitrator}।",
          en: "Any dispute goes to arbitration by {arbitrator}.",
        },
      ],
    },
    STAMP,
    SIGNATURES,
  ],
};

const ventureSchedule: TemplateContent = {
  title: {
    bn: "তফসিল — ভেঞ্চারে যোগদান",
    en: "Schedule — joining a Venture",
  },
  preamble: {
    bn: "এই তফসিল দুই পক্ষের মধ্যে সম্পাদিত মুদারাবা মূল বিনিয়োগ চুক্তির অংশ, এবং নিচের ভেঞ্চারের জন্য প্রযোজ্য।",
    en: "This Schedule forms part of the Mudarabah Master Investment Agreement between the two parties, and applies to the Venture below.",
  },
  sections: [
    PARTIES,
    {
      kind: "facts",
      heading: { bn: "ভেঞ্চার ও মূলধন", en: "Venture and capital" },
      rows: [
        ...HIS_PART_ROWS,
        {
          label: { bn: "মুনাফার ভাগ", en: "Profit split" },
          value: "বিনিয়োগকারী {investorsPercent}% · খামার {farmPercent}%",
        },
        ...WINDOW_ROWS,
      ],
      note: BANK_ONLY,
    },
    {
      kind: "clauses",
      heading: { bn: "এই ভেঞ্চারের শর্ত", en: "Terms for this Venture" },
      clauses: [
        {
          bn: "মুনাফা ভাগ হবে বিনিয়োগকারী {investorsPercent}% এবং খামার {farmPercent}%, মূলধন সম্পূর্ণ ফেরতের পর।",
          en: "Profit is shared {investorsPercent}% to the Investor and {farmPercent}% to the Farm, after capital has been returned in full.",
        },
        {
          bn: "বিক্রয়ের লক্ষ্য সময় {windowStart} থেকে {windowEnd}; এরপর {windUpDays} দিনের গুটিয়ে আনার সময়।",
          en: "The target sale window runs from {windowStart} to {windowEnd}, followed by a wind-up period of {windUpDays} days.",
        },
        {
          bn: "এই তফসিলে যা বলা নেই, তা মূল চুক্তি অনুযায়ী চলবে।",
          en: "Anything this Schedule does not say is governed by the Master Agreement.",
        },
      ],
    },
    SIGNATURES,
  ],
};

const agreementAmendment: TemplateContent = {
  title: {
    bn: "বিনিয়োগ চুক্তির সংশোধনী",
    en: "Amendment to the Investment Agreement",
  },
  preamble: {
    bn: "{ventureName} ভেঞ্চারের জন্য খামার ও প্রত্যেক বিনিয়োগকারীর মধ্যে সম্পাদিত মুদারাবা বিনিয়োগ চুক্তি সকল পক্ষের সম্মতিতে নিচের মতো সংশোধন করা হলো। এই সংশোধনী {amendedOn} তারিখ থেকে কার্যকর।",
    en: "The Mudarabah Investment Agreements made between the Farm and each Investor for the Venture {ventureName} are amended as below, by consent of all parties. This Amendment takes effect from {amendedOn}.",
  },
  sections: [
    PARTIES,
    {
      kind: "facts",
      heading: { bn: "সংশোধিত শর্ত", en: "Terms as amended" },
      rows: [
        { label: { bn: "ভেঞ্চার", en: "Venture" }, value: "{ventureName}" },
        {
          label: { bn: "মুনাফার ভাগ", en: "Profit split" },
          value: "বিনিয়োগকারী {investorsPercent}% · খামার {farmPercent}%",
        },
        {
          label: { bn: "বিক্রয়ের লক্ষ্য সময়", en: "Target sale window" },
          value: "{windowStart} – {windowEnd}",
        },
      ],
      note: null,
    },
    {
      kind: "clauses",
      heading: { bn: "শর্তাবলি", en: "Terms" },
      clauses: [
        {
          bn: "মুনাফা ভাগ এখন থেকে বিনিয়োগকারী {investorsPercent}% এবং খামার {farmPercent}%, মূলধন সম্পূর্ণ ফেরতের পর।",
          en: "From now on profit is shared {investorsPercent}% to the Investor and {farmPercent}% to the Farm, after capital has been returned in full.",
        },
        {
          bn: "বিক্রয়ের লক্ষ্য সময় এখন থেকে {windowStart} থেকে {windowEnd}।",
          en: "The target sale window is now {windowStart} to {windowEnd}.",
        },
        {
          bn: "সংশোধনের কারণ: {reason}",
          en: "Reason for the Amendment: {reason}",
        },
        {
          bn: "প্রত্যেক মূল চুক্তির বাকি সব শর্ত — ইউনিট, মূলধন, সালিস ও স্ট্যাম্প — অপরিবর্তিত থাকবে।",
          en: "Every other term of each original Agreement — the Units, the capital, the arbitrator and the stamp — stands unchanged.",
        },
      ],
    },
    SIGNATURES,
  ],
};

/**
 * The Portal Consent: signed on paper in front of the Owner before any code is given, and kept by the farm. What the
 * portal adds, and only that — holding the record to keep an Agreement rests on the Agreement itself. From the
 * investor-portal map's draft, for the lawyer. Kept whole as it stood until an Organization could be an Investor
 * (2026-10-08), so a farm still on exactly these words is caught up to the standard that followed.
 */
export const PORTAL_CONSENT_BEFORE_ORGANIZATIONS: TemplateContent = {
  title: {
    bn: "বিনিয়োগকারী পোর্টাল — সম্মতিপত্র",
    en: "Investor Portal — Consent",
  },
  preamble: {
    bn: "আমি, {investorName} (মোবাইল {investorPhone}), খামারের দেওয়া “আপনার তথ্য” কাগজটি পেয়েছি ও পড়েছি, এবং নিচের তিনটিতে সম্মতি দিচ্ছি।",
    en: "I, {investorName} (mobile {investorPhone}), have received and read the farm's “আপনার তথ্য” (Your data), and I consent to these three things.",
  },
  sections: [
    {
      kind: "clauses",
      heading: { bn: "আমি সম্মতি দিচ্ছি", en: "I consent" },
      clauses: [
        {
          bn: "খামারের অনলাইন বিনিয়োগকারী পোর্টালে আমাকে আমার নিজের চুক্তি, ভেঞ্চার, টাকার হিসাব ও কাগজ দেখানো হবে। শুধু আমি, আমার নিজের ফোন নম্বর ও পাসওয়ার্ড দিয়ে, তা দেখব।",
          en: "The farm's online Investor Portal will show me my own Agreements, Ventures, money and papers. Only I will see them, with my own phone number and password.",
        },
        {
          bn: "এর জন্য আমার তথ্য সিঙ্গাপুরে খামারের পক্ষে চালানো একটি সার্ভারে রাখা হবে, আর প্রতি রাতে তার একটি তালাবদ্ধ কপি অন্য জায়গায় রাখা হবে।",
          en: "For this, my data will be kept on a server in Singapore run for the farm, and an encrypted copy will be kept elsewhere each night.",
        },
        {
          bn: "এর জন্য খামার আমার এনআইডি নম্বর, ব্যাংক হিসাব, আর আমার নমিনি ও গ্রহণকারীর তথ্য রাখবে। পোর্টালে এনআইডি আর ব্যাংক হিসাবের শুধু শেষ চারটি অঙ্ক দেখা যাবে।",
          en: "For this, the farm will hold my NID number, bank account, and the details of my Nominees and Receivers. The portal shows only the last four digits of my NID and bank account.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "আমি জানি", en: "I know that" },
      clauses: [
        {
          bn: "এই সম্মতি আমি যেকোনো সময় তুলে নিতে পারি: মালিককে সই করা চিঠি দিয়ে, অথবা খামারে থাকা আমার মোবাইল নম্বর থেকে মেসেজ দিয়ে।",
          en: "I can withdraw this consent at any time, by a signed letter to the Owner or by a message from the mobile number the farm has for me.",
        },
        {
          bn: "তুলে নিলে সঙ্গে সঙ্গে পোর্টালে আমার প্রবেশ বন্ধ হবে, আর আমার কাগজ আগের মতো ছাপা কাগজে পাব।",
          en: "If I withdraw it, my portal access ends at once, and I receive my papers on paper as before.",
        },
        {
          bn: "তুলে নিলেও আমার চুক্তি আর টাকার হিসাব আইনের কারণে বারো বছর রাখা হবে।",
          en: "Even if I withdraw it, my Agreements and money records are kept for twelve years, as the law requires.",
        },
        {
          bn: "পোর্টালে সই হয় না, টাকা দেওয়া-নেওয়া হয় না। পোর্টাল কোনো প্রকাশ্য প্রস্তাব নয়।",
          en: "Nothing is signed or paid through the portal. The portal is not a public offer.",
        },
      ],
    },
    {
      kind: "signatures",
      heading: { bn: "স্বাক্ষর", en: "Signatures" },
      witnesses: 0,
    },
  ],
};

/**
 * «আপনার তথ্য», the privacy notice: handed to every Investor at signing, printed on the back of the Welcome Letter,
 * and a page of the portal — one text in all three places. It says what the Personal Data Protection Act 2026 asks a
 * farm to say (s.5(2), s.15(2)); who runs the server and keeps the backup are the farm's facts, filled in once they are
 * chosen. The complaint line is worded for the lawyer to confirm, the Authority not yet having been found to exist.
 * Kept whole as it stood until Nominees gave their NID (2026-10-08), so a farm still on exactly these words is caught
 * up to the standard that followed.
 */
export const PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS: TemplateContent = {
  title: {
    bn: "আপনার তথ্য খামার কীভাবে রাখে",
    en: "How the farm keeps your data",
  },
  preamble: {
    bn: "{farmName} আপনার সম্পর্কে যা রাখে, কেন রাখে, কোথায় রাখে, আর আপনি কী চাইতে পারেন।",
    en: "What {farmName} keeps about you, why, where, and what you can ask for.",
  },
  sections: [
    {
      kind: "clauses",
      heading: { bn: "কে রাখে", en: "Who keeps it" },
      clauses: [
        {
          bn: "{farmName}, {farmAddress}। দায়িত্বে খামারের মালিক {ownerName}, ফোন {farmPhone}।",
          en: "{farmName}, {farmAddress}. The Owner, {ownerName}, is responsible, phone {farmPhone}.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: {
        bn: "কী রাখা হয়, কোথা থেকে",
        en: "What is kept, and where it comes from",
      },
      clauses: [
        {
          bn: "আপনার নাম, ফোন, ঠিকানা, এনআইডি নম্বর, ব্যাংক হিসাব; আপনার নমিনিদের নাম, সম্পর্ক, জন্মতারিখ, ফোন ও অংশ; আর নাবালক নমিনির গ্রহণকারীর নাম, সম্পর্ক ও ফোন। এগুলো আপনি নিজে দিয়েছেন।",
          en: "Your name, phone, address, NID number and bank account; your Nominees' names, relationships, dates of birth, phones and shares; and a minor Nominee's Receiver's name, relationship and phone. You gave these yourself.",
        },
        {
          bn: "আপনার চুক্তি, আপনার পুঁজি, আপনাকে দেওয়া টাকা, আপনার কাগজ (যোগদানপত্র, অগ্রগতি, হিসাব নিকাশ), আর পোর্টালে আপনি কবে এসেছেন ও কোন কাগজ খুলেছেন। এগুলো খামার নিজে লিখে রাখে।",
          en: "Your Agreements, your capital, the money paid to you, your papers (joining letter, progress statement, settlement), and when you came to the portal and which papers you opened. The farm records these itself.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "কেন", en: "Why" },
      clauses: [
        {
          bn: "আপনার চুক্তি মেনে চলতে এবং আপনার টাকা আপনার ব্যাংক হিসাবে পাঠাতে।",
          en: "To keep your Agreement and pay your money into your bank account.",
        },
        {
          bn: "আইন যে হিসাবের খাতা রাখতে বলে, তা রাখতে।",
          en: "To keep the books the law requires.",
        },
        {
          bn: "আর শুধু আপনার সম্মতি থাকলে, অনলাইন পোর্টালে আপনাকে আপনার নিজের হিসাব দেখাতে।",
          en: "Only with your consent, to show you your own record in the online portal.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: {
        bn: "কোথায় রাখা হয়, কে দেখে",
        en: "Where it is kept, and who sees it",
      },
      clauses: [
        {
          bn: "সব তথ্য একটি সার্ভারে থাকে সিঙ্গাপুরে, যা খামারের পক্ষে চালায় {dataHost}।",
          en: "Everything is on a server in Singapore, run for the farm by {dataHost}.",
        },
        {
          bn: "প্রতি রাতে এর একটি তালাবদ্ধ (এনক্রিপ্ট করা) কপি রাখা হয় {backupStore}-এর কাছে, {backupCountry}-এ। সেই প্রতিষ্ঠান কপিটি পড়তে পারে না।",
          en: "Each night an encrypted copy is kept by {backupStore} in {backupCountry}. They cannot read it.",
        },
        {
          bn: "আপনার ব্যক্তিগত তথ্য খামারে শুধু মালিক দেখেন। খামারের কর্মীরা পশুর কাজ দেখেন, আপনার তথ্য নয়।",
          en: "At the farm, only the Owner sees your personal record. Farm staff see the animals, not you.",
        },
        {
          bn: "আপনার টাকা পাঠাতে ব্যাংক আপনার হিসাব নম্বর পায়। আইন চাইলে কর কর্তৃপক্ষকে দেখাতে হতে পারে। আর কাউকে দেওয়া হয় না, বিক্রি করা হয় না।",
          en: "The bank gets your account number to pay you. The tax authority may be shown your record if the law requires it. Nobody else is given it, and it is never sold.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "কতদিন", en: "For how long" },
      clauses: [
        {
          bn: "আপনার শেষ ভেঞ্চারের হিসাব মেটার পর বারো বছর, কারণ আইন খামারকে এতদিন হিসাবের খাতা রাখতে বলে।",
          en: "Twelve years after your last Venture settles, because the law asks the farm to keep its books that long.",
        },
        {
          bn: "পোর্টালে আপনার প্রবেশ এর আগেই বন্ধ হতে পারে: আপনি চাইলে, অথবা খামার পোর্টাল বন্ধ করলে।",
          en: "Your portal access can end sooner: if you ask, or if the farm closes the portal.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "কীভাবে সুরক্ষিত", en: "How it is protected" },
      clauses: [
        {
          bn: "পোর্টালে আপনি ঢোকেন শুধু মালিকের আমন্ত্রণে, নিজের ফোন নম্বর আর নিজের পাসওয়ার্ড দিয়ে।",
          en: "You come into the portal only by the Owner's invitation, with your own phone number and password.",
        },
        {
          bn: "পোর্টালে আপনার এনআইডি আর ব্যাংক হিসাবের শুধু শেষ চারটি অঙ্ক দেখা যায়, আর পোর্টাল দিয়ে কিছু বদলানো যায় না।",
          en: "The portal shows only the last four digits of your NID and bank account, and nothing can be changed through it.",
        },
        {
          bn: "সাইন আউট করলে আপনার ফোনে পোর্টালের কিছুই থাকে না। খামার কখনো আপনার পাসওয়ার্ড চাইবে না।",
          en: "Signing out leaves nothing of the portal on your phone. The farm will never ask for your password.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "আপনার অধিকার", en: "Your rights" },
      clauses: [
        {
          bn: "খামার আপনার সম্পর্কে যা রাখে, তার পুরো কপি চাইতে পারেন।",
          en: "You may ask for a full copy of everything the farm keeps about you.",
        },
        {
          bn: "কিছু ভুল থাকলে ঠিক করাতে পারেন। ত্রিশ দিনের মধ্যে আপনাকে জানানো হবে, আর খামার রাজি না হলে কেন, তা লিখে জানাবে।",
          en: "You may have anything wrong put right. You will be told within thirty days, and if the farm declines, why, in writing.",
        },
        {
          bn: "যেকোনো সময় পোর্টালের সম্মতি তুলে নিতে পারেন। তখনই আপনার প্রবেশ বন্ধ হবে, আর কাগজগুলো আগের মতো ছাপা কাগজে পাবেন।",
          en: "You may withdraw your consent to the portal at any time. Your access ends at once, and you receive your papers on paper as before.",
        },
        {
          bn: "তথ্য মুছে ফেলতে বলতে পারেন। তবে আপনার চুক্তি আর টাকার হিসাব আইনের কারণে বারো বছর রাখতে হয়; সেগুলো ছাড়া বাকিটা মুছে ফেলা হবে।",
          en: "You may ask for your data to be erased. Your Agreements and money records must be kept for twelve years by law; the rest is erased.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "কীভাবে চাইবেন", en: "How to ask" },
      clauses: [
        {
          bn: "মালিককে লিখে জানান: সই করা চিঠি, হাতে দিয়ে বা খামারের ঠিকানায় পাঠিয়ে; অথবা খামারে আপনার যে মোবাইল নম্বর আছে, সেখান থেকে এসএমএস বা হোয়াটসঅ্যাপে।",
          en: "Write to the Owner: a signed letter, handed over or posted to the farm's address; or an SMS or WhatsApp message from the mobile number the farm has for you.",
        },
        {
          bn: "অন্য নম্বর থেকে এলে খামার আপনার নম্বরে ফোন করে নিশ্চিত হবে। ত্রিশ দিনের মধ্যে উত্তর পাবেন।",
          en: "A message from any other number is confirmed by a call back to yours. You will have an answer within thirty days.",
        },
      ],
    },
    {
      kind: "clauses",
      heading: { bn: "অভিযোগ", en: "Complaints" },
      clauses: [
        {
          bn: "খামারের উত্তরে সন্তুষ্ট না হলে জাতীয় উপাত্ত ব্যবস্থাপনা কর্তৃপক্ষের কাছে অভিযোগ করতে পারেন।",
          en: "If you are not satisfied with the farm's answer, you may complain to the National Data Management Authority.",
        },
      ],
    },
  ],
};

/**
 * মনোনয়নপত্র: the Investor's own short paper naming every Nominee in full, signed in front of the Owner, which
 * replaces every earlier one and governs all their Agreements. Its parties part carries the table; the rules follow
 * in full, because it is read alone. The opening is the Investor's own words, and says nothing of how many Nominees
 * there are, so a paper naming none reads right too. Kept whole as it stood until Nominees gave their NID
 * (2026-10-08), so a farm still on exactly these words is caught up to the standard that followed.
 */
export const NOMINATION_BEFORE_NOMINEE_NUMBERS: TemplateContent = {
  title: { bn: "মনোনয়নপত্র", en: "Nomination" },
  preamble: {
    bn: "আমি, {investorName}, আমার মৃত্যুর পর খামারের কাছে আমার মূলধন ও প্রাপ্য কে সংগ্রহ করে আমার আইনগত উত্তরাধিকারীদের বুঝিয়ে দেবেন, তা নিচে লিখে দিচ্ছি।",
    en: "I, {investorName}, set out below who is to collect my capital and share from the Farm after my death and hand them to my lawful heirs.",
  },
  sections: [
    {
      kind: "parties",
      heading: { bn: "মনোনয়ন", en: "The Nominees" },
      first: { bn: "খামার", en: "The Farm" },
      second: { bn: "বিনিয়োগকারী", en: "Investor" },
      nomineeLines: [EACH_NOMINEE_KNOWS],
      receiverLine: RECEIVER_LINE,
      noNomineeLine: NO_NOMINEE_LINE,
    },
    {
      kind: "clauses",
      heading: { bn: "আমি জানি ও মানি যে", en: "I know and accept that" },
      clauses: [
        ...NOMINEE_RULES,
        {
          bn: "এই মনোনয়নপত্র আমার আগের সব মনোনয়নপত্রের জায়গা নেবে, এবং খামারের সঙ্গে আমার সব চুক্তির জন্য প্রযোজ্য হবে।",
          en: "This Nomination replaces every earlier one, and governs all my Agreements with the Farm.",
        },
      ],
    },
    {
      kind: "signatures",
      heading: { bn: "স্বাক্ষর", en: "Signatures" },
      witnesses: 0,
    },
  ],
};

/** What the portal shows an Organization's Signatory, and what it holds of them — the consent's first and third
 *  clauses, said by a Signatory for the Organization (ADR 0020). */
const ORGANIZATION_CONSENTS = {
  shows: {
    bn: "খামারের অনলাইন বিনিয়োগকারী পোর্টালে প্রতিষ্ঠানের চুক্তি, ভেঞ্চার, টাকার হিসাব ও কাগজ আমাকে দেখানো হবে। শুধু আমি, প্রতিষ্ঠানের স্বাক্ষরকারী হিসেবে, আমার নিজের ফোন নম্বর ও পাসওয়ার্ড দিয়ে, তা দেখব।",
    en: "The farm's online Investor Portal will show me the organization's Agreements, Ventures, money and papers. Only I, as its Signatory, will see them, with my own phone number and password.",
    only: "an_organization" as const,
  },
  holds: {
    bn: "এর জন্য খামার প্রতিষ্ঠানের ব্যাংক হিসাব আর তার স্বাক্ষরকারী হিসেবে আমার এনআইডি নম্বর রাখবে। পোর্টালে এনআইডি আর ব্যাংক হিসাবের শুধু শেষ চারটি অঙ্ক দেখা যাবে।",
    en: "For this, the farm will hold the organization's bank account and my NID number as its Signatory. The portal shows only the last four digits of my NID and the bank account.",
    only: "an_organization" as const,
  },
};

/**
 * The Portal Consent today (2026-10-08): the one before it, opening with whoever signs — a person, or a Signatory for
 * their Organization — and with what the portal shows and holds said for each kind. A person's reads exactly as it did.
 */
const portalConsent: TemplateContent = {
  ...PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
  preamble: {
    bn: PORTAL_CONSENT_BEFORE_ORGANIZATIONS.preamble.bn.replace(
      "{investorName}",
      "{signerName}"
    ),
    en: PORTAL_CONSENT_BEFORE_ORGANIZATIONS.preamble.en.replace(
      "{investorName}",
      "{signerName}"
    ),
  },
  sections: PORTAL_CONSENT_BEFORE_ORGANIZATIONS.sections.map(
    (section, place) => {
      if (section.kind !== "clauses" || place !== 0) {
        return section;
      }
      const [shows, keeps, holds, ...rest] = section.clauses;
      if (!(shows && keeps && holds)) {
        return section;
      }
      return {
        ...section,
        clauses: [
          { ...shows, only: "a_person" as const },
          ORGANIZATION_CONSENTS.shows,
          keeps,
          { ...holds, only: "a_person" as const },
          ORGANIZATION_CONSENTS.holds,
          ...rest,
        ],
      };
    }
  ),
};

/** What the Investor confirms of every Nominee once Nominees give their NID: the number is held too. */
const EACH_NOMINEE_KNOWS_THEIR_NUMBER: Said = {
  bn: "বিনিয়োগকারী নিশ্চিত করছেন যে তাঁর প্রত্যেক নমিনি জানেন, খামার তাঁদের নাম, সম্পর্ক, জন্মতারিখ, ফোন আর এনআইডি নম্বর — নাবালক হলে জন্ম নিবন্ধন নম্বর — রাখছে, শুধু বিনিয়োগকারীর উত্তরাধিকারীদের টাকা দেওয়ার জন্য।",
  en: "The Investor confirms that each Nominee knows the Farm holds their name, relationship, date of birth, phone and NID number — a minor's birth registration number — only to pay the Investor's heirs.",
};

/** The minor Nominee's line once Receivers give their NID: the Receiver consents to their own number being held. */
const RECEIVER_GIVES_THEIR_NID: Said = {
  bn: "নমিনি {nomineeName}-এর বয়স আঠারো বছরের কম। তাঁর গ্রহণকারী হিসেবে আমি, {receiverName} ({receiverRelation}), আঠারো বছর না হওয়া পর্যন্ত তাঁর অংশ সংগ্রহ করতে এবং তাঁর এই তথ্য ও আমার এনআইডি নম্বর রাখায় সম্মতি দিচ্ছি। সই: ____________",
  en: "Nominee {nomineeName} is under eighteen. As their Receiver I, {receiverName} ({receiverRelation}), agree to collect their part until they turn eighteen, and consent to their data and my NID number being kept. Signature: ____________",
};

/** What the privacy notice says is kept, once Nominees and Receivers give their NID. */
const WHAT_IS_KEPT_WITH_NOMINEE_NUMBERS: Said = {
  bn: "আপনার নাম, ফোন, ঠিকানা, এনআইডি নম্বর, ব্যাংক হিসাব; আপনার নমিনিদের নাম, সম্পর্ক, জন্মতারিখ, ফোন, অংশ আর এনআইডি নম্বর — নাবালক হলে জন্ম নিবন্ধন নম্বর; আর নাবালক নমিনির গ্রহণকারীর নাম, সম্পর্ক, ফোন ও এনআইডি নম্বর। এগুলো আপনি নিজে দিয়েছেন।",
  en: "Your name, phone, address, NID number and bank account; your Nominees' names, relationships, dates of birth, phones, shares and NID numbers — a minor's birth registration number; and a minor Nominee's Receiver's name, relationship, phone and NID number. You gave these yourself.",
};

/**
 * A paper's parties part once Nominees give their NID (the Owner, 2026-10-08): what each Nominee knows the Farm holds
 * names the number, and a minor's Receiver consents to their own being held. Nothing else in it changes.
 */
const withNomineeNumbers = (content: TemplateContent): TemplateContent => ({
  ...content,
  sections: content.sections.map((section) =>
    section.kind === "parties"
      ? {
          ...section,
          nomineeLines: section.nomineeLines?.map((line) =>
            line === EACH_NOMINEE_KNOWS ? EACH_NOMINEE_KNOWS_THEIR_NUMBER : line
          ),
          receiverLine:
            section.receiverLine === RECEIVER_LINE
              ? RECEIVER_GIVES_THEIR_NID
              : section.receiverLine,
        }
      : section
  ),
});

/** The standard Investment Agreement today (2026-10-08): the one before it, with the Nominees' numbers held. */
const investmentAgreement = withNomineeNumbers(
  STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS
);

/** The মনোনয়নপত্র today (2026-10-08): the one before it, with the Nominees' numbers held. */
const nomination = withNomineeNumbers(NOMINATION_BEFORE_NOMINEE_NUMBERS);

/** The privacy notice today (2026-10-08): the one before it, saying the Nominees' and Receivers' numbers are kept. */
const privacyNotice: TemplateContent = {
  ...PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
  sections: PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS.sections.map((section) =>
    section.kind === "clauses"
      ? {
          ...section,
          clauses: section.clauses.map((clause) =>
            clause.en.startsWith("Your name, phone, address, NID number")
              ? WHAT_IS_KEPT_WITH_NOMINEE_NUMBERS
              : clause
          ),
        }
      : section
  ),
};

/** The wording each kind of paper starts from. */
export const STANDARD_TEMPLATES: Record<TemplateKind, TemplateContent> = {
  investment_agreement: investmentAgreement,
  master_agreement: masterAgreement,
  venture_schedule: ventureSchedule,
  agreement_amendment: agreementAmendment,
  portal_consent: portalConsent,
  privacy_notice: privacyNotice,
  nomination,
};
