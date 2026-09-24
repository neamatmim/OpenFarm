import type {
  FarmIdentity,
  FieldValues,
  PaperInvestor,
  Said,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

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
  him?: PaperInvestor;
  ventureName?: string;
  units?: number;
  unitPriceBdt?: number;
  investorsPercent?: number;
  windowStart?: string;
  windowEnd?: string;
  windUpDays?: number;
  arbitrator?: string;
  amendedOn?: string;
  reason?: string;
}

/**
 * Every field a paper can fill, in both languages, from the facts the farm has: a number in each language's own
 * numerals, a date as each writes it. A fact the farm does not have is left out, and the paper leaves a blank.
 */
export const paperValues = (facts: PaperFacts): FieldValues => {
  const capital =
    facts.units !== undefined && facts.unitPriceBdt !== undefined
      ? facts.units * facts.unitPriceBdt
      : undefined;
  const values: FieldValues = {
    farmName: same(facts.farm.name),
    farmAddress: same(facts.farm.address),
    farmRegistration: same(facts.farm.registrationNumber),
    ownerName: same(facts.ownerName),
    investorName: same(facts.him?.name),
    investorAddress: same(facts.him?.address),
    investorPhone: same(facts.him?.phone),
    investorNid: same(facts.him?.nid),
    ventureName: same(facts.ventureName),
    units: facts.units === undefined ? undefined : figure(facts.units),
    unitPrice:
      facts.unitPriceBdt === undefined ? undefined : figure(facts.unitPriceBdt),
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
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
};

/** An Investor row as a paper writes him down. */
export const paperInvestor = (row: {
  name: string;
  phone: string;
  address: string | null;
  nid: string | null;
  nomineeName: string | null;
  nomineePhone: string | null;
  nomineeRelation: string | null;
}): PaperInvestor => ({
  name: row.name,
  phone: row.phone,
  address: row.address,
  nid: row.nid,
  nominee: row.nomineeName
    ? {
        name: row.nomineeName,
        phone: row.nomineePhone,
        relation: row.nomineeRelation,
      }
    : null,
});

/** When a paper was made, as its reader reads it. */
export const producedAt = (now: Date, language: Language) =>
  formatDate(now, language, "dateTime");
