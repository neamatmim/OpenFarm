/**
 * The published guides and trials the farm's standard figures are worked from, for the Owner to open when a figure is
 * questioned — chosen for being free to read, and every link opened on 29 September 2026
 * (docs/research/expected-daily-gain.md §10; the calf guides from docs/research/newborn-calf-care.md), the breeding and
 * milk ones on 30 September (docs/research/cow-watch.md). A title is as its publisher gives it; what each is good for is said in
 * both languages.
 */

interface Named {
  bn: string;
  en: string;
}

/** Where a guide belongs: the country's own, the feeding standards, how cattle are weighed and settled, or when a cow
 *  should come into heat and what her milk says. */
export const REFERENCE_GROUPS = [
  "bangladesh",
  "feeding",
  "weighing",
  "breeding",
] as const;
export type ReferenceGroup = (typeof REFERENCE_GROUPS)[number];

/** One guide or trial: what it is called, who published it and when, where to read it, and what it is good for. */
export interface StandardReference {
  group: ReferenceGroup;
  title: string;
  publisher: string;
  year: string | null;
  links: readonly string[];
  goodFor: Named;
}

/** The date the links were last opened and found to work. */
export const REFERENCES_CHECKED_ON = "2026-09-29";

export const STANDARD_REFERENCES = [
  {
    group: "bangladesh",
    title: "প্রাণিসম্পদ ও পোল্ট্রি উৎপাদন প্রযুক্তি নির্দেশিকা — গরু হৃষ্টপুষ্টকরণ (পৃ. ৯–১৩)",
    publisher: "BLRI",
    year: "2023",
    links: [
      "https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-blri/2026/7/be22d154-5229-4c4e-a80e-daa1b8a296d2.pdf",
    ],
    goodFor: {
      bn: "দেশের সরকারি মোটাতাজাকরণ পদ্ধতি: গরু বাছাই, কৃমিনাশ, খাওয়ানো আর বিক্রি; ৯০–১২০ দিন।",
      en: "The official Bangladeshi fattening method: choosing, deworming, feeding and selling; 90–120 days.",
    },
  },
  {
    group: "bangladesh",
    title:
      "National Guidelines on Good Livestock Production Practices (NG-GLPP)",
    publisher: "Department of Livestock Services",
    year: "2023",
    // The DLS portal's own copy stopped answering in September 2026; this is the Internet Archive's copy of it.
    links: [
      "https://web.archive.org/web/2025id_/https://dls.portal.gov.bd/sites/default/files/files/dls.portal.gov.bd/page/61d70f88_045d_4205_b5ed_2bfe65623e3f/2025-03-06-16-08-6165641f39ac4af51b27a3149f41366e.pdf",
    ],
    goodFor: {
      bn: "নবজাতক বাছুরের যত্ন (অধ্যায় ১১: শাল দুধ, নাভি, দুধ ছাড়ানো), বাছুরের টিকা (পরিশিষ্ট ৩১), কৃমিনাশ (পরিশিষ্ট ৩৫), আর প্রজননের লক্ষ্য — বিয়ানোর ৫০–৬০ দিনে গরম না হলে পরীক্ষা, সংকর বকনার প্রথম পাল ১৮–২০ মাসে (§১০, §১২.১.১.১, পরিশিষ্ট ২৬)।",
      en: "Newborn calf care (chapter XI: colostrum, the navel, weaning), calf vaccines (Appendix 31), worming (Appendix 35), and the breeding targets — a cow not in heat by 50–60 days examined, crossbred heifers first served at 18–20 months (§10, §12.1.1.1, Appendix 26).",
    },
  },
  {
    group: "bangladesh",
    title:
      "Hridoy et al., Genetic evaluation of different graded Holstein Friesian × Local crossbred breeding bulls of Bangladesh",
    publisher: "J. Adv. Vet. Anim. Res. 12(2)",
    year: "2025",
    links: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC12506709/"],
    goodFor: {
      bn: "৪,৩৭০টি সংকর বাছুরের জন্মের ওজন: গড় ২৫–২৭ কেজি, ১৫ থেকে ৪০ কেজি।",
      en: "Birth weights of 4,370 crossbred calves: 25–27 kg on average, 15 to 40 kg.",
    },
  },
  {
    group: "bangladesh",
    title: "DLS publications",
    publisher: "Department of Livestock Services",
    year: null,
    links: ["https://dls.gov.bd/pages/publications"],
    goodFor: {
      bn: "কৃমিনাশক নির্দেশিকা (২০২৩), বড় পশুর চিকিৎসা নির্দেশিকা, ঘাস চাষের নির্দেশিকা।",
      en: "The deworming guide (2023), treatment guidelines for large animals, and the fodder guide.",
    },
  },
  {
    group: "bangladesh",
    title:
      "Siddque et al., Growth performance of native and crossbred (Local × Holstein Friesian) bulls for fattening",
    publisher: "J. Agric. Sci. Technol. A 5",
    year: "2015",
    links: [
      "https://www.davidpublisher.com/Public/uploads/Contribute/57a2b8611751b.pdf",
    ],
    goodFor: {
      bn: "একই রেশনে দেশি আর হলস্টেইন-সংকর ষাঁড় পাশাপাশি: কে কতটা বাড়ে।",
      en: "Deshi and Holstein-cross bulls side by side on the same rations: what each gained.",
    },
  },
  {
    group: "bangladesh",
    title:
      "Rashid et al., Effect of concentrate feeding on the cost effective growth performance of F1 Local × Brahman bulls in Bangladesh",
    publisher: "Livestock Research for Rural Development 27(5)",
    year: "2015",
    links: ["https://www.lrrd.org/lrrd27/5/rash27100.htm"],
    goodFor: {
      bn: "৩৪৩ কেজির ব্রাহমা-সংকর ষাঁড় দানাদার, অর্ধেক দানাদার আর শুধু ইউএমএস-এ কতটা বেড়েছে।",
      en: "What Brahman-cross bulls of 343 kg gained on concentrate, half concentrate and urea-molasses-straw alone.",
    },
  },
  {
    group: "bangladesh",
    title:
      "Sultana et al., Effect of age on feed efficiency and carcass yield characteristics of indigenous bull",
    publisher: "Bangladesh Journal of Animal Science 46(1)",
    year: "2017",
    links: ["https://www.banglajol.info/index.php/BJAS/article/view/32171"],
    goodFor: {
      bn: "বয়স আর ওজনের সাথে পাবনা ষাঁড়ের বৃদ্ধি কীভাবে বদলায় (BLRI)।",
      en: "How gain changes with age and weight in Pabna bulls (BLRI).",
    },
  },
  {
    group: "bangladesh",
    title:
      "Livestock Research for Rural Development; Bangladesh Journal of Animal Science",
    publisher: "CIPAV; Bangladesh Animal Husbandry Association",
    year: null,
    links: [
      "https://www.lrrd.org/",
      "https://www.banglajol.info/index.php/BJAS",
    ],
    goodFor: {
      bn: "দেশের নতুন মোটাতাজাকরণ গবেষণা যেখানে বিনামূল্যে প্রকাশ হয়।",
      en: "Where new Bangladeshi fattening trials are published, free to read.",
    },
  },
  {
    group: "feeding",
    title: "Colostrum Management for Dairy Calves",
    publisher:
      "Vet. Clin. North Am. Food Anim. Pract. 35(3) (Godden, Lombard & Woolums)",
    year: "2019",
    links: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC7125574/"],
    goodFor: {
      bn: "শাল দুধ কত তাড়াতাড়ি আর কতটা: ২ ঘণ্টার মধ্যে, ওজনের ১০–১২%, আর দেরির দাম।",
      en: "How soon and how much colostrum: within 2 hours, 10–12% of birth weight, and what delay costs.",
    },
  },
  {
    group: "feeding",
    title: "Feeding Young Dairy Calves",
    publisher: "Merck Veterinary Manual",
    year: "2025",
    links: [
      "https://www.merckvetmanual.com/management-and-nutrition/nutrition-dairy-cattle/feeding-young-dairy-calves",
    ],
    goodFor: {
      bn: "জন্ম থেকে দুধ ছাড়ানো পর্যন্ত বাছুরকে খাওয়ানো: শাল দুধ, দুধের পরিমাণ, স্টার্টার।",
      en: "Feeding a calf from birth to weaning: colostrum, milk allowance, starter.",
    },
  },
  {
    group: "feeding",
    title: "Feeding and Nutritional Management of Beef Cattle",
    publisher: "Merck Veterinary Manual",
    year: "2026",
    links: [
      "https://www.merckvetmanual.com/management-and-nutrition/nutrition-beef-cattle/feeding-and-nutritional-management-of-beef-cattle",
    ],
    goodFor: {
      bn: "নতুন আসা গরুর যত্ন, তিন সপ্তাহে ধীরে ধীরে দানাদারে তোলা, সাধারণ বৃদ্ধি।",
      en: "Receiving new cattle, stepping them up to grain over three weeks, and typical gains.",
    },
  },
  {
    group: "feeding",
    title: "Nutrient Requirements of Beef Cattle, 8th revised edition",
    publisher: "National Academies of Sciences, Engineering, and Medicine",
    year: "2016",
    links: ["https://nap.nationalacademies.org/read/19014"],
    goodFor: {
      bn: "শক্তি, আমিষ আর খাদ্যগ্রহণের আন্তর্জাতিক মানদণ্ড; ব্রাউজারে বিনামূল্যে পড়া যায়।",
      en: "The standard for energy, protein and intake; free to read in a browser.",
    },
  },
  {
    group: "feeding",
    title:
      "Beef Cattle Nutrition Series Part 3: Nutrient Requirement Tables (MP391)",
    publisher: "University of Arkansas",
    year: "2018",
    links: ["https://www.uaex.uada.edu/publications/pdf/MP391.pdf"],
    goodFor: {
      bn: "ওজন আর বৃদ্ধি অনুযায়ী খাদ্যগ্রহণ, শক্তি ও আমিষের তালিকা, ষাঁড়সহ।",
      en: "Look-up tables of intake, energy and protein by weight and gain, bulls included.",
    },
  },
  {
    group: "feeding",
    title: "Feedipedia",
    publisher: "INRAE, CIRAD, AFZ and FAO",
    year: null,
    links: ["https://www.feedipedia.org/"],
    goodFor: {
      bn: "প্রতিটি খাবারে কী আছে: নেপিয়ার, খড়, ভুট্টা, ভুসি, খৈল।",
      en: "What each feed contains: napier, straw, maize, bran and oil cakes.",
    },
  },
  {
    group: "feeding",
    title:
      "Balanced Feeding for Improving Livestock Productivity (Animal Production and Health Paper 173)",
    publisher: "FAO",
    year: "2012",
    links: ["https://www.fao.org/4/i3014e/i3014e.pdf"],
    goodFor: {
      bn: "দক্ষিণ এশিয়ার খাবার দিয়ে সুষম রেশন বানানো, ভারতের NDDB থেকে।",
      en: "Balancing rations with South Asian feeds, from India's NDDB.",
    },
  },
  {
    group: "feeding",
    title: "Tropical Animal Feeding (Animal Production and Health Paper 126)",
    publisher: "FAO",
    year: "1995",
    links: ["https://www.fao.org/4/V9327E/V9327E00.htm"],
    goodFor: {
      bn: "গ্রীষ্মমণ্ডলের খাবার আর উপজাত দিয়ে গরু খাওয়ানো।",
      en: "Feeding cattle on tropical feeds and by-products.",
    },
  },
  {
    group: "weighing",
    title: "Understanding and Managing Cattle Shrink (P2577)",
    publisher: "Mississippi State University Extension",
    year: null,
    links: [
      "https://extension.msstate.edu/sites/default/files/publications/P2577_web.pdf",
    ],
    goodFor: {
      bn: "পথে একটি ষাঁড় কতটা ওজন হারায়, আর কত দিনে তা ফিরে পায়।",
      en: "How much weight a bull loses on the road, and how fast he gets it back.",
    },
  },
  {
    group: "weighing",
    title: "BIF Guidelines: Gain",
    publisher: "Beef Improvement Federation",
    year: "2026",
    links: ["https://guidelines.beefimprovement.org/index.php/Gain"],
    goodFor: {
      bn: "বৃদ্ধি মাপার আগে গরুকে কত দিন থিতু হতে দিতে হয়, আর কত দিন ধরে ওজন নিতে হয়।",
      en: "How long to let cattle settle, and how long to weigh them, before a gain means anything.",
    },
  },
  {
    group: "breeding",
    title: "Breeding Programs for Heifer Replacements and Cows",
    publisher: "Merck Veterinary Manual",
    year: "2024",
    links: [
      "https://www.merckvetmanual.com/management-and-nutrition/management-of-reproduction-cattle/breeding-programs-for-heifer-replacements-and-cows",
    ],
    goodFor: {
      bn: "বিয়ানোর পর কত দিন অপেক্ষা করে পাল দিতে হয়, গরমের চক্র ১৮–২৪ দিন, আর বকনাকে কখন প্রথম পাল দিতে হয়।",
      en: "How long to wait after calving before serving, the 18–24-day heat cycle, and when to serve a heifer first.",
    },
  },
  {
    group: "breeding",
    title: "Health and Production Management Programs for Dairy Cattle",
    publisher: "Merck Veterinary Manual",
    year: "2026",
    links: [
      "https://www.merckvetmanual.com/management-and-nutrition/preventive-health-care-and-husbandry-of-dairy-cattle/health-and-production-management-programs-for-dairy-cattle",
    ],
    goodFor: {
      bn: "বিয়ানোর পর গাভী কবে পরীক্ষা করাতে হয়, আর খামারের প্রজনন কতটা ভালো চলছে তা কোন হিসাবে বোঝা যায়।",
      en: "When a cow should be examined after calving, and which figures show how well the herd is breeding.",
    },
  },
  {
    group: "breeding",
    title:
      "Effects of breed, management system, milk yield and body weight on onset of postpartum ovarian cyclicity in cows",
    publisher: "Bangladesh Veterinarian (Saha et al.)",
    year: "2015",
    links: ["https://www.banglajol.info/index.php/BVET/article/view/29254"],
    goodFor: {
      bn: "দেশের গাভী বিয়ানোর পর কত দেরিতে আবার গরম হয়: ১২০ দিনের মধ্যে মাত্র ৩০% — তাই গরম না দেখা গাভীর তালিকা লম্বা হবে।",
      en: "How late Bangladeshi cows cycle again after calving: only 30% within 120 days — why the no-heat list will be long.",
    },
  },
  {
    group: "breeding",
    title:
      "Genetic evaluation of different graded HF × Local crossbred breeding bulls of Bangladesh",
    publisher:
      "Journal of Advanced Veterinary and Animal Research (Hridoy et al.)",
    year: "2025",
    links: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC12506709/"],
    goodFor: {
      bn: "সংকর বকনা আসলে কত বয়সে গর্ভধারণ করে, আর দেশের সংকর গাভীর বাচ্চা দেওয়ার মাঝের সময়।",
      en: "The age crossbred heifers actually conceive at, and the calving interval of Bangladeshi crossbred cows.",
    },
  },
  {
    group: "breeding",
    title:
      "Performance and nutritional status of Holstein crossbred cows in a selected area of Bangladesh",
    publisher:
      "Journal of Advanced Veterinary and Animal Research (Rahman et al.)",
    year: "2024",
    links: ["https://pmc.ncbi.nlm.nih.gov/articles/PMC11590593/"],
    goodFor: {
      bn: "দেশের সংকর গাভীর পূর্ণ ওজন — বকনা প্রথম পাল দেওয়ার ওজন (পূর্ণ ওজনের ৫৫–৬০%) এখান থেকে হিসাব হয়।",
      en: "The grown weight of Bangladeshi crossbred cows — what a heifer's first-service weight (55–60% of it) is worked from.",
    },
  },
  {
    group: "breeding",
    title:
      "Milk losses and dynamics during perturbations in dairy cows differ with parity and lactation stage",
    publisher: "Journal of Dairy Science (Adriaens et al.)",
    year: "2021",
    links: ["https://doi.org/10.3168/jds.2020-19195"],
    goodFor: {
      bn: "গাভীর দুধ কতটা আর কত দিন কমলে তা অসুখের লক্ষণ ধরা হয় — ২ দিনে ২০% কমার নিয়মটি একটি প্রথা, মাপা সীমা নয়।",
      en: "How far and how long a cow's milk must fall to mean illness — the 20%-in-2-days rule is a convention, not a measured line.",
    },
  },
] as const satisfies readonly StandardReference[];
