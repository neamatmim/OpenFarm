import { and, eq } from "@OpenFarm/db/operators";
import { fatteningJoining, internalSale } from "@OpenFarm/db/schema/fattening";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import { farmDayOf, priceAtWeight, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import { assertCattleBudgetHolds, readInternalSale } from "../venture-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const refuse = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

const loadSale = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.internalSale.findFirst({ where: { id, farmId } });
  if (!row) {
    return row;
  }
  const sides = await tx.query.ventureMovement.findMany({
    where: { farmId, internalSaleId: id },
    columns: { id: true, ventureId: true, kind: true, reference: true },
  });
  // Between two purses there is a movement on each Venture's side; one made good, after an animal written off as Lost
  // was found, has none: she was made good at what she had cost the Venture, which no rate prices.
  if (sides.length === 0) {
    throw refuse(
      "She was made good at what she had cost the Venture; there is no rate to put right",
      "made_good_not_priced"
    );
  }
  const ventures = [row.fromVentureId, row.toVentureId].filter(
    (one): one is string => one !== null
  );
  const approved = await tx.query.ventureSettlement.findFirst({
    where: { farmId, ventureId: { in: ventures } },
    columns: { id: true },
  });
  // Every Investor on either side was paid on what she was sold at.
  if (approved) {
    throw refuse(
      "A Settlement has been approved on figures this sale is part of; raise a Settlement Adjustment instead",
      "settlement_approved"
    );
  }
  return { ...row, sides };
};

type SaleRow = NonNullable<Awaited<ReturnType<typeof loadSale>>>;

/** What putting an Internal Sale right may change: the rate the Owner typed, the day she changed hands, and the
 *  reference the money moved on. The weight is the reading she was priced from, and stays it. */
export const internalSaleCorrectionInput = correctionInput({
  rateMoneyPerKg: changeOf(z.number().positive().max(100_000), z.number()),
  soldOn: changeOf(farmDay, z.string()),
  reference: changeOf(z.string().trim().min(1).max(120), z.string()),
});

/**
 * An Internal Sale put right — the discretionary one, and the buy-back at wind-up alike — by the Owner, until either
 * side's Settlement is approved: a rate typed ৳3,50 for ৳350 a kilo moved the Investors' money and could not be undone.
 * Its price follows the rate at the weight it was struck at, and every record of it moves together: both Venture sides,
 * the Farm's Money Event, and the price the Farm took her on at, so no two purses disagree about one sale.
 */
export const internalSaleCorrection: CorrectionKind<
  SaleRow,
  z.infer<typeof internalSaleCorrectionInput>["changes"]
> = {
  entity: "internal_sale",
  table: internalSale,
  roles: ["owner"],
  missing: "No such sale",
  load: loadSale,
  // The Owner's window is open-ended; the Settlement is what closes this.
  entry: null,
  shown: (_tx, row) =>
    Promise.resolve({
      rateMoneyPerKg: Number(row.rateMoneyPerKg),
      soldOn: row.soldOn,
      reference: row.sides[0]?.reference ?? "",
    }),
  trail: (tx, row) => readInternalSale(tx, row.farmId, row.id),
  apply: async (tx, row, to, { now }) => {
    const soldOn = to.soldOn ?? row.soldOn;
    if (soldOn > farmDayOf(now)) {
      throw refuse(
        "She cannot change hands on a day that has not come yet",
        "sold_in_the_future"
      );
    }
    const rate = to.rateMoneyPerKg ?? Number(row.rateMoneyPerKg);
    const priceMoney = priceAtWeight(Number(row.weightKg), rate);
    const more = priceMoney - row.priceMoney;
    if (more > 0 && row.toVentureId) {
      // A buyer pays the rest out of what it holds for cattle, as it paid the first.
      const buyer = await tx.query.venture.findFirst({
        where: { id: row.toVentureId, farmId: row.farmId },
      });
      if (buyer) {
        await assertCattleBudgetHolds(tx, row.farmId, buyer, more);
      }
    }
    const putRight = {
      ...(to.rateMoneyPerKg === undefined
        ? {}
        : { rateMoneyPerKg: rate.toFixed(2), priceMoney }),
      ...(to.soldOn === undefined ? {} : { soldOn }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(internalSale)
        .set(putRight)
        .where(eq(internalSale.id, row.id));
    }
    const sides = {
      amountMoney: priceMoney,
      movedOn: soldOn,
      ...(to.reference === undefined ? {} : { reference: to.reference }),
    };
    await tx
      .update(ventureMovement)
      .set(sides)
      .where(
        and(
          eq(ventureMovement.farmId, row.farmId),
          eq(ventureMovement.internalSaleId, row.id)
        )
      );
    await tx
      .update(moneyEvent)
      .set({
        amountMoney: priceMoney,
        occurredAt: startOfFarmDay(soldOn),
        ...(to.reference === undefined ? {} : { reference: to.reference }),
      })
      .where(
        and(eq(moneyEvent.farmId, row.farmId), eq(moneyEvent.sourceId, row.id))
      );
    if (to.rateMoneyPerKg !== undefined) {
      await tx
        .update(fatteningJoining)
        .set({ priceMoney, rateMoneyPerKg: rate.toFixed(2) })
        .where(eq(fatteningJoining.internalSaleId, row.id));
    }
  },
};
