// PROTOTYPE — Variant C: হিসাব নিকাশ — the settlement statement, and the only place profit is ever stated.
import {
  INVESTOR,
  SETTLEMENT as S,
  VENTURE,
  bn,
  charged,
  farmProfit,
  investorsProfit,
  perUnitPayout,
  perUnitProfit,
  proceeds,
  profit,
  rounding,
  taka,
} from "./investor-statement-data";
import { Field, Row, Sheet, Signatures } from "./investor-statement-shared";

export const name = "হিসাব নিকাশ (settlement)";

export const Settlement = () => {
  const yours = perUnitPayout * INVESTOR.units;
  return (
    <Sheet title="চূড়ান্ত হিসাব নিকাশ" titleEn="Settlement statement">
      <section className="mt-3">
        <Field label="বিনিয়োগকারী" labelEn="Investor" value={INVESTOR.name} />
        <Field
          label="ভেঞ্চার"
          labelEn="Venture"
          value={`${VENTURE.name} · ${VENTURE.opened} – ${S.approvedOn}`}
        />
        <Field
          label="আপনার ইউনিট"
          labelEn="Units held"
          value={`${bn(INVESTOR.units)} / ${bn(VENTURE.units)}`}
        />
        <Field
          label="গরুর হিসাব"
          labelEn="Animals"
          value={`বিক্রি ${bn(S.soldHead)} · খামার কিনেছে ${bn(S.boughtBackHead)} · মারা গেছে ${bn(S.diedHead)}`}
        />
      </section>

      <section className="mt-4">
        <h3 className="font-bold">ভেঞ্চারের হিসাব · The Venture&apos;s account</h3>
        <Row label="গরু বিক্রি" labelEn="Sales" value={taka(S.sales)} indent />
        <Row
          label="খামারের কেনা (ওজন-দরে)"
          labelEn="Internal Sale"
          value={taka(S.internalSale)}
          indent
        />
        <Row
          label="মোট আয়"
          labelEn="Proceeds"
          value={taka(proceeds)}
          rule
          bold
        />

        <div className="mt-3" />
        <Row label="গরু কেনা" labelEn="Cattle" value={taka(S.cattle)} indent />
        <Row label="হাসিল" labelEn="Hasil" value={taka(S.hasil)} indent />
        <Row
          label="কেনার যাত্রা"
          labelEn="Buying Trips"
          value={taka(S.buyingTrips)}
          indent
        />
        <Row label="খাদ্য" labelEn="Feed" value={taka(S.feed)} indent />
        <Row label="ওষুধের ডোজ" labelEn="Doses" value={taka(S.doses)} indent />
        <Row
          label="পশুচিকিৎসকের ফি"
          labelEn="Vet Fees"
          value={taka(S.vet)}
          indent
        />
        <Row
          label="পালের খরচের ভাগ"
          labelEn="Herd Costs"
          value={taka(S.herdCosts)}
          indent
        />
        <Row
          label="বিক্রির যাত্রা"
          labelEn="Selling Trips"
          value={taka(S.sellingTrips)}
          indent
        />
        <Row
          label="মোট খরচ"
          labelEn="Charged to the Venture"
          value={taka(charged)}
          rule
          bold
        />

        <div className="mt-3" />
        <Row
          label="লাভ"
          labelEn="Profit (proceeds − charges)"
          value={taka(profit)}
          rule
          bold
        />
        <p className="mt-1 text-[10px] text-neutral-500">
          খামারের শেড, কর্মীর বেতন, বিদ্যুৎ ও পানির খরচ এই হিসাবে নেই — তা খামার নিজে বহন
          করেছে।
        </p>
      </section>

      <section className="mt-4 bg-neutral-50 p-3">
        <h3 className="font-bold">ভাগ · The split</h3>
        <Row
          label={`বিনিয়োগকারীরা ${bn(VENTURE.splitInvestors)}%`}
          labelEn="Investors"
          value={taka(investorsProfit)}
        />
        <Row
          label={`খামার ${bn(VENTURE.splitFarm)}%`}
          labelEn="Farm"
          value={taka(farmProfit - rounding)}
        />
        <Row
          label="প্রতি ইউনিটে লাভ"
          labelEn="Profit per Unit"
          value={taka(perUnitProfit)}
          indent
        />
        <Row
          label="ভাঙতি (খামারের অংশে গেছে)"
          labelEn="Rounding to the Farm"
          value={taka(rounding)}
          indent
        />
      </section>

      <section className="mt-4">
        <h3 className="font-bold">আপনার প্রাপ্য · Your payout</h3>
        <Row
          label="মূলধন ফেরত"
          labelEn="Capital returned"
          value={taka(VENTURE.unitPrice * INVESTOR.units)}
        />
        <Row
          label={`লাভ (${bn(INVESTOR.units)} ইউনিট)`}
          labelEn="Your profit"
          value={taka(perUnitProfit * INVESTOR.units)}
        />
        <Row label="মোট" labelEn="Paid to you" value={taka(yours)} rule bold />
        <Field
          label="পরিশোধের মাধ্যম"
          labelEn="Paid by"
          value={`ব্যাংক ট্রান্সফার · ${INVESTOR.bank}`}
        />
        <Field
          label="ব্যাংক রেফারেন্স"
          labelEn="Bank reference"
          value="IBBL/TRF/2027/119345"
        />
      </section>

      <section className="mt-4 text-[11px] text-neutral-600">
        মালিকের দেওয়া অগ্রিম {taka(S.advanceRepaid)} চলতি খরচে ব্যবহৃত হয়েছিল এবং লাভ
        ভাগের আগে ঠিক যত টাকা, ততই ফেরত নেওয়া হয়েছে — এর উপর কোনো মুনাফা বা চার্জ নেই।
        হিসাব অনুমোদনের তারিখ {S.approvedOn}; এরপর কোনো সংশোধন এলে তা আলাদা সংশোধনী
        হিসাবে জানানো হবে।
      </section>

      <Signatures left="বিনিয়োগকারীর প্রাপ্তি স্বীকার" right="খামার মালিকের স্বাক্ষর" />
    </Sheet>
  );
};
