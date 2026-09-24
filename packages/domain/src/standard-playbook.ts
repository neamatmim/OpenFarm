/**
 * The Standard Playbook: the SOPs OpenFarm offers a farm to start from. None of it is the farm's until the Owner
 * adopts one — reads it, names the farm's own Pen or product where it asks for one, and publishes it. Until then it
 * raises no work, because it is not in the database at all.
 */
import { HEAT } from "./breeding";
import type { Evidence, SopContent, Step } from "./sop";

const choice = (
  required: boolean,
  options: [value: string, bn: string, en: string][]
): Evidence => ({
  type: "choice",
  required,
  choices: options.map(([value, bn, en]) => ({ value, label: { bn, en } })),
});

const litres = (max: number): Evidence => ({
  type: "number",
  required: true,
  unit: { bn: "লিটার", en: "litres" },
  min: 0,
  max,
});

const milkingSession = (time: string, bn: string, en: string): SopContent => ({
  name: { bn, en },
  purpose: {
    bn: "প্রতিটি গাভীর দুধ মেপে লিখুন, তারপর ট্যাংকের মোট",
    en: "Measure and record each cow's milk, then the tank total",
  },
  triggers: [{ kind: "schedule", times: [time] }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 90,
  steps: [
    {
      id: "udder",
      text: {
        bn: "ওলান ধুয়ে শুকিয়ে নিন, প্রথম তিন ধারা ফেলে দিন",
        en: "Wash and dry the udder, strip the first three squirts",
      },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "milk",
      text: { bn: "গাভীর দুধ দোহন করে মাপুন", en: "Milk the cow and measure it" },
      repeatPerAnimal: true,
      evidence: [litres(40)],
      skipReasons: [
        { bn: "অসুস্থ", en: "Unwell" },
        { bn: "লাথি মারছে, দোহন করা যায়নি", en: "Kicking, could not be milked" },
      ],
      effect: { kind: "milk_record" },
    },
    {
      id: "tank",
      text: { bn: "বাল্ক ট্যাংকে মোট দুধ", en: "Total into the bulk tank" },
      repeatPerAnimal: false,
      evidence: [litres(2000)],
      skipReasons: [],
      effect: { kind: "bulk_total" },
    },
  ],
});

const feeding = (): SopContent => ({
  name: { bn: "খাবার দেওয়া", en: "Feeding" },
  purpose: {
    bn: "পেনের রেশন অনুযায়ী খাবার দিন, আর আগের বেলার বেঁচে যাওয়া খাবার লিখুন",
    en: "Feed the pen its ration and record what was left from the last feed",
  },
  triggers: [{ kind: "schedule", times: ["07:00", "17:30"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    // The trough cleared of the last feed before the next goes in (DLS GLPP 2023): what was left is written with the
    // feed, and stale feed left under fresh is feed that spoils.
    {
      id: "clear",
      text: {
        bn: "আগের বেলার পড়ে থাকা খাবার সরিয়ে পাত্র পরিষ্কার করুন",
        en: "Clear the last feed's leftovers and clean the trough",
      },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "feed",
      text: { bn: "রেশন অনুযায়ী খাবার দিন", en: "Feed to the ration" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
    {
      id: "water",
      text: {
        bn: "পানির পাত্র পরিষ্কার করে ভরে দিন",
        en: "Clean and fill the water troughs",
      },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    // Bangladesh summers: wet the back, never the head (DLS GLPP 2023 §14.1.7). Asked every feed, answered on the
    // days that are hot — there is no season a trigger can name.
    {
      id: "cool",
      text: {
        bn: "গরমের দিনে পিঠে পানি ছিটিয়ে দিন — মাথায় নয়",
        en: "On a hot day, wet their backs — never the head",
      },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: false }],
      skipReasons: [],
    },
  ],
});

/** What the round may see of an animal worth writing down. `heat` is the one the breeding chain listens for. */
export const ROUND_WORDS = {
  heat: HEAT,
  lame: "lame",
  offFeed: "off_feed",
  mastitis: "mastitis",
  cough: "cough",
  bloat: "bloat",
  diarrhoea: "diarrhoea",
  breathing: "breathing",
  sores: "mouth_foot_sores",
} as const;

const healthRound = (): SopContent => ({
  name: { bn: "স্বাস্থ্য ও গরম পর্যবেক্ষণ", en: "Health and heat round" },
  purpose: {
    bn: "প্রতিদিন প্রতিটি পশু দেখে যা চোখে পড়ে লিখুন — গরম, খোঁড়ানো, খাবারে অরুচি, পেট ফাঁপা, পাতলা পায়খানা, শ্বাসকষ্ট",
    en: "Look at every animal every day and write down what you see — heat, lameness, off feed, bloat, scours, laboured breathing",
  },
  // Every morning (DLS GLPP 2023: monitor every animal daily). Pneumonia comes in the first fortnight after a bull is
  // bought, and grain overload within a day of it (Merck) — a round walked when somebody remembers finds both late.
  triggers: [{ kind: "schedule", times: ["08:00"] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 180,
  steps: [
    {
      id: "look",
      text: { bn: "পশুটিকে ভালো করে দেখুন", en: "Look the animal over" },
      repeatPerAnimal: true,
      evidence: [
        choice(true, [
          [ROUND_WORDS.heat, "গরম হয়েছে", "In heat"],
          [ROUND_WORDS.lame, "খোঁড়াচ্ছে", "Lame"],
          [ROUND_WORDS.offFeed, "খাবারে অরুচি", "Off feed"],
          [ROUND_WORDS.mastitis, "ওলান ফোলা/শক্ত", "Swollen or hard udder"],
          [ROUND_WORDS.cough, "কাশি", "Coughing"],
          [ROUND_WORDS.bloat, "পেট ফাঁপা", "Bloated"],
          [ROUND_WORDS.diarrhoea, "পাতলা পায়খানা", "Scours"],
          [ROUND_WORDS.breathing, "শ্বাসকষ্ট", "Laboured breathing"],
          [ROUND_WORDS.sores, "মুখে বা ক্ষুরে ঘা", "Sores on mouth or feet"],
        ]),
      ],
      // A well animal is passed with nothing written against her: the round's record is what was worth seeing,
      // and what the Vet reads is only that.
      skipReasons: [
        { bn: "সুস্থ — চোখে পড়ার মতো কিছু নেই", en: "Well — nothing to note" },
        { bn: "পশু পাওয়া যায়নি", en: "Animal not found" },
      ],
      effect: { kind: "observation" },
    },
  ],
});

const serviceEvidence: Evidence[] = [
  choice(true, [
    ["ai", "কৃত্রিম প্রজনন", "Artificial insemination"],
    ["natural", "ষাঁড় দিয়ে", "Natural service"],
  ]),
  { type: "note", required: true },
  { type: "note", required: false },
  { type: "datetime", required: true },
];

const artificialInsemination = (): SopContent => ({
  name: { bn: "কৃত্রিম প্রজনন", en: "Artificial insemination" },
  purpose: {
    bn: "গরম হওয়া গাভীকে এআই উইন্ডোর মধ্যে প্রজনন করান — স্ট্র নম্বর ও টেকনিশিয়ানের নাম লিখুন",
    en: "Serve a cow in heat inside the AI window — record the straw and the technician",
  },
  triggers: [{ kind: "event", event: HEAT }],
  appliesTo: { side: "dairy" },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
  steps: [
    {
      id: "serve",
      text: { bn: "প্রজনন করান", en: "Serve her" },
      repeatPerAnimal: false,
      evidence: serviceEvidence,
      skipReasons: [],
      effect: { kind: "service" },
    },
  ],
});

const pregnancyCheck = (): SopContent => ({
  name: { bn: "গর্ভ পরীক্ষা", en: "Pregnancy check" },
  purpose: {
    bn: "প্রজননের পর নির্ধারিত দিনে রেকটাল পরীক্ষা করে ফলাফল লিখুন",
    en: "Palpate on the farm's day after service and record the result",
  },
  triggers: [{ kind: "event", event: "service" }],
  appliesTo: { side: "dairy" },
  assignedRole: "vet",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "check",
      text: { bn: "গর্ভ পরীক্ষা করুন", en: "Check for pregnancy" },
      repeatPerAnimal: false,
      evidence: [
        choice(true, [
          ["positive", "গর্ভবতী", "Pregnant"],
          ["negative", "গর্ভবতী নয়", "Not pregnant"],
        ]),
      ],
      skipReasons: [],
      effect: { kind: "pregnancy_check" },
    },
  ],
});

const dryOff = (): SopContent => ({
  name: { bn: "দুধ বন্ধ করা", en: "Dry-off" },
  purpose: {
    bn: "প্রসবের আগে গাভীর দুধ বন্ধ করুন, ওলানে ড্রাই-কাউ থেরাপি দিন",
    en: "Dry the cow off before calving and give dry-cow therapy",
  },
  triggers: [{ kind: "before_calving", lead: "dry_off" }],
  appliesTo: { side: "dairy", states: ["milking"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "dry",
      text: { bn: "দোহন বন্ধ করুন", en: "Stop milking her" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "পাওয়া যায়নি", en: "Not found" }],
      effect: { kind: "dry_off" },
    },
  ],
});

const calvingPrep = (calvingPenId: string | undefined): SopContent => ({
  name: { bn: "প্রসবের প্রস্তুতি", en: "Calving preparation" },
  purpose: {
    bn: "প্রসবের কয়েক দিন আগে গাভীকে পরিষ্কার প্রসব পেনে নিন",
    en: "Walk the cow to the clean calving pen a few days before she is due",
  },
  triggers: [{ kind: "before_calving", lead: "calving_prep" }],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "walk",
      text: { bn: "প্রসব পেনে নিন", en: "Walk her to the calving pen" },
      repeatPerAnimal: true,
      evidence: [
        choice(
          true,
          calvingPenId ? [[calvingPenId, "প্রসব পেন", "Calving pen"]] : []
        ),
      ],
      skipReasons: [{ bn: "পাওয়া যায়নি", en: "Not found" }],
      effect: { kind: "move" },
    },
  ],
});

const calf: [value: string, bn: string, en: string][] = [
  ["female", "বকনা", "Heifer calf"],
  ["male", "এঁড়ে", "Bull calf"],
];
const outcome: [value: string, bn: string, en: string][] = [
  ["alive", "জীবিত", "Alive"],
  ["stillborn", "মৃত", "Stillborn"],
];

const calvingRecord = (): SopContent => ({
  name: { bn: "প্রসব রেকর্ড", en: "Calving record" },
  purpose: {
    bn: "প্রসব পেনের গাভী দেখুন — প্রসব হলে সময়, কেমন হলো আর বাছুরের তথ্য লিখুন",
    en: "Check the calving pen — when a cow has calved, record when, how it went and each calf",
  },
  triggers: [],
  appliesTo: { side: "dairy" },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "calved",
      text: { bn: "বাচ্চা দিয়েছে কি?", en: "Has she calved?" },
      repeatPerAnimal: true,
      evidence: [
        { type: "datetime", required: true },
        choice(true, [
          ["unassisted", "নিজে নিজে", "Unassisted"],
          ["assisted", "সাহায্য লেগেছে", "Assisted"],
          ["vet", "ভেট লেগেছে", "Vet needed"],
        ]),
        choice(true, calf),
        choice(true, outcome),
        choice(false, calf),
        choice(false, outcome),
        choice(false, calf),
        choice(false, outcome),
      ],
      skipReasons: [{ bn: "এখনো বাচ্চা দেয়নি", en: "Not calved yet" }],
      effect: { kind: "calving" },
    },
  ],
});

