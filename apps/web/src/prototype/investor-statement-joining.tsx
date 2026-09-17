// PROTOTYPE — Variant A: যোগদানপত্র — what an Investor gets when their capital is received.
import { INVESTOR, VENTURE, bn, taka } from "./investor-statement-data";
import { Field, Row, Sheet, Signatures } from "./investor-statement-shared";

export const name = "যোগদানপত্র (joining)";

export const Joining = () => (
  <Sheet
    title="মূলধন গ্রহণের প্রাপ্তিপত্র"
    titleEn="Acknowledgement of capital received"
  >
    <section className="mt-3">
      <Field label="বিনিয়োগকারী" labelEn="Investor" value={INVESTOR.name} />
      <Field label="ঠিকানা" labelEn="Address" value={INVESTOR.address} />
      <Field
        label="ফোন / এনআইডি"
        labelEn="Phone / NID"
        value={`${INVESTOR.phone} · ${INVESTOR.nid}`}
      />
      <Field label="নমিনি" labelEn="Nominee" value={INVESTOR.nominee} />
    </section>

    <section className="mt-4 bg-neutral-50 p-3">
      <Row
        label="ভেঞ্চার"
        labelEn="Venture"
        value={`${VENTURE.name} · ${VENTURE.nameEn}`}
      />
      <Row
        label="ইউনিটের দাম"
        labelEn="Unit price"
        value={taka(VENTURE.unitPrice)}
      />
      <Row
        label="আপনার ইউনিট"
        labelEn="Units held"
        value={`${bn(INVESTOR.units)} / ${bn(VENTURE.units)}`}
        bold
      />
      <Row
        label="গৃহীত মূলধন"
        labelEn="Capital received"
        value={taka(INVESTOR.paid)}
        bold
      />
      <Row label="গ্রহণের তারিখ" labelEn="Received on" value={INVESTOR.paidOn} />
      <Row
        label="ব্যাংক রেফারেন্স"
        labelEn="Bank reference"
        value={INVESTOR.bankRef}
      />
    </section>

    <section className="mt-4">
      <h3 className="font-bold">চুক্তির সারসংক্ষেপ · Summary of terms</h3>
      <ul className="mt-1 list-disc space-y-[3px] pl-5">
        <li>
          <b>মুদারাবা।</b> বিনিয়োগকারীর মূলধনে গরু, খাদ্য ও ওষুধ কেনা হয়। খামার শেড, কর্মী,
          বিদ্যুৎ ও পানির খরচ নিজে বহন করে।
        </li>
        <li>
          <b>লাভ ভাগ:</b> বিনিয়োগকারীরা {bn(VENTURE.splitInvestors)}% · খামার{" "}
          {bn(VENTURE.splitFarm)}%। মূলধন পুরো ফেরত যাওয়ার পরই লাভ হিসাব হয়।
        </li>
        <li>
          <b>লোকসান</b> মূলধন থেকেই যায়; খামারের ক্ষতি তার শ্রম ও খরচ। অবহেলা প্রমাণ হলে
          খামার সেই ক্ষতি পূরণ করবে।
        </li>
        <li>
          <b>গরু মারা গেলে</b> তা ভেঞ্চারের ক্ষতি — কোনো বিমা নেই, খামার বদলি গরু দেয় না।
        </li>
        <li>
          <b>বিক্রির সময়:</b> {VENTURE.window}; এরপর {bn(VENTURE.windUpDays)}{" "}
          দিনের গুটিয়ে আনার সময়, তারপরও অবিক্রীত থাকলে খামার ওজন-দরে কিনে নেবে।
        </li>
        <li>
          <b>মাঝপথে টাকা ফেরত নেই।</b> মূলধন গরুতে আছে; ইউনিট অন্য বিনিয়োগকারী বা মালিক
          নিতে চাইলে লিখিত সংশোধনীতে হবে।
        </li>
        <li>
          <b>সালিস:</b> {VENTURE.arbitrator}।
        </li>
      </ul>
    </section>

    <section className="mt-4 text-[11px] text-neutral-600">
      স্ট্যাম্পযুক্ত চুক্তিপত্র: মূল্য {taka(INVESTOR.stamp.value)} · তারিখ{" "}
      {INVESTOR.stamp.date} · ক্রমিক {INVESTOR.stamp.serial}. মূল কপি উভয় পক্ষের
      কাছে আছে।
    </section>

    <Signatures left="বিনিয়োগকারীর স্বাক্ষর" right="খামার মালিকের স্বাক্ষর" />
  </Sheet>
);
