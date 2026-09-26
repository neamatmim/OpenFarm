import { PORTAL_SIGN_IN_HOURS } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
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

// The Welcome Letter and its Code Slip (the glossary's entries), as the Owner prints them from the code dialog. Bangla
// throughout, for everybody: English only on the title, the slip's labels and the standing notice, as on the Investor
// Statements. The farm lays out everything round the code; the code is set here, from the Owner's screen, and nowhere
// else.

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
/** A mobile number as the farm keeps it: 01, then nine digits. */
const MOBILE = /^01\d{9}$/u;

/** A code as it is printed and read aloud: in fours, `K7QM 4PXA`. */
export const inFours = (code: string) =>
  code.match(FOUR_AT_A_TIME)?.join(" ") ?? code;

/** A number written as the farm keeps it, in Bangla digits and split after the operator's five: `০১৭১১-২৩৪৫৬৭`. */
const phoneInBangla = (phone: string) =>
  timeInDigits(
    MOBILE.test(phone) ? `${phone.slice(0, 5)}-${phone.slice(5)}` : phone,
    "bn"
  );

const said = (key: Parameters<typeof translate>[1]) => translate("bn", key);

/** The letter's few words that carry their English beside the Bangla: its title and the slip's labels, and no more. */
const LABELS = {
  title: {
    bn: "বিনিয়োগকারী পোর্টালে আপনাকে স্বাগতম",
    en: "Welcome to the Investor Portal",
  },
  tearHere: { bn: "এখানে ছিঁড়ুন", en: "tear here" },
  oneTimeCode: { bn: "এককালীন কোড", en: "One-time code" },
  lastDay: { bn: "শেষ দিন", en: "Last day" },
  onceOnly: {
    bn: "একবারই ব্যবহার করা যায়। ব্যবহারের পর এই অংশটি নষ্ট করে ফেলুন।",
    en: "Once only; destroy it after.",
  },
} as const;

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
}: {
  paper: HandedOverPaper;
  given: GivenCode;
}) => (
  <div className="flex items-center justify-between gap-6">
    <div className="flex flex-col gap-0.5 text-[12px]">
      <p className="font-semibold">
        {paper.investor.name}-এর {LABELS.oneTimeCode.bn}{" "}
        <span className="text-[10px] font-normal text-neutral-500" lang="en">
          {LABELS.oneTimeCode.en}
        </span>
      </p>
      <p className="text-neutral-700">
        {LABELS.lastDay.bn}{" "}
        <span className="text-[10px] text-neutral-500" lang="en">
          {LABELS.lastDay.en}
        </span>
        : {formatDate(new Date(given.expiresAt), "bn", "dateTime")}
      </p>
      <p className="text-[10px] text-neutral-500">
        {LABELS.onceOnly.bn} <span lang="en">{LABELS.onceOnly.en}</span>
      </p>
      <p className="text-[9px] text-neutral-400">{paper.letterhead.name}</p>
    </div>
    <p className="shrink-0 rounded-md border-2 border-neutral-900 px-5 py-2 font-mono text-3xl font-bold tracking-[0.25em] whitespace-nowrap">
      {inFours(given.code)}
    </p>
  </div>
);