/** Body condition on the common five-point scale. */
const CONDITION_SCORE = choice(false, [
  ["1", "১ — খুব রোগা", "1 — very thin"],
  ["2", "২ — রোগা", "2 — thin"],
  ["3", "৩ — ঠিক আছে", "3 — moderate"],
  ["4", "৪ — ভালো গোশত", "4 — good flesh"],
  ["5", "৫ — খুব মোটা", "5 — fat"],
]);

const weighIn = (): SopContent => ({
  name: { bn: "ওজন নেওয়া", en: "Weigh-in" },
  purpose: {
    bn: "মোটাতাজাকরণের প্রতিটি পশুকে ক্রাশে তুলে ওজন নিন — প্রতি দুই সপ্তাহে",
    en: "Put each fattening animal through the crush and weigh it — every fortnight",
  },
  // Every other Saturday morning, before the heat.
  triggers: [
    { kind: "schedule", times: ["07:00"], weekdays: [6], everyOtherWeek: true },
  ],
  appliesTo: {
    side: "fattening",
    states: ["quarantine", "fattening", "ready_for_sale"],
  },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন", en: "Weigh on the scale" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি", en: "kg" },
          min: 20,
          max: 1200,
        },
        // Body condition, one to five, for whoever has an eye for it (DLS GLPP 2023 §16.2.4.1.2): kept with the
        // weight, never asked of anybody who has not.
        CONDITION_SCORE,
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি", en: "Would not go up the crush" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

