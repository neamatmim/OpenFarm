// PROTOTYPE — Variant B: অগ্রগতি — where the Venture stands, sent while it runs.
import {
  INVESTOR,
  PROGRESS,
  VENTURE,
  bn,
  taka,
} from "./investor-statement-data";
import { Field, Row, Sheet } from "./investor-statement-shared";

export const name = "অগ্রগতি (progress)";

const spent =
  PROGRESS.spent.cattle +
  PROGRESS.spent.feed +
  PROGRESS.spent.medicine +
  PROGRESS.spent.other;

export const Progress = () => (
  <Sheet title="ভেঞ্চারের অগ্রগতি" titleEn="Venture progress statement">
    <section className="mt-3">
      <Field label="বিনিয়োগকারী" labelEn="Investor" value={INVESTOR.name} />
      <Field
        label="ভেঞ্চার"
        labelEn="Venture"
        value={`${VENTURE.name} · শুরু ${VENTURE.opened}`}
      />
      <Field
        label="আপনার অংশ"
        labelEn="Your share"
        value={`${bn(INVESTOR.units)} / ${bn(VENTURE.units)} ইউনিট (${bn(
          Math.round((INVESTOR.units / VENTURE.units) * 100)
        )}%) · মূলধন ${taka(INVESTOR.paid)}`}
      />
      <Field label="হিসাবের তারিখ" labelEn="As of" value={PROGRESS.asOf} />
    </section>

    <section className="mt-4 grid grid-cols-4 gap-3 text-center">
      {[
        {
          k: "গরু আছে",
          v: bn(PROGRESS.alive),
          s: `মারা গেছে ${bn(PROGRESS.died)}`,
        },
        {
          k: "গড় ওজন",
          v: `${bn(PROGRESS.avgNowKg)} কেজি`,
          s: `শুরুতে ${bn(PROGRESS.avgIntakeKg)} কেজি`,
        },
        {
          k: "দৈনিক বৃদ্ধি",
          v: `${bn(PROGRESS.adg * 1000)} গ্রাম`,
          s: `${bn(PROGRESS.daysOnFeed)} দিন খাওয়ানো`,
        },
        {
          k: "বিক্রির সময়",
          v: `${bn(PROGRESS.daysToWindow)} দিন বাকি`,
          s: VENTURE.window.split(" (")[0],
        },
      ].map((t) => (
        <div key={t.k} className="border border-neutral-300 p-2">
          <div className="text-[10px] text-neutral-500">{t.k}</div>
          <div className="text-base font-bold">{t.v}</div>
          <div className="text-[10px] text-neutral-500">{t.s}</div>
        </div>
      ))}
    </section>

    <section className="mt-5">
      <h3 className="font-bold">খরচ · Spend against the plan</h3>
      <Row
        label="গরু কেনা"
        labelEn="Cattle"
        value={taka(PROGRESS.spent.cattle)}
        indent
      />
      <Row
        label="খাদ্য"
        labelEn="Feed"
        value={taka(PROGRESS.spent.feed)}
        indent
      />
      <Row
        label="ওষুধ ও পশুচিকিৎসা"
        labelEn="Medicine & vet"
        value={taka(PROGRESS.spent.medicine)}
        indent
      />
      <Row
        label="অন্যান্য (হাসিল, পরিবহন, পালের খরচ)"
        labelEn="Hasil, trips, herd costs"
        value={taka(PROGRESS.spent.other)}
        indent
      />
      <Row
        label="মোট খরচ"
        labelEn="Spent so far"
        value={taka(spent)}
        rule
        bold
      />
      <Row label="মোট মূলধন" labelEn="Capital" value={taka(VENTURE.capital)} />
      <Row
        label="বাকি আছে"
        labelEn="Left in the Venture Account"
        value={taka(VENTURE.capital - spent)}
        bold
      />
      <p className="mt-1 text-[10px] text-neutral-500">
        গরুর বাজেট {taka(VENTURE.cattleBudget)} · চলতি বাজেট{" "}
        {taka(VENTURE.runningBudget)} (অব্যবহৃত গরুর বাজেট চলতি বাজেটে যুক্ত হয়েছে)
      </p>
    </section>

    <section className="mt-5">
      <h3 className="font-bold">
        গরুগুলো · The Animals{" "}
        <span className="text-[10px] font-normal text-neutral-500">
          (প্রথম ৬টি দেখানো হলো)
        </span>
      </h3>
      <table className="mt-1 w-full text-[12px]">
        <thead className="border-b border-neutral-400 text-left text-[10px] text-neutral-500 uppercase">
          <tr>
            <th className="py-1">ট্যাগ</th>
            <th>ছবি</th>
            <th className="text-right">আগমনে</th>
            <th className="text-right">এখন</th>
            <th className="text-right">দৈনিক বৃদ্ধি</th>
          </tr>
        </thead>
        <tbody>
          {PROGRESS.animals.map((a) => (
            <tr key={a.tag} className="border-b border-neutral-200">
              <td className="py-1 font-medium">{a.tag}</td>
              <td className="text-[10px] text-neutral-400">[ছবি]</td>
              <td className="text-right tabular-nums">{bn(a.intakeKg)} কেজি</td>
              <td className="text-right tabular-nums">{bn(a.nowKg)} কেজি</td>
              <td className="text-right tabular-nums">
                {bn(a.adg * 1000)} গ্রাম
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <p className="mt-4 text-[11px] text-neutral-600">
      প্রতিটি গরুর সর্বশেষ ছবি সঙ্গে দেওয়া আছে। এই কাগজ প্রতি মাসে, এবং কেনা শেষ হলে,
      প্রথম বিক্রির পর ও গুটিয়ে আনার সময় শুরু হলে পাঠানো হয়। এখানে দেওয়া ওজন ও দিনের হিসাব
      খামারের রেকর্ড থেকে নেওয়া। ভবিষ্যতের দাম বা লাভের কোনো হিসাব দেওয়া হয়নি — বিক্রির আগে
      তা জানার উপায় নেই।
    </p>
  </Sheet>
);
