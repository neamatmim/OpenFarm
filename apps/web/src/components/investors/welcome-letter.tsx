import { phoneSaid, PORTAL_SIGN_IN_HOURS } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import {
  formatDate,
  formatDigits,
  timeInDigits,
  translate,
} from "@OpenFarm/i18n";
import { encode } from "uqr";

import { Letterhead } from "@/components/ventures/paper-document";
import { portalAddress, portalAddressTyped } from "@/lib/portal-address";
import type { PageSetup } from "@/lib/print-alone";
import type { client } from "@/utils/orpc";

// The Welcome Letter and its Code Slip (the glossary's entries), as the Owner prints them from the code dialog: in Bangla
// or in English, as the Owner chooses for whoever it is handed to (ADR 0021). The farm lays out everything round the
// code; the code is set here, from the Owner's screen, and nowhere else.

/** What the farm lays out round the code: whom it is for, whom to call, and on the letter the notice for its back. */
export type HandedOverPaper = Awaited<
  ReturnType<typeof client.investors.handOver>
>;

/** A code as the dialog holds it: the code on the Owner's screen, until when it can be taken up, and the paper it goes
 *  out with. */
export type GivenCode = Awaited<
  ReturnType<typeof client.investors.inviteToPortal>
>;

/** The id the paper is found by to print it alone (lib/print-alone). */
export const HANDED_OVER_ID = "handed-over-paper";

/** Four characters of a code at a time. */
const FOUR_AT_A_TIME = /.{1,4}/gu;

/** A code as it is printed and read aloud: in fours, `K7QM 4PXA`. */
export const inFours = (code: string) =>
  code.match(FOUR_AT_A_TIME)?.join(" ") ?? code;

/** The letter's own words, in each language it is read in (ADR 0021). */
const WORDS = {
  bn: {
    title: "বিনিয়োগকারী পোর্টালে আপনাকে স্বাগতম",
    date: "তারিখ",
    dear: (name: string) => `প্রিয় ${name},`,
    intro:
      "আপনি যে ভেঞ্চারগুলোতে আছেন, সেগুলো আজ কেমন চলছে — পশুর ওজন, খরচ, আপনার টাকার হিসাব — আর আপনার নিজের কাগজগুলো এখন থেকে নিজের ফোনে দেখতে পারবেন। পোর্টাল শুধু দেখার জন্য: এতে কিছু সই হয় না, কোনো টাকা দেওয়া-নেওয়া হয় না।",
    scanOrType: "ফোনের ক্যামেরায় পাশের QR কোডটি স্ক্যান করুন, অথবা ব্রাউজারে লিখুন:",
    press: (button: string) => `“${button}” চাপুন।`,
    yourMobile: "মোবাইল নম্বর দিন — খামারে আপনার যে নম্বর আছে:",
    theSlip: "নিচের ছেঁড়া স্লিপের কোডটি দিন।",
    password: (button: string) =>
      `নিজের একটি পাসওয়ার্ড বেছে নিন, দুবার লিখুন, তারপর “${button}” চাপুন।`,
    nextTime:
      "পরের বার একই ঠিকানায় শুধু মোবাইল নম্বর আর পাসওয়ার্ড দিলেই হবে — কোড আর লাগবে না।",
    scan: "স্ক্যান করুন",
    call: "কোনো সমস্যা হলে ফোন করুন",
    lost: "পাসওয়ার্ড ভুলে গেলে বা ফোন হারালে খামারকে জানান — নতুন কোড দেওয়া হবে, অথবা প্রবেশ বন্ধ করা হবে।",
    remember: "মনে রাখবেন",
    neverAsks:
      "খামার কখনো ফোনে, মেসেজে বা অন্য কারও মাধ্যমে আপনার পাসওয়ার্ড চাইবে না। কেউ চাইলে দেবেন না, খামারকে জানান।",
    hours: (hours: string) =>
      `একবার সাইন ইন করলে ${hours} ঘণ্টা থাকে, তারপর আবার সাইন ইন করতে হয়।`,
    behind: "খামার আপনার কোন তথ্য কেন রাখে, তা এই চিঠির পেছনের পাতায় লেখা আছে।",
    tearHere: "এখানে ছিঁড়ুন",
    oneTimeCode: (name: string) => `${name}-এর এককালীন কোড`,
    lastDay: "শেষ দিন",
    onceOnly: "একবারই ব্যবহার করা যায়। ব্যবহারের পর এই অংশটি নষ্ট করে ফেলুন।",
  },
  en: {
    title: "Welcome to the Investor Portal",
    date: "Date",
    dear: (name: string) => `Dear ${name},`,
    intro:
      "From now on you can see on your own phone how the Ventures you are in are doing today — the animals' weights, the spending, the account of your money — and your own papers. The portal is for reading only: nothing is signed in it, and no money is paid or received through it.",
    scanOrType:
      "Scan the QR code beside this with your phone's camera, or type in a browser:",
    press: (button: string) => `Press “${button}”.`,
    yourMobile: "Enter your mobile number — the one the farm has for you:",
    theSlip: "Enter the code on the slip torn off below.",
    password: (button: string) =>
      `Choose a password of your own, type it twice, then press “${button}”.`,
    nextTime:
      "Next time, at the same address, your mobile number and password are all you need — no code.",
    scan: "Scan",
    call: "If anything goes wrong, call",
    lost: "If you forget your password or lose your phone, tell the farm — you will be given a new code, or your access will be closed.",
    remember: "Remember",
    neverAsks:
      "The farm will never ask for your password by phone, by message or through anyone else. If anyone asks, do not give it; tell the farm.",
    hours: (hours: string) =>
      `Once you sign in you stay signed in for ${hours} hours, then you sign in again.`,
    behind:
      "What the farm keeps about you, and why, is written on the back of this letter.",
    tearHere: "tear here",
    oneTimeCode: (name: string) => `${name}'s one-time code`,
    lastDay: "Last day",
    onceOnly: "Once only. Destroy this part after using it.",
  },
} as const satisfies Record<Language, unknown>;