/** A campaign's dose of the product the farm named. Named nothing, it is a prescribed dose's shape, which the
 *  Playbook refuses to publish without a Prescription to raise it: the Owner is told to choose the product. */
const campaignDose = (productId: string | undefined) =>
  productId
    ? { kind: "treatment" as const, productId }
    : { kind: "treatment" as const };

const vaccination = (
  productId: string | undefined,
  bn: string,
  en: string
): SopContent => ({
  name: { bn, en },
  purpose: {
    bn: "ভায়ালের লট নম্বর লিখে পেনের প্রতিটি পশুকে টিকা দিন",
    en: "Record the vial's lot number and vaccinate every animal in the pen",
  },
  triggers: [],
  assignedRole: "staff",
  checkerRole: "vet",
  graceMinutes: 6 * 60,
  steps: [
    {
      id: "lot",
      text: { bn: "ভায়ালের লট নম্বর লিখুন", en: "Write the vial's lot number" },
      repeatPerAnimal: false,
      evidence: [{ type: "note", required: true }],
      skipReasons: [],
      effect: { kind: "lot_number" },
    },
    {
      id: "dose",
      text: { bn: "টিকা দিন", en: "Give the dose" },
      repeatPerAnimal: true,
      evidence: [
        { type: "tick", required: true },
        { type: "note", required: false },
      ],
      skipReasons: [
        { bn: "অসুস্থ — পরে দেওয়া হবে", en: "Unwell — to be given later" },
      ],
      effect: campaignDose(productId),
    },
  ],
});