/** The steps in, the QR beside them: the address, the join button's own words, their phone, the slip, a password. */
const Steps = ({ phone, own }: { phone: string; own: string | null }) => {
  const steps = [
    <>
      ফোনের ক্যামেরায় পাশের QR কোডটি স্ক্যান করুন, অথবা ব্রাউজারে লিখুন:{" "}
      <span className="font-mono font-semibold break-all">
        {portalAddressTyped(own)}
      </span>
    </>,
    <>“{said("portal.haveCode")}” চাপুন।</>,
    <>
      মোবাইল নম্বর দিন — খামারে আপনার যে নম্বর আছে:{" "}
      <span className="font-semibold whitespace-nowrap">
        {phoneInBangla(phone)}
      </span>
    </>,
    <>নিচের ছেঁড়া স্লিপের কোডটি দিন।</>,
    <>
      নিজের একটি পাসওয়ার্ড বেছে নিন, দুবার লিখুন, তারপর “{said("portal.join")}” চাপুন।
    </>,
    <>পরের বার একই ঠিকানায় শুধু মোবাইল নম্বর আর পাসওয়ার্ড দিলেই হবে — কোড আর লাগবে না।</>,
  ];
  return (
    <div className="mt-5 flex gap-6">
      <ol className="flex flex-1 list-none flex-col gap-2">
        {steps.map((step, index) => (
          // The steps are a fixed list, in the order they are taken.
          // oxlint-disable-next-line react/no-array-index-key
          <li className="flex gap-2" key={index}>
            <span className="w-5 shrink-0 font-bold">
              {formatDigits(index + 1, "bn")}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-center gap-1">
        <Qr size="34mm" value={portalAddress(own)} />
        <span className="text-[10px] text-neutral-500">স্ক্যান করুন</span>
      </div>
    </div>
  );
};

/** «আপনার তথ্য» on the page behind the letter: the notice as the portal's own page reads it. */
const NoticeBehind = ({
  notice,
}: {
  notice: NonNullable<HandedOverPaper["notice"]>;
}) => (
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

/**
 * The Welcome Letter, on one A4 page with the Code Slip torn off its foot and «আপনার তথ্য» on the page behind:
 * letterhead, title and date; what the portal shows and that nothing is signed or paid through it; the steps with the
 * QR beside them; whom to call; that the farm never asks for a password; the standing notice in both languages; and
 * the slip.
 */
export const WelcomeLetter = ({
  paper,
  given,
}: {
  paper: HandedOverPaper;
  given: GivenCode;
}) => (
  <div className="bg-white text-neutral-900" id={HANDED_OVER_ID} lang="bn">
    <section className="flex h-[296mm] flex-col overflow-hidden">
      <div className="flex flex-1 flex-col px-[18mm] pt-[14mm] text-[13px] leading-[1.3rem]">
        <Letterhead letterhead={paper.letterhead} />
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <h1 className="text-lg font-bold">{LABELS.title.bn}</h1>
          <span
            className="text-[11px] tracking-wide text-neutral-500 uppercase"
            lang="en"
          >
            {LABELS.title.en}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          তারিখ: {formatDate(new Date(`${paper.issuedOn}T00:00:00Z`), "bn")}
        </p>

        <p className="mt-4">প্রিয় {paper.investor.name},</p>
        <p className="mt-1">
          আপনি যে ভেঞ্চারগুলোতে আছেন, সেগুলো আজ কেমন চলছে — পশুর ওজন, খরচ, আপনার টাকার
          হিসাব — আর আপনার নিজের কাগজগুলো এখন থেকে নিজের ফোনে দেখতে পারবেন। পোর্টাল শুধু
          দেখার জন্য: এতে কিছু সই হয় না, কোনো টাকা দেওয়া-নেওয়া হয় না।
        </p>

        <Steps own={given.portalOrigin} phone={paper.investor.phone} />

        <div className="mt-5 grid grid-cols-2 gap-4 text-[12px]">
          <div>
            <p className="font-semibold">কোনো সমস্যা হলে ফোন করুন</p>
            <p>
              {paper.farm.name}
              {paper.farm.phone
                ? `: ${timeInDigits(paper.farm.phone, "bn")}`
                : ""}
            </p>
            {paper.farm.address ? (
              <p className="text-neutral-600">{paper.farm.address}</p>
            ) : null}
            <p className="text-neutral-600">
              পাসওয়ার্ড ভুলে গেলে বা ফোন হারালে খামারকে জানান — নতুন কোড দেওয়া হবে, অথবা প্রবেশ
              বন্ধ করা হবে।
            </p>
          </div>
          <div>
            <p className="font-semibold">মনে রাখবেন</p>
            <p className="text-neutral-600">
              খামার কখনো ফোনে, মেসেজে বা অন্য কারও মাধ্যমে আপনার পাসওয়ার্ড চাইবে না। কেউ চাইলে
              দেবেন না, খামারকে জানান।
            </p>
            <p className="text-neutral-600">
              একবার সাইন ইন করলে {formatDigits(PORTAL_SIGN_IN_HOURS, "bn")} ঘণ্টা
              থাকে, তারপর আবার সাইন ইন করতে হয়।
            </p>
            <p className="text-neutral-600">
              খামার আপনার কোন তথ্য কেন রাখে, তা এই চিঠির পেছনের পাতায় লেখা আছে।
            </p>
          </div>
        </div>

        <div className="mt-auto border-t border-neutral-300 pt-2 text-[10px] leading-[0.85rem] text-neutral-600">
          <p className="font-semibold text-neutral-800">
            {translate("bn", "portal.notice")}
          </p>
          <p lang="en">{translate("en", "portal.notice")}</p>
          <p className="pt-1 text-neutral-400">{paper.produced}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 px-[8mm] text-[10px] text-neutral-400">
        <span aria-hidden>✂</span>
        <span className="flex-1 border-t border-dashed border-neutral-400" />
        <span>
          {LABELS.tearHere.bn} · <span lang="en">{LABELS.tearHere.en}</span>
        </span>
        <span className="flex-1 border-t border-dashed border-neutral-400" />
      </div>
      <div className="px-[18mm] pt-3 pb-[12mm]">
        <Slip given={given} paper={paper} />
      </div>
    </section>
    {paper.notice ? <NoticeBehind notice={paper.notice} /> : null}
  </div>
);

/** The Code Slip alone, for every code after the first: cut out along its border. */
export const CodeSlip = ({
  paper,
  given,
}: {
  paper: HandedOverPaper;
  given: GivenCode;
}) => (
  <div className="bg-white text-neutral-900" id={HANDED_OVER_ID} lang="bn">
    <div className="rounded-md border border-dashed border-neutral-500 p-[6mm]">
      <Slip given={given} paper={paper} />
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
