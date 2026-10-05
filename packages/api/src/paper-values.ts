import type {
  FarmIdentity,
  FieldValues,
  MonthlySum,
  PaperInvestor,
  PaperNominee,
  Said,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { DataKeepers } from "./data-keepers";
import { theFarmsShare } from "./investor-store";

/** A figure in each language's own numerals. */
const figure = (value: number): Said => ({
  bn: formatNumber(value, "bn"),
  en: formatNumber(value, "en"),
});

/** A farm day as each language writes a date. */
const day = (farmDay: string): Said => {
  const at = new Date(`${farmDay}T00:00:00Z`);
  return { bn: formatDate(at, "bn", "date"), en: formatDate(at, "en", "date") };
};

/** Words that read the same in both languages: a name, an address, a reason in the Owner's own words. */
const same = (text: string | null | undefined): Said | undefined =>
  text?.trim() ? { bn: text, en: text } : undefined;

/** What a paper may say, before it is filled in: each fact the farm has for it, as the domain holds it. */
export interface PaperFacts {
  farm: FarmIdentity;
  ownerName: string;
  /** Who runs the server and keeps the backup, where the privacy notice names them. */
  keepers?: DataKeepers;
  him?: PaperInvestor;
  ventureName?: string;
  units?: number;
  unitPriceMoney?: number;
  investorsPercent?: number;
  windowStart?: string;
  windowEnd?: string;
  windUpDays?: number;
  arbitrator?: string;
  amendedOn?: string;
  reason?: string;
  /** Paid by the month: each Unit's Cattle Part and its Monthly Sums, as the Venture froze them. */
  monthly?: { cattlePartMoney: number; sums: readonly MonthlySum[] } | null;
  /** The Farm's own Units in the Venture, and all its Units, where the Farm holds some with its own money. */
  farmCapital?: { farmUnits: number; ventureUnits: number } | null;
}

/**
 * How many Monthly Sums there are, and — where the division left the last different — what the last is, as the
 * Agreement's row says it in brackets: "(৪ মাস)", or "(৬ মাস; শেষ মাসে ২,০৮৫ টাকা)".
 */
const sumsSaid = (sums: readonly MonthlySum[]): Said | undefined => {
  const [first] = sums;
  const last = sums.at(-1);
  if (!(first && last)) {
    return undefined;
  }
  const lastDiffers = last.amount !== first.amount;
  return {
    bn: `${formatNumber(sums.length, "bn")} মাস${lastDiffers ? `; শেষ মাসে ${formatNumber(last.amount, "bn")} টাকা` : ""}`,
    en: `${formatNumber(sums.length, "en")} months${lastDiffers ? `; the last ৳${formatNumber(last.amount, "en")}` : ""}`,
  };
};

/** The fields of a Venture paid by the month; nothing for any other, whose paper does not ask for them. */
const monthlyValues = (monthly: PaperFacts["monthly"]): FieldValues => {
  const first = monthly?.sums[0];
  const last = monthly?.sums.at(-1);
  if (!(monthly && first && last)) {
    return {};
  }
  return {
    cattlePart: figure(monthly.cattlePartMoney),
    monthlySum: figure(first.amount),
    firstSumDue: day(first.dueOn),
    lastSumDue: day(last.dueOn),
    sums: sumsSaid(monthly.sums),
  };
};

/** How many of the Venture's Units the Farm holds with its own money; nothing where it holds none. */
const farmCapitalValues = (
  farmCapital: PaperFacts["farmCapital"]
): FieldValues =>
  farmCapital
    ? {
        farmUnits: figure(farmCapital.farmUnits),
        ventureUnits: figure(farmCapital.ventureUnits),
      }
    : {};

/**
 * Every field a paper can fill, in both languages, from the facts the farm has: a number in each language's own
 * numerals, a date as each writes it. A fact the farm does not have is left out, and the paper leaves a blank.
 */
export const paperValues = (facts: PaperFacts): FieldValues => {
  const capital =
    facts.units !== undefined && facts.unitPriceMoney !== undefined
      ? facts.units * facts.unitPriceMoney
      : undefined;
  const values: FieldValues = {
    farmName: same(facts.farm.name),
    farmAddress: same(facts.farm.address),
    farmRegistration: same(facts.farm.registrationNumber),
    farmPhone: same(facts.farm.phone),
    ownerName: same(facts.ownerName),
    dataHost: same(facts.keepers?.dataHost),
    backupStore: same(facts.keepers?.backupStore),
    backupCountry: same(facts.keepers?.backupCountry),
    investorName: same(facts.him?.name),
    investorAddress: same(facts.him?.address),
    investorPhone: same(facts.him?.phone),
    investorNid: same(facts.him?.nid),
    ventureName: same(facts.ventureName),
    units: facts.units === undefined ? undefined : figure(facts.units),
    unitPrice:
      facts.unitPriceMoney === undefined
        ? undefined
        : figure(facts.unitPriceMoney),
    capital: capital === undefined ? undefined : figure(capital),
    investorsPercent:
      facts.investorsPercent === undefined
        ? undefined
        : figure(facts.investorsPercent),
    farmPercent:
      facts.investorsPercent === undefined
        ? undefined
        : figure(theFarmsShare(facts.investorsPercent)),
    windowStart: facts.windowStart ? day(facts.windowStart) : undefined,
    windowEnd: facts.windowEnd ? day(facts.windowEnd) : undefined,
    windUpDays:
      facts.windUpDays === undefined ? undefined : figure(facts.windUpDays),
    arbitrator: same(facts.arbitrator),
    amendedOn: facts.amendedOn ? day(facts.amendedOn) : undefined,
    reason: same(facts.reason),
    ...monthlyValues(facts.monthly),
    ...farmCapitalValues(facts.farmCapital),
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
};

/** An Investor row as a paper writes him down, with the Nominees the paper names. */
export const paperInvestor = (
  row: {
    name: string;
    phone: string;
    address: string | null;
    nid: string | null;
  },
  nominees: PaperNominee[]
): PaperInvestor => ({
  name: row.name,
  phone: row.phone,
  address: row.address,
  nid: row.nid,
  nominees,
});

/** When a paper was made, as its reader reads it. */
export const producedAt = (now: Date, language: Language) =>
  formatDate(now, language, "dateTime");