/** A QR code, drawn square by square: black on white whatever the page, so any phone's camera reads it. Hidden from a
 *  screen reader, which reads the same address printed beside it. */
const Qr = ({ value, size }: { value: string; size: string }) => {
  const { data } = encode(value, { border: 1 });
  const across = data.length;
  let squares = "";
  for (const [y, row] of data.entries()) {
    for (const [x, on] of row.entries()) {
      if (on) {
        squares += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  return (
    <svg
      aria-hidden
      className="shrink-0"
      style={{ width: size, height: size }}
      viewBox={`0 0 ${across} ${across}`}
    >
      <rect fill="#fff" height={across} width={across} />
      <path d={squares} fill="#000" />
    </svg>
  );
};

/** The Code Slip: whose code it is, the code in fours, and its last day — never the phone it opens the door with. */
const Slip = ({
  paper,
  given,
  language,
}: {
  paper: HandedOverPaper;
  given: GivenCode;
  language: Language;
}) => {
  const words = WORDS[language];
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex flex-col gap-0.5 text-[12px]">
        <p className="font-semibold">
          {words.oneTimeCode(paper.investor.name)}
        </p>
        <p className="text-neutral-700">
          {words.lastDay}:{" "}
          {formatDate(new Date(given.expiresAt), language, "dateTime")}
        </p>
        <p className="text-[10px] text-neutral-500">{words.onceOnly}</p>
        <p className="text-[9px] text-neutral-400">{paper.letterhead.name}</p>
      </div>
      <p className="shrink-0 rounded-md border-2 border-neutral-900 px-5 py-2 font-mono text-3xl font-bold whitespace-nowrap">
        {inFours(given.code)}
      </p>
    </div>
  );
};

/** The steps in, the QR beside them: the address, the join button's own words, their phone, the slip, a password. */
const Steps = ({
  phone,
  own,
  language,
}: {
  phone: string;
  own: string | null;
  language: Language;
}) => {
  const words = WORDS[language];
  const steps = [
    <>
      {words.scanOrType}{" "}
      <span className="font-mono font-semibold break-all">
        {portalAddressTyped(own)}
      </span>
    </>,
    <span key="press">
      {words.press(translate(language, "portal.haveCode"))}
    </span>,
    <>
      {words.yourMobile}{" "}
      <span className="font-semibold whitespace-nowrap">
        {phoneSaid(phone, language)}
      </span>
    </>,
    <span key="slip">{words.theSlip}</span>,
    <span key="password">
      {words.password(translate(language, "portal.join"))}
    </span>,
    <span key="next">{words.nextTime}</span>,
  ];
  return (
    <div className="mt-5 flex gap-6">
      <ol className="flex flex-1 list-none flex-col gap-2">
        {steps.map((step, index) => (
          // The steps are a fixed list, in the order they are taken.
          // oxlint-disable-next-line react/no-array-index-key
          <li className="flex gap-2" key={index}>
            <span className="w-5 shrink-0 font-bold">
              {formatDigits(index + 1, language)}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-center gap-1">
        <Qr size="34mm" value={portalAddress(own)} />
        <span className="text-[10px] text-neutral-500">{words.scan}</span>
      </div>
    </div>
  );
};

/** A notice as a page reads it: its title, its opening, and each part's lines. */
type NoticeRead = NonNullable<HandedOverPaper["notice"]>;

/** «আপনার তথ্য» on the page behind the letter: the notice as the portal's own page reads it, in the letter's language. */
const NoticeBehind = ({ notice }: { notice: NoticeRead }) => (
  <section className="flex break-before-page flex-col gap-3 px-[18mm] pt-[14mm] pb-[12mm] text-[11px] leading-[0.95rem]">
    <h2 className="text-base font-bold">{notice.title}</h2>
    <p className="text-neutral-700">{notice.preamble}</p>
    {notice.parts.map((part) => (
      <div
        className="flex break-inside-avoid flex-col gap-1"
        key={part.heading}
      >
        <h3 className="text-[12px] font-semibold">{part.heading}</h3>
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          {part.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    ))}
  </section>
);

/** The made-on line as the server says it: in both languages, or — from a server older than that — in Bangla. */
const producedIn = (
  produced: HandedOverPaper["produced"],
  language: Language
): string => (typeof produced === "string" ? produced : produced[language]);

/**
 * The Welcome Letter, on one A4 page with the Code Slip torn off its foot and «আপনার তথ্য» on the page behind, in
 * Bangla or in English as the Owner chooses for whoever it is handed to (ADR 0021): letterhead, title and date; what
 * the portal shows and that nothing is signed or paid through it; the steps with the QR beside them; whom to call; that
 * the farm never asks for a password; the standing notice; and the slip.
 */
export const WelcomeLetter = ({
  paper,
  given,
  language,
}: {
  paper: HandedOverPaper;
  given: GivenCode;
  language: Language;
}) => {
  const words = WORDS[language];
  const notice =
    language === "en" ? (paper.noticeInEnglish ?? paper.notice) : paper.notice;
  return (
    <div
      className="paper-sheet bg-white text-neutral-900"
      id={HANDED_OVER_ID}
      lang={language}
    >
      <section className="flex h-[296mm] flex-col overflow-hidden">
        <div className="flex flex-1 flex-col px-[18mm] pt-[14mm] text-[13px] leading-[1.3rem]">
          <Letterhead language={language} letterhead={paper.letterhead} />
          <h1 className="mt-4 text-lg font-bold">{words.title}</h1>
          <p className="mt-1 text-[11px] text-neutral-500">
            {words.date}:{" "}
            {formatDate(new Date(`${paper.issuedOn}T00:00:00Z`), language)}
          </p>

          <p className="mt-4">{words.dear(paper.investor.name)}</p>
          <p className="mt-1">{words.intro}</p>

          <Steps
            language={language}
            own={given.portalOrigin}
            phone={paper.investor.phone}
          />

          <div className="mt-5 grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <p className="font-semibold">{words.call}</p>
              <p>
                {paper.farm.name}
                {paper.farm.phone
                  ? `: ${timeInDigits(paper.farm.phone, language)}`
                  : ""}
              </p>
              {paper.farm.address ? (
                <p className="text-neutral-600">{paper.farm.address}</p>
              ) : null}
              <p className="text-neutral-600">{words.lost}</p>
            </div>
            <div>
              <p className="font-semibold">{words.remember}</p>
              <p className="text-neutral-600">{words.neverAsks}</p>
              <p className="text-neutral-600">
                {words.hours(formatDigits(PORTAL_SIGN_IN_HOURS, language))}
              </p>
              <p className="text-neutral-600">{words.behind}</p>
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-300 pt-2 text-[10px] leading-[0.85rem] text-neutral-600">
            <p className="font-semibold text-neutral-800">
              {translate(language, "portal.notice")}
            </p>
            <p className="pt-1 text-neutral-400">
              {producedIn(paper.produced, language)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 px-[8mm] text-[10px] text-neutral-400">
          <span aria-hidden>✂</span>
          <span className="flex-1 border-t border-dashed border-neutral-400" />
          <span>{words.tearHere}</span>
          <span className="flex-1 border-t border-dashed border-neutral-400" />
        </div>
        <div className="px-[18mm] pt-3 pb-[12mm]">
          <Slip given={given} language={language} paper={paper} />
        </div>
      </section>
      {notice ? <NoticeBehind notice={notice} /> : null}
    </div>
  );
};

/** The Code Slip alone, for every code after the first: cut out along its border. */
export const CodeSlip = ({
  paper,
  given,
  language,
}: {
  paper: HandedOverPaper;
  given: GivenCode;
  language: Language;
}) => (
  <div
    className="paper-sheet bg-white text-neutral-900"
    id={HANDED_OVER_ID}
    lang={language}
  >
    <div className="rounded-md border border-dashed border-neutral-500 p-[6mm]">
      <Slip given={given} language={language} paper={paper} />
    </div>
  </div>
);

/**
 * Each paper a code goes out with, as the code dialog prints it: the button and what it says of the paper, how the
 * page is set, and the paper laid out. The letter is set on whole A4 pages of its own, edge to edge, so the slip sits
 * at the foot of the first; the slip alone is a strip at the head of a page, cut off along its border.
 */
export const CODE_PAPER = {
  welcome_letter: {
    print: "portal.printLetter",
    hint: "portal.printLetterHint",
    page: { margin: "0" },
    Paper: WelcomeLetter,
  },
  code_slip: {
    print: "portal.printSlip",
    hint: "portal.printSlipHint",
    page: { margin: "12mm" },
    Paper: CodeSlip,
  },
} as const satisfies Record<
  GivenCode["paper"],
  {
    print: MessageKey;
    hint: MessageKey;
    page: PageSetup;
    Paper: typeof WelcomeLetter;
  }
>;
