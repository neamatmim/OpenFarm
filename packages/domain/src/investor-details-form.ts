import type { FarmIdentity } from "./farm";
import { MOST_NOMINEES, RELATION_WORDS } from "./nominees";
import type { FormBlank, PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { Said } from "./papers";

/**
 * The Investor Details Form, «বিনিয়োগকারীর তথ্য ফর্ম»: a blank paper the Owner fills in with somebody at the first
 * meeting, from their NID and bank papers, and types into the app afterwards from the sheet. Its parts are the
 * record sheet's parts and its lines the sheet's boxes, in the same order, each named for the box it is typed into —
 * so the paper can be held to the screen by a test, and a box added to one without the other is caught. Nothing is
 * signed on it: the papers an Investor signs are the Portal Consent and the Agreement (ADR 0022).
 */

/** The parts of the form, by their headings, for whoever holds the paper to the screen. */
export const DETAILS_FORM_PARTS = {
  who: { bn: "কে যোগ দিচ্ছেন", en: "Who is joining" },
  person: { bn: "পরিচয় — একজন ব্যক্তি হলে", en: "Who they are — a person" },
  organization: {
    bn: "প্রতিষ্ঠান — একটি প্রতিষ্ঠান হলে",
    en: "The organization — an organization",
  },
  signatory: { bn: "প্রতিষ্ঠানের স্বাক্ষরকারী", en: "Its signatory" },
  money: { bn: "টাকা কোথায় যাবে", en: "Where their money goes" },
  nominee: { bn: "নমিনি", en: "Nominee" },
  farm: { bn: "খামারের জন্য", en: "For the farm" },
} as const satisfies Record<string, Said>;

const blank = (
  name: string,
  bn: string,
  en: string,
  more: Omit<FormBlank, "name" | "label"> = {}
): FormBlank => ({ name, label: { bn, en }, ...more });

const hint = (bn: string, en: string): Said => ({ bn, en });

const OPTIONAL = hint("থাকলে", "if they have one");

const ADDRESS = blank("address", "ঠিকানা", "Address", { tall: true, wide: true });

/** The usual relations, as the screen offers them, so the one writing by hand uses the same words. */
const RELATIONS_SAID: Said = {
  bn: `${Object.values(RELATION_WORDS)
    .map((word) => word.bn)
    .join(", ")} — অথবা কথায়`,
  en: `${Object.values(RELATION_WORDS)
    .map((word) => word.en)
    .join(", ")} — or in words`,
};

const part = (
  heading: Said,
  blanks: FormBlank[],
  note: Said | null = null
): PaperSection => ({ kind: "blanks", heading, blanks, note });

/** A Nominee's place in its own numerals. */
const NUMERALS_BN = ["০", "১", "২", "৩"];

/** One Nominee's lines, the Receiver's beneath them for one under eighteen. */
const nomineePart = (place: number): PaperSection =>
  part(
    {
      bn: `${DETAILS_FORM_PARTS.nominee.bn} ${NUMERALS_BN[place] ?? place}`,
      en: `${DETAILS_FORM_PARTS.nominee.en} ${place}`,
    },
    [
      blank("name", "নাম", "Name"),
      blank("relation", "তাঁর সঙ্গে সম্পর্ক", "Relation to them", {
        hint: RELATIONS_SAID,
      }),
      blank("bornOn", "জন্মতারিখ", "Date of birth"),
      blank(
        "idNumber",
        "এনআইডি নম্বর — আঠারোর কম হলে জন্ম নিবন্ধন নম্বর",
        "NID number — under eighteen, the birth registration number"
      ),
      blank("phone", "ফোন", "Phone"),
      blank("share", "অংশ (%)", "Share (%)"),
      blank(
        "receiverName",
        "আঠারোর কম হলে: গ্রহণকারীর নাম",
        "Under eighteen: Receiver's name",
        { hint: hint("তাঁর হয়ে যিনি সংগ্রহ করবেন", "who collects for them") }
      ),
      blank("receiverRelation", "নমিনির সঙ্গে সম্পর্ক", "Relation to the Nominee"),
      blank("receiverPhone", "গ্রহণকারীর ফোন", "Receiver's phone"),
      blank("receiverNid", "গ্রহণকারীর এনআইডি নম্বর", "Receiver's NID number"),
    ]
  );

export const investorDetailsForm = ({
  farm,
  produced,
}: {
  farm: FarmIdentity;
  /** When and by whom it was printed, in both languages. */
  produced: Said;
}): PaperDocument => ({
  letterhead: letterheadOf(farm),
  title: { bn: "বিনিয়োগকারীর তথ্য ফর্ম", en: "Investor details form" },
  preamble: {
    bn: "প্রথম সাক্ষাতে বিনিয়োগকারীর সঙ্গে বসে, তাঁর এনআইডি ও ব্যাংকের কাগজ দেখে এই ফর্মটি পূরণ করুন। খামার এই কাগজ থেকেই, একই ক্রমে, তথ্যগুলো অ্যাপে লেখে। একজন ব্যক্তি হলে পরিচয়ের অংশ, একটি প্রতিষ্ঠান হলে প্রতিষ্ঠান ও স্বাক্ষরকারীর অংশ পূরণ করুন; টাকার অংশ সবার। নমিনি শুধু ব্যক্তির — একজনও না, বা তিনজন পর্যন্ত, অংশ মিলে একশো।",
    en: "Fill this in with the Investor at the first meeting, from their NID and bank papers. The farm types it into the app from this sheet, in the same order. A person fills the part for who they are; an organization the parts for the organization and its signatory; the part for their money is everyone's. Nominees are a person's only — none, or up to three, their shares adding to a hundred.",
  },
  sections: [
    part(DETAILS_FORM_PARTS.who, [
      blank(
        "kind",
        "একজন ব্যক্তি, না একটি প্রতিষ্ঠান",
        "A person, or an organization",
        {
          hint: hint("একবারই বাছাই হয়, পরে বদলায় না", "chosen once, never changed"),
          wide: true,
        }
      ),
    ]),
    part(DETAILS_FORM_PARTS.person, [
      blank("name", "নাম", "Name", { wide: true }),
      blank("phone", "ফোন", "Phone"),
      blank("email", "ইমেইল", "Email", { hint: OPTIONAL }),
      blank("nid", "এনআইডি নম্বর", "NID number"),
      ADDRESS,
    ]),
    part(DETAILS_FORM_PARTS.organization, [
      blank("name", "প্রতিষ্ঠানের নাম", "Organization's name", { wide: true }),
      blank("tradeLicense", "ট্রেড লাইসেন্স নম্বর", "Trade license number"),
      blank("rjscNumber", "আরজেএসসি নিবন্ধন নম্বর", "RJSC registration number"),
      blank("tin", "টিআইএন", "TIN"),
      ADDRESS,
    ]),
    part(DETAILS_FORM_PARTS.signatory, [
      blank("signatoryName", "স্বাক্ষরকারীর নাম", "Signatory's name", {
        wide: true,
      }),
      blank("signatoryRole", "পদবি", "Their role", {
        hint: hint(
          "ব্যবস্থাপনা পরিচালক, স্বত্বাধিকারী, অংশীদার",
          "Managing Director, Proprietor, Partner"
        ),
      }),
      blank("phone", "স্বাক্ষরকারীর মোবাইল", "Signatory's mobile"),
      blank("email", "স্বাক্ষরকারীর ইমেইল", "Signatory's email", {
        hint: OPTIONAL,
      }),
      blank("signatoryNid", "স্বাক্ষরকারীর এনআইডি নম্বর", "Signatory's NID number"),
      blank(
        "authority",
        "যে কাগজে তাঁকে ক্ষমতা দেওয়া হয়েছে",
        "The paper that names them",
        {
          hint: hint(
            "পরিচালনা পর্ষদের সিদ্ধান্ত, ক্ষমতাপত্র",
            "Board resolution, letter of authority"
          ),
        }
      ),
      blank("authorityOn", "কাগজের তারিখ", "Dated"),
    ]),
    part(DETAILS_FORM_PARTS.money, [
      blank("bankAccount", "ব্যাংক হিসাব", "Bank account", {
        hint: hint(
          "হিসাবের নাম, হিসাব নম্বর, ব্যাংক ও শাখা",
          "Account name, account number, bank and branch"
        ),
        tall: true,
        wide: true,
      }),
    ]),
    ...Array.from({ length: MOST_NOMINEES }, (_, at) => nomineePart(at + 1)),
    part(
      DETAILS_FORM_PARTS.farm,
      [
        blank(
          "checkedBy",
          "এনআইডি মিলিয়ে দেখেছেন",
          "Checked against the NID by"
        ),
        blank("checkedOn", "তারিখ", "On"),
      ],
      {
        bn: "এই কাগজে কিছু সই হয় না। বিনিয়োগকারী যা সই করেন তা পোর্টাল সম্মতিপত্র ও চুক্তি।",
        en: "Nothing is signed on this sheet. What the Investor signs is the Portal Consent and the Agreement.",
      }
    ),
  ],
  closing: [],
  produced,
});
