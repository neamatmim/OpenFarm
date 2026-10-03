// What the parts of the Venture router share: their inputs, their refusals and the acts more than one of them does.

import { CAPITAL_PAID } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { audited } from "../../audit";
import { farmDay } from "../../farm-clock";

/** Taka. A Venture is planned in lakhs; the column keeps poisha so the money can be added up. */
export const money = z.number().min(0).max(1_000_000_000);

export const openInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    targetCapitalBdt: money,
    /** The least capital this is worth starting on. The farm's own percentage unless the Owner says. */
    floorBdt: money.optional(),
    /** The day the Floor must be met by. */
    decideBy: farmDay,
    targetWindowStart: farmDay,
    targetWindowEnd: farmDay,
    unitPriceBdt: money,
    /** How many Units there are. As many as the unit price divides the capital into, unless the Owner
     *  says otherwise: a Venture may leave Units unsold and take less than it hoped. */
    units: z.number().int().min(1).max(10_000).optional(),
    /** The part of the capital meant for buying animals; the rest keeps them. The farm's own share
     *  unless the Owner says. */
    cattleBudgetBdt: money.optional(),
    /** How its Investors pay: all before buying (as every Venture before it), or the Cattle Part first and the rest in
     *  Monthly Sums, worked from its budgets and dates. */
    capitalPaid: z.enum(CAPITAL_PAID).optional(),
  })
  .refine((one) => one.targetWindowStart <= one.targetWindowEnd, {
    message: "A Target Window needs its days in order",
  });

/** The plan as it stands once the farm's own parameters have filled in what the Owner did not say. */
export const planned = (
  input: z.infer<typeof openInput>,
  settings: { ventureFloorPercent: number; ventureRunningPercent: number }
) => ({
  floorBdt:
    input.floorBdt ??
    Math.round((input.targetCapitalBdt * settings.ventureFloorPercent) / 100),
  units:
    input.units ??
    Math.max(1, Math.round(input.targetCapitalBdt / input.unitPriceBdt)),
  cattleBudgetBdt:
    input.cattleBudgetBdt ??
    Math.round(
      (input.targetCapitalBdt * (100 - settings.ventureRunningPercent)) / 100
    ),
});

/** The context a gated handler has: the Role is settled and the Farm is certain. */
export type Context = Parameters<typeof audited>[0] & { farm: { id: string } };

/** Every movement of a Venture's money is by bank: a Venture Account is not a cash gate. */
export const assertByBank = (paymentMethod: string) => {
  if (paymentMethod !== "bank") {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture Account moves money by bank only",
      data: { refusal: "capital_must_be_by_bank" },
    });
  }
};

/** This Farm's Investor, or nothing the caller may sign for. Without this, another Farm's Investor could
 *  be signed onto our Venture: they would count against our cap and never appear on our own list. */
export const theirs = async (context: Context, id: string) => {
  const row = await context.db.query.investor.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  return row;
};

/** A line of a Reimbursement with the name of the thing it was, in both languages the farm keeps. */
export const named = (
  lines: readonly { id: string; bdt: number }[],
  names: Map<string, { bn: string; en: string | null }>
) =>
  lines.map((line) => ({
    ...line,
    nameBn: names.get(line.id)?.bn ?? "",
    nameEn: names.get(line.id)?.en ?? null,
  }));
