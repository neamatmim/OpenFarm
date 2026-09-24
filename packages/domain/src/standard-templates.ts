import type {
  TemplateContent,
  TemplateKind,
  TemplateSection,
} from "./paper-template";

/**
 * The wording OpenFarm gives a farm to start from, one for each kind of paper: what every farm has before its Owner
 * changes a word. Drafts for the farm's lawyer to read, not advice — the lawyer's and the Shariah scholar's answers
 * (the investor map's ticket 11) are what make any of them fit to sign, and a Version records who approved it and
 * when.
 *
 * The Investment Agreement says in Bangla exactly what the farm printed before its wording could be edited, so the
 * Agreements signed then are recorded against it; its English is new beside it. The Master Agreement and its Venture
 * Schedule are the shape the Owner asked the lawyer about — one stamped agreement per Investor, and a short schedule
 * for each Venture he joins — and wait on that answer before anybody signs one.
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

const investmentAgreement: TemplateContent = {
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
        {
          bn: "বিনিয়োগকারীর মৃত্যু হলে তাঁর মূলধন ও প্রাপ্য তাঁর নমিনির মাধ্যমে তাঁর আইনগত উত্তরাধিকারীদের দেওয়া হবে।",
          en: "If the Investor dies, their capital and share are paid through their nominee to their lawful heirs.",
        },
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

/** The wording each kind of paper starts from. */
export const STANDARD_TEMPLATES: Record<TemplateKind, TemplateContent> = {
  investment_agreement: investmentAgreement,
  master_agreement: masterAgreement,
  venture_schedule: ventureSchedule,
  agreement_amendment: agreementAmendment,
};