const deworming = (productId: string | undefined): SopContent => ({
  ...vaccination(productId, "কৃমিনাশক খাওয়ানো", "Deworming"),
  purpose: {
    bn: "পেনের প্রতিটি পশুকে ওজন অনুযায়ী কৃমিনাশক খাওয়ান",
    en: "Drench every animal in the pen by weight",
  },
  steps: [
    {
      id: "dose",
      text: { bn: "কৃমিনাশক খাওয়ান", en: "Give the drench" },
      repeatPerAnimal: true,
      evidence: [
        { type: "tick", required: true },
        { type: "note", required: false },
      ],
      skipReasons: [
        { bn: "অসুস্থ — পরে দেওয়া হবে", en: "Unwell — to be given later" },
      ],
      effect: campaignDose(productId),
    },
  ],
});

const treatmentDose = (): SopContent => ({
  name: { bn: "চিকিৎসা — ডোজ দেওয়া", en: "Treatment — give the dose" },
  purpose: {
    bn: "ভেটের প্রেসক্রিপশন অনুযায়ী সময়মতো ডোজ দিন এবং লিখে রাখুন",
    en: "Give the dose the Vet prescribed, on time, and record it",
  },
  triggers: [{ kind: "prescription" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 120,
  steps: [
    {
      id: "dose",
      text: { bn: "ডোজ দিন", en: "Give the dose" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [
        { bn: "পশু পাওয়া যায়নি", en: "Animal not found" },
        { bn: "ওষুধ শেষ", en: "Out of the medicine" },
      ],
      effect: { kind: "treatment" },
    },
  ],
});

const burial = (): SopContent => ({
  name: { bn: "মৃত পশুর সৎকার", en: "Carcass disposal" },
  purpose: {
    bn: "মৃত পশুকে নিয়ম অনুযায়ী অন্তত ছয় ফুট গভীরে চুন দিয়ে পুঁতে ফেলুন",
    en: "Bury the carcass at least six feet deep with lime, as the rule requires",
  },
  triggers: [{ kind: "event", event: "death" }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 6 * 60,
  steps: [
    {
      id: "bury",
      text: { bn: "গর্ত করে চুন দিয়ে পুঁতে দিন", en: "Dig, lime and bury" },
      repeatPerAnimal: false,
      evidence: [
        { type: "tick", required: true },
        { type: "note", required: false },
      ],
      skipReasons: [],
    },
  ],
});

const dlsReport = (): SopContent => ({
  name: {
    bn: "উপজেলা প্রাণিসম্পদ অফিসে জানানো",
    en: "Report to the Upazila Livestock Office",
  },
  purpose: {
    bn: "জানানো বাধ্যতামূলক রোগের চিঠি দেরি না করে পৌঁছে দিন, রেফারেন্স নম্বর লিখুন",
    en: "Deliver the notifiable-disease letter without delay and record its reference",
  },
  triggers: [{ kind: "notifiable_disease" }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 0,
  steps: [
    {
      id: "deliver",
      text: { bn: "চিঠি পৌঁছে দিন", en: "Deliver the letter" },
      repeatPerAnimal: false,
      evidence: [{ type: "note", required: true }],
      skipReasons: [],
      effect: { kind: "dls_report" },
    },
  ],
});

const stockCount = (): SopContent => ({
  name: { bn: "সাপ্তাহিক গুদাম গণনা", en: "Weekly stock count" },
  purpose: {
    bn: "গুদামে প্রতিটি খাদ্য আসলে কত আছে মেপে লিখুন, হিসাবের সাথে না মিললে কারণ লিখুন",
    en: "Weigh what is really in the store and give a reason where it differs from the book",
  },
  // Raised by the Manager each Friday for the store's Pen: a schedule raises work per Pen, and the store is one.
  triggers: [],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "count",
      text: { bn: "প্রতিটি খাদ্য গুনুন", en: "Count every feed" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "stock_count" },
    },
  ],
});

const biosecurity = (): SopContent => ({
  name: { bn: "খামার জীবাণু নিরাপত্তা", en: "Biosecurity check" },
  purpose: {
    bn: "ফুটবাথ, শেড পরিষ্কার আর দর্শনার্থী খাতা প্রতিদিন দেখুন",
    en: "Check the footbath, shed hygiene and the visitor book every day",
  },
  triggers: [{ kind: "schedule", times: ["09:00"] }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "footbath",
      text: { bn: "ফুটবাথে জীবাণুনাশক আছে", en: "Footbath has disinfectant" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "visitors",
      text: { bn: "আজ কতজন দর্শনার্থী এসেছে", en: "Visitors today" },
      repeatPerAnimal: false,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "জন", en: "people" },
          min: 0,
          max: 50,
        },
      ],
      skipReasons: [],
    },
  ],
});

