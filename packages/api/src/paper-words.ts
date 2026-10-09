import type {
  DoseOnPaper,
  PassportFacts,
  WithdrawalStanding,
  WithdrawalView,
} from "@OpenFarm/domain";
import { farmDayOf, withdrawalEndsAt } from "@OpenFarm/domain";

import type { HerPenSpell } from "./animal-record";
import { meatDaysOf } from "./health-store";

// What a paper about her is made from. The record keeps instants and rows; a paper is read by a buyer or a slaughter
// vet in either language, so it is handed farm days and kinds here, and says them itself (domain animal-papers.ts).

/** Whether her meat may be sold today and from which day if not, and whether a Vet cut the hold short. */
export const herWithdrawalStanding = (
  view: WithdrawalView
): WithdrawalStanding => ({
  clear: !view.underMeatWithdrawal,
  clearOn: view.meatWithdrawalUntil
    ? farmDayOf(view.meatWithdrawalUntil)
    : null,
  shortened: view.shortened
    ? {
        on: farmDayOf(view.shortened.at),
        reason: view.shortened.reason,
        wouldHaveRunTo: view.shortened.wasMeatUntil
          ? farmDayOf(view.shortened.wasMeatUntil)
          : null,
      }
    : null,
});

/** Where she came from: bought, and from whom where the farm wrote it down, or nothing for one born here — what the
 *  farm says of her, not how the Move that brought her in was written; an animal bought before the farm kept records
 *  was bought all the same. */
export const boughtFromOf = (her: {
  source: string;
  intake: { seller: { name: string } | null } | null;
}): PassportFacts["boughtFrom"] =>
  her.source === "bought" ? { seller: her.intake?.seller?.name ?? null } : null;

/** The ways out a paper says beside the day, all but a Sale — whose paper says where she went instead (CONTEXT:
 *  Exit). */
const LEFT_BY = new Set(["died", "culled", "lost"] as const);

/** How she left and the day, for any way out but a Sale; nothing while she is here. */
export const leftOf = (
  exit: { how: string; at: Date } | null
): PassportFacts["left"] => {
  const how = [...LEFT_BY].find((one) => one === exit?.how);
  return exit && how ? { how, on: farmDayOf(exit.at) } : null;
};

/** Her Pen Spells as a paper prints them: newest first, the way she is read back. */
export const penSpellsOf = (
  spells: readonly HerPenSpell[]
): PassportFacts["pens"] =>
  spells.toReversed().map((spell) => ({
    penName: spell.pen.name,
    from: farmDayOf(spell.from),
    until: spell.until ? farmDayOf(spell.until) : null,
  }));

/** One dose, as either paper reports it. */
export const doseOnPaper = (dose: {
  givenAt: Date;
  /** The days kept on the dose when it was given, which the gate reads (health-store's `meatDaysOf`). */
  meatWithdrawalDays: number | null;
  /** Who advised a dose given without a Prescription, and why; nothing for the others. */
  advice: string | null;
  /** The work it was given under: nothing for a dose not prescribed, which no work asked for. */
  instanceId: string | null;
  product: {
    nameBn: string;
    nameEn: string | null;
    meatWithdrawalDays: number | null;
  };
  giver: { name: string } | null;
  prescription: { vet: { name: string } | null } | null;
}): DoseOnPaper => {
  // What this dose alone held her for, which is not the same as what she is held for today: a Vet may have cut the hold
  // short, and the papers say so where they say she is clear. Read as the gate reads it — the days kept on the dose — so
  // a product's days lowered since cannot make the paper say clear where the gate says held.
  const days = meatDaysOf(dose);
  return {
    product: {
      bn: dose.product.nameBn,
      en: dose.product.nameEn?.trim() || dose.product.nameBn,
    },
    givenOn: farmDayOf(dose.givenAt),
    meatClearOn: days ? farmDayOf(withdrawalEndsAt(dose.givenAt, days)) : null,
    prescribedBy: dose.prescription?.vet?.name ?? null,
    advice: dose.instanceId === null ? (dose.advice ?? "") : null,
    givenBy: dose.giver?.name ?? null,
  };
};
