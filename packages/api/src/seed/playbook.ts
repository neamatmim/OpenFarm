import type { Evidence, SopContent } from "@OpenFarm/domain";
import { HEAT } from "@OpenFarm/domain";

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
  ],
});

/** What the round may see of an animal worth writing down. `heat` is the one the breeding chain listens for. */
export const SIGHTINGS = {
  heat: HEAT,
  lame: "lame",
  offFeed: "off_feed",
  mastitis: "mastitis",
  cough: "cough",
} as const;

const healthRound = (): SopContent => ({
  name: { bn: "স্বাস্থ্য ও গরম পর্যবেক্ষণ", en: "Health and heat round" },
  purpose: {
    bn: "প্রতিটি পশু দেখে যা চোখে পড়ে লিখুন — গরম, খোঁড়ানো, খাবারে অরুচি",
    en: "Look at every animal and write down what you see — heat, lameness, off feed",
  },
  triggers: [],
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
          [SIGHTINGS.heat, "গরম হয়েছে", "In heat"],
          [SIGHTINGS.lame, "খোঁড়াচ্ছে", "Lame"],
          [SIGHTINGS.offFeed, "খাবারে অরুচি", "Off feed"],
          [SIGHTINGS.mastitis, "ওলান ফোলা/শক্ত", "Swollen or hard udder"],
          [SIGHTINGS.cough, "কাশি", "Coughing"],
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

const calvingPrep = (calvingPenId: string): SopContent => ({
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
      evidence: [choice(true, [[calvingPenId, "প্রসব পেন", "Calving pen"]])],
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

const weighIn = (): SopContent => ({
  name: { bn: "ওজন নেওয়া", en: "Weigh-in" },
  purpose: {
    bn: "মোটাতাজাকরণের প্রতিটি পশুকে ক্রাশে তুলে ওজন নিন — প্রতি দুই সপ্তাহে",
    en: "Put each fattening animal through the crush and weigh it — every fortnight",
  },
  triggers: [],
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
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি", en: "Would not go up the crush" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

const vaccination = (
  productId: string,
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
      effect: { kind: "treatment", productId },
    },
  ],
});

const deworming = (productId: string): SopContent => ({
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
      effect: { kind: "treatment", productId },
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
  name: { bn: "মাসিক গুদাম গণনা", en: "Monthly stock count" },
  purpose: {
    bn: "গুদামে প্রতিটি খাদ্য আসলে কত আছে মেপে লিখুন, হিসাবের সাথে না মিললে কারণ লিখুন",
    en: "Weigh what is really in the store and give a reason where it differs from the book",
  },
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
  | "biosecurity";

/** The farm's Playbook: everything the farm does, as the Owner wrote it down. */
export const playbook = (ids: {
  calvingPenId: string;
  fmdVaccineId: string;
  lsdVaccineId: string;
  dewormerId: string;
}): Record<PlaybookKey, SopContent> => ({
  morningMilking: milkingSession("05:30", "সকালের দোহন", "Morning milking"),
  eveningMilking: milkingSession("16:30", "বিকেলের দোহন", "Evening milking"),
  feeding: feeding(),
  healthRound: healthRound(),
  insemination: artificialInsemination(),
  pregnancyCheck: pregnancyCheck(),
  dryOff: dryOff(),
  calvingPrep: calvingPrep(ids.calvingPenId),
  calvingRecord: calvingRecord(),
  weighIn: weighIn(),
  fmdVaccination: vaccination(
    ids.fmdVaccineId,
    "ক্ষুরা রোগের (এফএমডি) টিকা",
    "FMD vaccination"
  ),
  lsdVaccination: vaccination(
    ids.lsdVaccineId,
    "লাম্পি স্কিন রোগের টিকা",
    "Lumpy skin vaccination"
  ),
  deworming: deworming(ids.dewormerId),
  treatmentDose: treatmentDose(),
  burial: burial(),
  dlsReport: dlsReport(),
  stockCount: stockCount(),
  biosecurity: biosecurity(),
});