// ── The bought-in bull, arrival to sale ────────────────────────────────────────────────────────────────────────────
//
// Worked from the DLS National Guidelines on Good Livestock Production Practices (June 2023) §12.1.1.2 and §13.1.1 —
// a bought bull kept apart 21 to 30 days, dewormed after his first week, sprayed for ticks, released if nothing
// abnormal shows — with the Meat Rules 2021 for what goes with him when he is sold, WOAH on lumpy skin (three weeks
// to protection) and Merck on the first fortnight's pneumonia. Each counted from his own arrival, so a lorry that
// came in over three days is dewormed over three days.

/** How long a bought bull is kept apart: the DLS's thirty days, the longer of its two figures. */
const QUARANTINE_DAYS = 30;
/** Dewormed once his first week has shown nothing wrong (DLS GLPP 2023 §12.1.1.2(n)). */
const DEWORM_AFTER_DAYS = 7;
/** FMD and lumpy skin together, in separate syringes, once he is dewormed and settled (WOAH 2021). */
const VACCINATE_AFTER_DAYS = 10;
/** HS and BQ a few days after, on the Vet's advice. */
const HS_BQ_AFTER_DAYS = 14;
/** Anthrax last: no antibiotic within a week of it (Merck), so it is kept clear of the first doses. */
const ANTHRAX_AFTER_DAYS = 21;
/** FMD again, and a second drench, four months on (DLS: FMD every four to six months, deworming the same). */
const BOOSTER_AFTER_DAYS = 120;

/** Every step of work raised about one bull is his alone. */
const hisStep = (
  id: string,
  bn: string,
  en: string,
  extra: Partial<Step> = {}
): Step => ({
  id,
  text: { bn, en },
  repeatPerAnimal: true,
  evidence: [{ type: "tick", required: true }],
  skipReasons: [],
  ...extra,
});

const UNWELL_LATER = {
  bn: "অসুস্থ — পরে দেওয়া হবে",
  en: "Unwell — to be given later",
};

const arrivalCheck = (): SopContent => ({
  name: { bn: "নতুন ষাঁড় আসার দিন", en: "Arrival check" },
  purpose: {
    bn: "হাট থেকে আসা ষাঁড়কে পানি-স্যালাইন ও শুধু খড়-ঘাস দিন, ধুয়ে দিন, ক্ষুরা রোগের লক্ষণ দেখুন আর গোবরের নমুনা নিন",
    en: "Water and electrolytes, straw or grass only, a wash, a look for FMD, and a dung sample for the bought bull",
  },
  triggers: [{ kind: "event", event: "arrival" }],
  appliesTo: { side: "fattening" },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 6 * 60,
  steps: [
    hisStep(
      "water",
      "পানি আর স্যালাইন দিন; প্রথম খাবার শুধু খড় বা ঘাস",
      "Water and electrolytes; the first feed straw or grass only"
    ),
    hisStep(
      "wash",
      "জীবাণুনাশক সাবান-পানিতে ধুয়ে মুছে দিন",
      "Wash with antiseptic soap and water, and dry"
    ),
    hisStep(
      "look",
      "ক্ষুরা রোগ আর অসুখের লক্ষণ দেখুন",
      "Look him over for FMD and illness",
      {
        evidence: [
          choice(true, [
            [ROUND_WORDS.sores, "মুখে বা ক্ষুরে ঘা", "Sores on mouth or feet"],
            [ROUND_WORDS.lame, "খোঁড়াচ্ছে", "Lame"],
            [ROUND_WORDS.cough, "কাশি বা নাক দিয়ে পানি", "Cough or runny nose"],
            [ROUND_WORDS.diarrhoea, "পাতলা পায়খানা", "Scours"],
          ]),
        ],
        skipReasons: [
          { bn: "সুস্থ — চোখে পড়ার মতো কিছু নেই", en: "Well — nothing to note" },
        ],
        effect: { kind: "observation" },
      }
    ),
    hisStep(
      "dung",
      "কৃমির ডিম পরীক্ষার জন্য গোবরের নমুনা পাঠান",
      "Send a dung sample to be tested for worm eggs",
      {
        skipReasons: [{ bn: "নমুনা নেওয়া যায়নি", en: "No sample could be taken" }],
      }
    ),
  ],
});

/** A dose given to each bull on his own day, of the product the farm named — or refused publishing until it names one. */
const hisDose = (
  productId: string | undefined,
  bn: string,
  en: string,
  purpose: { bn: string; en: string },
  afterDays: number
): SopContent => ({
  ...vaccination(productId, bn, en),
  purpose,
  triggers: [{ kind: "event", event: "arrival", offsetDays: afterDays }],
  appliesTo: { side: "fattening" },
});

/** A drench to each bull on his own day: no vial, so no Lot Number is asked. */
const hisDrench = (
  productId: string | undefined,
  bn: string,
  en: string,
  purpose: { bn: string; en: string },
  afterDays: number
): SopContent => ({
  ...deworming(productId),
  name: { bn, en },
  purpose,
  triggers: [{ kind: "event", event: "arrival", offsetDays: afterDays }],
  appliesTo: { side: "fattening" },
});

const arrivalDeworming = (productId: string | undefined): SopContent =>
  hisDrench(
    productId,
    "নতুন ষাঁড়ের কৃমিনাশক",
    "Arrival deworming",
    {
      bn: "আসার এক সপ্তাহ পরে সুস্থ ষাঁড়কে ওজন অনুযায়ী কলিজা কৃমির ওষুধ খাওয়ান — অক্সিক্লোজানাইড বা নাইট্রক্সিনিল; বাংলাদেশে ট্রাইক্লাবেনডাজল আর কাজ করছে না",
      en: "A week after he came, drench the well bull by weight for liver fluke — oxyclozanide or nitroxynil; triclabendazole is failing in Bangladesh",
    },
    DEWORM_AFTER_DAYS
  );

const arrivalFmd = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "নতুন ষাঁড়ের ক্ষুরা রোগের টিকা",
    "Arrival FMD vaccination",
    {
      bn: "আসার দশ দিন পরে সুস্থ ষাঁড়কে ক্ষুরা রোগের টিকা দিন — লাম্পি স্কিনের টিকার সাথে একই দিনে, আলাদা সিরিঞ্জে, গলার অন্য পাশে",
      en: "Ten days after he came, vaccinate the well bull for FMD — the same day as lumpy skin, in its own syringe, on the other side of the neck",
    },
    VACCINATE_AFTER_DAYS
  );

const arrivalLsd = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "নতুন ষাঁড়ের লাম্পি স্কিন টিকা",
    "Arrival lumpy skin vaccination",
    {
      bn: "আসার দশ দিন পরে সুস্থ ষাঁড়কে লাম্পি স্কিনের টিকা দিন — সুরক্ষা আসতে তিন সপ্তাহ লাগে, তাই কোয়ারেন্টিন শেষের আগেই",
      en: "Ten days after he came, vaccinate the well bull for lumpy skin — protection takes three weeks, so before quarantine ends",
    },
    VACCINATE_AFTER_DAYS
  );

const hsVaccination = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "গলাফোলা রোগের টিকা",
    "HS vaccination",
    {
      bn: "ভেটের পরামর্শে আসার দুই সপ্তাহ পরে গলাফোলার টিকা দিন; প্রতি ছয় মাসে আবার",
      en: "On the Vet's advice, vaccinate for haemorrhagic septicaemia a fortnight after he came; again every six months",
    },
    HS_BQ_AFTER_DAYS
  );

const bqVaccination = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "বাদলা রোগের টিকা",
    "BQ vaccination",
    {
      bn: "ভেটের পরামর্শে আসার দুই সপ্তাহ পরে বাদলার টিকা দিন; আড়াই-তিন বছরের বেশি বয়সে লাগে না",
      en: "On the Vet's advice, vaccinate for black quarter a fortnight after he came; not needed past two and a half to three years",
    },
    HS_BQ_AFTER_DAYS
  );

const anthraxVaccination = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "তড়কা রোগের টিকা",
    "Anthrax vaccination",
    {
      bn: "যেখানে তড়কা হয়, সেখানে ভেটের পরামর্শে দিন — টিকার পর এক সপ্তাহ কোনো অ্যান্টিবায়োটিক নয়",
      en: "Where anthrax occurs, on the Vet's advice — no antibiotic for a week after it",
    },
    ANTHRAX_AFTER_DAYS
  );

const fmdBooster = (productId: string | undefined): SopContent =>
  hisDose(
    productId,
    "ক্ষুরা রোগের দ্বিতীয় টিকা",
    "FMD booster",
    {
      bn: "আসার চার মাস পরে যে ষাঁড় এখনো আছে, তাকে আবার ক্ষুরা রোগের টিকা দিন",
      en: "Four months after he came, vaccinate the bull still here for FMD again",
    },
    BOOSTER_AFTER_DAYS
  );

const dewormBooster = (productId: string | undefined): SopContent =>
  hisDrench(
    productId,
    "দ্বিতীয় কৃমিনাশক",
    "Second deworming",
    {
      bn: "আসার চার মাস পরে যে ষাঁড় এখনো আছে, তাকে আবার কৃমিনাশক খাওয়ান — প্রথমবারের চেয়ে অন্য ধরনের ওষুধ",
      en: "Four months after he came, drench the bull still here again — a different class of drug from the first",
    },
    BOOSTER_AFTER_DAYS
  );

const tickSpray = (productId: string | undefined): SopContent => ({
  name: { bn: "আঁটুলি ও মাছির স্প্রে", en: "Tick and fly spray" },
  purpose: {
    bn: "প্রতি সপ্তাহে মোটাতাজাকরণের পশুদের আঁটুলি-মাছির স্প্রে দিন, আর খাবারের পাত্রে চুনকাম করুন — বিক্রির জন্য প্রস্তুত ষাঁড়কে নয়",
    en: "Spray the fattening animals for ticks and flies each week, and whitewash the troughs — not a bull ready for sale",
  },
  // Weekly (DLS GLPP 2023 §14.1.6.3.1): lumpy skin rides on biting flies. Never the bull ready for sale, whose
  // withdrawal would hold up his sale.
  triggers: [{ kind: "schedule", times: ["08:30"], weekdays: [1] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 8 * 60,
  steps: [
    {
      id: "spray",
      text: { bn: "স্প্রে করুন", en: "Spray him" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [UNWELL_LATER],
      effect: campaignDose(productId),
    },
    {
      id: "troughs",
      text: { bn: "খাবারের পাত্রে চুনকাম করুন", en: "Whitewash the troughs" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const quarantineRelease = (): SopContent => ({
  name: { bn: "কোয়ারেন্টিন শেষ", en: "Quarantine release" },
  purpose: {
    bn: "ত্রিশ দিনে অস্বাভাবিক কিছু না দেখা গেলে ষাঁড়কে কোয়ারেন্টিন থেকে ছেড়ে তার ওজনে মানানসই রেশনের পেনে নিন",
    en: "After thirty days with nothing abnormal, let the bull out of quarantine to the pen whose ration suits his weight",
  },
  triggers: [
    { kind: "state", state: "quarantine", offsetDays: QUARANTINE_DAYS },
  ],
  appliesTo: { side: "fattening", states: ["quarantine"] },
  assignedRole: "manager",
  checkerRole: "vet",
  graceMinutes: 24 * 60,
  steps: [
    hisStep(
      "healthy",
      "ষাঁড় সুস্থ — ত্রিশ দিনে অস্বাভাবিক কিছু দেখা যায়নি",
      "He is well — nothing abnormal in thirty days",
      {
        skipReasons: [
          { bn: "অসুস্থ — কোয়ারেন্টিনে থাকবে", en: "Unwell — stays in quarantine" },
        ],
      }
    ),
    hisStep(
      "doses",
      "কৃমিনাশক আর টিকা সব দেওয়া হয়েছে",
      "Every drench and vaccine has been given"
    ),
    hisStep(
      "release",
      "কোয়ারেন্টিন থেকে ছেড়ে মানানসই পেনে নিন",
      "Let him out, to the pen that suits him",
      {
        skipReasons: [
          { bn: "অসুস্থ — কোয়ারেন্টিনে থাকবে", en: "Unwell — stays in quarantine" },
        ],
        effect: { kind: "release" },
      }
    ),
  ],
});

const shedDisinfection = (): SopContent => ({
  name: { bn: "শেড জীবাণুমুক্ত করা", en: "Shed disinfection" },
  purpose: {
    bn: "সপ্তাহে দুই দিন পেন ঘষে পরিষ্কার করে জীবাণুনাশক দিন",
    en: "Twice a week, scrub the pen and disinfect it",
  },
  // Scrubbed daily and disinfected twice a week (DLS GLPP 2023 §13.1.1): the daily scrub is the feed round's; this is
  // the disinfectant, Tuesdays and Fridays.
  triggers: [{ kind: "schedule", times: ["10:00"], weekdays: [2, 5] }],
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 6 * 60,
  steps: [
    {
      id: "scrub",
      text: {
        bn: "মেঝে আর পাত্র ঘষে পরিষ্কার করুন",
        en: "Scrub the floor and troughs",
      },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "disinfect",
      text: { bn: "জীবাণুনাশক ছিটিয়ে দিন", en: "Spray the disinfectant" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
  ],
});

const preSale = (): SopContent => ({
  name: { bn: "বিক্রির আগের যাচাই", en: "Pre-sale check" },
  purpose: {
    bn: "বিক্রির জন্য প্রস্তুত ষাঁড়ের শেষ ওজন নিন, ভেটের স্বাস্থ্য সনদ আর চলাচলের অনুমতি রাখুন; যাওয়ার দিন গাড়ি জীবাণুমুক্ত করে ঠান্ডা সময়ে তুলুন",
    en: "For the bull ready for sale: a last weight, the Vet's health certificate and the movement permit; on the day, a disinfected vehicle and loading in the cool",
  },
  // Meat Rules 2021 r.10 (a Vet looks at every treatment of the last thirty days) and r.18 (the vehicle, the card, the
  // space); DLS GLPP 2023 §16.1.4 (a permit and a certificate, travel in the coolest hours). The farm already refuses
  // a bull ready for sale while any withdrawal runs; this is what goes with him.
  triggers: [{ kind: "state", state: "ready_for_sale" }],
  appliesTo: { side: "fattening", states: ["ready_for_sale"] },
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    hisStep("weigh", "শেষ ওজন নিন", "Take his last weight", {
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি", en: "kg" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি", en: "Would not go up the crush" }],
      effect: { kind: "weigh_in" },
    }),
    hisStep(
      "clean",
      "কোনো স্টেরয়েড বা হরমোন দেওয়া হয়নি — আইনে নিষিদ্ধ",
      "No steroid or hormone was ever given — the law forbids it"
    ),
    hisStep(
      "papers",
      "ভেটের স্বাস্থ্য সনদ আর চলাচলের অনুমতির ছবি",
      "Photo of the Vet's health certificate and the movement permit",
      {
        evidence: [{ type: "photo", required: false }],
      }
    ),
    hisStep(
      "vehicle",
      "যাওয়ার দিন: গাড়ি জীবাণুমুক্ত, ঠান্ডা সময়ে তোলা, পানি-খাবার দিয়ে",
      "On the day: vehicle disinfected, loaded in the cool, watered and fed first",
      {
        evidence: [{ type: "tick", required: false }],
        skipReasons: [
          {
            bn: "খামার থেকেই বিক্রি — গাড়ি লাগেনি",
            en: "Sold at the farm gate — no vehicle",
          },
        ],
      }
    ),
  ],
});

export type PlaybookKey =
  | "morningMilking"
  | "eveningMilking"
  | "feeding"
  | "healthRound"
  | "insemination"
  | "pregnancyCheck"
  | "dryOff"
  | "calvingPrep"
  | "calvingRecord"
  | "weighIn"
  | "fmdVaccination"
  | "lsdVaccination"
  | "deworming"
  | "treatmentDose"
  | "burial"
  | "dlsReport"
  | "stockCount"
  | "biosecurity"
  | "arrivalCheck"
  | "arrivalDeworming"
  | "arrivalFmd"
  | "arrivalLsd"
  | "hsVaccination"
  | "bqVaccination"
  | "anthraxVaccination"
  | "tickSpray"
  | "quarantineRelease"
  | "shedDisinfection"
  | "fmdBooster"
  | "dewormBooster"
  | "preSale";

/** What a standard SOP asks of the farm before it can be published: the farm's own calving Pen, or the product on
 *  its Drug List a campaign gives. Left blank, the SOP is refused publishing and says why. */
export type StandardSopNeed =
  | "calvingPen"
  | "fmdVaccine"
  | "lsdVaccine"
  | "dewormer"
  | "flukeDrench"
  | "hsVaccine"
  | "bqVaccine"
  | "anthraxVaccine"
  | "tickSpray";

export const STANDARD_SOP_NEEDS: Partial<Record<PlaybookKey, StandardSopNeed>> =
  {
    calvingPrep: "calvingPen",
    fmdVaccination: "fmdVaccine",
    lsdVaccination: "lsdVaccine",
    deworming: "dewormer",
    arrivalDeworming: "flukeDrench",
    arrivalFmd: "fmdVaccine",
    arrivalLsd: "lsdVaccine",
    hsVaccination: "hsVaccine",
    bqVaccination: "bqVaccine",
    anthraxVaccination: "anthraxVaccine",
    tickSpray: "tickSpray",
    fmdBooster: "fmdVaccine",
    dewormBooster: "dewormer",
  };

/** The farm's own Pen or product for each need, where it has named one. */
export type StandardSopChoices = Partial<Record<StandardSopNeed, string>>;

/** The Standard Playbook, with whatever the farm has named filled in and anything it has not left blank. */
export const standardPlaybook = (
  chosen: StandardSopChoices = {}
): Record<PlaybookKey, SopContent> => ({
  morningMilking: milkingSession("05:30", "সকালের দোহন", "Morning milking"),
  eveningMilking: milkingSession("16:30", "বিকেলের দোহন", "Evening milking"),
  feeding: feeding(),
  healthRound: healthRound(),
  insemination: artificialInsemination(),
  pregnancyCheck: pregnancyCheck(),
  dryOff: dryOff(),
  calvingPrep: calvingPrep(chosen.calvingPen),
  calvingRecord: calvingRecord(),
  weighIn: weighIn(),
  fmdVaccination: vaccination(
    chosen.fmdVaccine,
    "ক্ষুরা রোগের (এফএমডি) টিকা",
    "FMD vaccination"
  ),
  lsdVaccination: vaccination(
    chosen.lsdVaccine,
    "লাম্পি স্কিন রোগের টিকা",
    "Lumpy skin vaccination"
  ),
  deworming: deworming(chosen.dewormer),
  treatmentDose: treatmentDose(),
  burial: burial(),
  dlsReport: dlsReport(),
  stockCount: stockCount(),
  biosecurity: biosecurity(),
  arrivalCheck: arrivalCheck(),
  arrivalDeworming: arrivalDeworming(chosen.flukeDrench),
  arrivalFmd: arrivalFmd(chosen.fmdVaccine),
  arrivalLsd: arrivalLsd(chosen.lsdVaccine),
  hsVaccination: hsVaccination(chosen.hsVaccine),
  bqVaccination: bqVaccination(chosen.bqVaccine),
  anthraxVaccination: anthraxVaccination(chosen.anthraxVaccine),
  tickSpray: tickSpray(chosen.tickSpray),
  quarantineRelease: quarantineRelease(),
  shedDisinfection: shedDisinfection(),
  fmdBooster: fmdBooster(chosen.fmdVaccine),
  dewormBooster: dewormBooster(chosen.dewormer),
  preSale: preSale(),
});
