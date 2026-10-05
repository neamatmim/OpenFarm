import type { Database } from "@OpenFarm/db";
import type { MoneySource } from "@OpenFarm/db/schema/money";
import type {
  MoneyApproval,
  MoneyToSummarise,
  PaymentMethod,
  Side,
  SideShare,
} from "@OpenFarm/domain";
import { penHistoryOf, sidesOverTime } from "@OpenFarm/domain";

import { THE_FARMS_PURSE } from "./money-store";
import { receivableOfBuyers } from "./receivable-store";

type Db = Pick<Database, "query">;

/** One Money Event as the accountant's CSV lists it and the summary adds it up. */
export interface ExportedMoney extends MoneyToSummarise {
  id: string;
  occurredAt: Date;
  paymentMethod: PaymentMethod;
  source: MoneySource;
  sourceId: string;
  /** What the accountant can find the record by: a tag, a delivery note, a Feed Item, a product, a wage's month. */
  reference: string | null;
  /** The bank's or the mobile money provider's own transaction ID, and the Farm Account it moved through: what the
   *  accountant reads the money against the statement by, as the register shows them. Nothing for cash. */
  transactionId: string | null;
  farmAccountName: string | null;
  approval: MoneyApproval;
  note: string | null;
}

/** What a record is known by, and the Sides its money belongs to as fractions of it. */
interface RecordFacts {
  reference: string | null;
  sides: readonly { side: Side | null; part: number }[];
}

const WHOLE_FARM: RecordFacts["sides"] = [{ side: null, part: 1 }];

const idsOf = (
  events: readonly { source: MoneySource; sourceId: string }[],
  source: MoneySource
) => events.filter((one) => one.source === source).map((one) => one.sourceId);

/** An even split of something across these Sides, one part for each. */
const splitAcross = (sides: readonly Side[]): RecordFacts["sides"] =>
  sides.length === 0
    ? WHOLE_FARM
    : sides.map((side) => ({ side, part: 1 / sides.length }));

/** The Receivable Payments among a period's money: each one's kind and what it cleared, and every Sale it cleared, so the
 *  export can say which animals a cattle payment was for and which Side she stood on. */
const receivablePaymentsOf = async (
  db: Db,
  farmId: string,
  ids: readonly string[]
) => {
  if (ids.length === 0) {
    return { payments: [], clearedSaleIds: [] };
  }
  const wanted = new Set(ids);
  const book = await receivableOfBuyers(db, farmId, { settledToo: true });
  const payments = book.flatMap((buyer) =>
    buyer.kinds.flatMap((kind) =>
      kind.payments
        .filter((one) => wanted.has(one.id))
        .map((one) => ({
          id: one.id,
          kind: kind.kind,
          amountMoney: one.amountMoney,
          cleared: one.cleared,
        }))
    )
  );
  return {
    payments,
    clearedSaleIds: payments
      .filter((one) => one.kind === "cattle")
      .flatMap((one) => one.cleared.map((part) => part.itemId)),
  };
};

/**
 * What a Receivable Payment is known by and whose Side its money is. Milk is the Dairy side's, as a Dispatch's is. Cattle
 * money is split across the Sides of the animals it paid for, by what it paid of each, their tags its reference; what
 * it paid beyond anything owed — paid ahead for next time — is the whole farm's until it pays for something.
 */
const receivablePaymentFacts = (
  payment: {
    kind: "cattle" | "milk";
    amountMoney: number;
    cleared: readonly { itemId: string; amountMoney: number }[];
  },
  saleFacts: ReadonlyMap<string, { tagNumber: string; side: Side }>
): RecordFacts => {
  if (payment.kind === "milk") {
    return { reference: null, sides: [{ side: "dairy", part: 1 }] };
  }
  const parts = payment.cleared.flatMap((part) => {
    const sold = saleFacts.get(part.itemId);
    return sold ? [{ ...sold, amountMoney: part.amountMoney }] : [];
  });
  const clearedMoney = parts.reduce((sum, one) => sum + one.amountMoney, 0);
  const ahead = payment.amountMoney - clearedMoney;
  const sides = [
    ...parts.map((one) => ({
      side: one.side,
      part: one.amountMoney / payment.amountMoney,
    })),
    ...(ahead > 0 ? [{ side: null, part: ahead / payment.amountMoney }] : []),
  ];
  return {
    reference:
      parts
        .map((one) => one.tagNumber)
        .toSorted()
        .join(" ") || null,
    sides: sides.length === 0 ? WHOLE_FARM : sides,
  };
};

/**
 * What each record behind these Money Events is known by and which Side its money belongs to, on the day
 * the money moved. Milk is the Dairy side's, and a bought animal the Fattening side's, as an Intake always
 * is. A sold animal's money is the Side she stood on when she went, and a Vet Fee is split across the
 * Sides the animals the Vet named stood on that day — as their costs are. Feed and medicine bought for the
 * store belong to the whole farm; money entered by hand says its own Side.
 */
const recordFactsOf = async (
  db: Db,
  farmId: string,
  events: readonly { source: MoneySource; sourceId: string }[]
): Promise<Map<string, RecordFacts>> => {
  const receivable = await receivablePaymentsOf(
    db,
    farmId,
    idsOf(events, "receivable_payment")
  );
  const [dispatches, intakes, sales, feedIns, medicines, fees] =
    await Promise.all([
      db.query.dispatch.findMany({
        where: { farmId, id: { in: idsOf(events, "dispatch") } },
        columns: { id: true, deliveryNote: true },
      }),
      db.query.intake.findMany({
        where: { farmId, id: { in: idsOf(events, "intake") } },
        columns: { id: true },
        with: { animal: { columns: { tagNumber: true } } },
      }),
      db.query.sale.findMany({
        where: {
          farmId,
          id: { in: [...idsOf(events, "sale"), ...receivable.clearedSaleIds] },
        },
        columns: { id: true, soldAt: true },
        with: {
          animal: { columns: { id: true, tagNumber: true, side: true } },
        },
      }),
      db.query.feedIn.findMany({
        where: { farmId, id: { in: idsOf(events, "feed_in") } },
        columns: { id: true },
        with: { feedItem: { columns: { nameBn: true } } },
      }),
      db.query.medicinePurchase.findMany({
        where: { farmId, id: { in: idsOf(events, "medicine_purchase") } },
        columns: { id: true },
        with: { product: { columns: { nameBn: true } } },
      }),
      db.query.vetFee.findMany({
        where: { farmId, id: { in: idsOf(events, "vet_fee") } },
        columns: { id: true, visitedOn: true },
        with: {
          animals: {
            with: {
              animal: { columns: { id: true, tagNumber: true, side: true } },
            },
          },
        },
      }),
    ]);
  const animalIds = [
    ...sales.map((one) => one.animal.id),
    ...fees.flatMap((one) => one.animals.map((line) => line.animal.id)),
  ];
  const moves = await db.query.animalMove.findMany({
    where: { farmId, animalId: { in: animalIds } },
    columns: {
      id: true,
      animalId: true,
      toPenId: true,
      toSide: true,
      movedAt: true,
    },
  });
  const sideOf = sidesOverTime(penHistoryOf(moves, new Map()));
  const saleFacts = new Map(
    sales.map((one) => [
      one.id,
      {
        tagNumber: one.animal.tagNumber,
        side: sideOf(one.animal, one.soldAt),
      },
    ])
  );
  return new Map<string, RecordFacts>([
    ...receivable.payments.map(
      (one) => [one.id, receivablePaymentFacts(one, saleFacts)] as const
    ),
    ...dispatches.map(
      (one) =>
        [
          one.id,
          {
            reference: one.deliveryNote,
            sides: [{ side: "dairy" as const, part: 1 }],
          },
        ] as const
    ),
    ...intakes.map(
      (one) =>
        [
          one.id,
          {
            reference: one.animal.tagNumber,
            sides: [{ side: "fattening" as const, part: 1 }],
          },
        ] as const
    ),
    ...sales.map(
      (one) =>
        [
          one.id,
          {
            reference: one.animal.tagNumber,
            sides: [{ side: sideOf(one.animal, one.soldAt), part: 1 }],
          },
        ] as const
    ),
    ...feedIns.map(
      (one) =>
        [one.id, { reference: one.feedItem.nameBn, sides: WHOLE_FARM }] as const
    ),
    ...medicines.map(
      (one) =>
        [one.id, { reference: one.product.nameBn, sides: WHOLE_FARM }] as const
    ),
    ...fees.map((one) => {
      const seen = one.animals.map((line) => line.animal);
      return [
        one.id,
        {
          reference:
            seen
              .map((animal) => animal.tagNumber)
              .toSorted()
              .join(" ") || null,
          sides: splitAcross(
            seen.map((animal) => sideOf(animal, one.visitedOn))
          ),
        },
      ] as const;
    }),
  ]);
};

/** The order Sides are written in: the Dairy side, the Fattening side, the whole farm. */
const SIDE_ORDER: readonly (Side | null)[] = ["dairy", "fattening", null];

/** The Sides a Money Event's amount falls to, the same Side's parts added together, in their order. */
const sharesOf = (
  amountMoney: number,
  sides: RecordFacts["sides"]
): SideShare[] => {
  const bySide = new Map<Side | null, number>();
  for (const { side, part } of sides) {
    bySide.set(side, (bySide.get(side) ?? 0) + part * amountMoney);
  }
  return SIDE_ORDER.flatMap((side) => {
    const share = bySide.get(side);
    return share === undefined ? [] : [{ side, amountMoney: share }];
  });
};

/** Every Money Event of a period, oldest first, as the accountant receives them. */
export const moneyForTheAccountant = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<ExportedMoney[]> => {
  const events = await db.query.moneyEvent.findMany({
    // The Farm's purse alone. A Venture's money passes through an account in the Owner's name and was
    // never the Farm's income or its cost; in the Farm's books it would be a lie.
    where: {
      farmId,
      purseVentureId: THE_FARMS_PURSE,
      occurredAt: { gte: from, lt: until },
    },
    with: {
      category: { columns: { nameBn: true, nameEn: true } },
      counterparty: { columns: { name: true } },
    },
    orderBy: { occurredAt: "asc", id: "asc" },
  });
  const facts = await recordFactsOf(db, farmId, events);
  const accountIds = [
    ...new Set(events.flatMap((one) => one.farmAccountId ?? [])),
  ];
  const accounts =
    accountIds.length === 0
      ? []
      : await db.query.farmAccount.findMany({
          where: { farmId, id: { in: accountIds } },
          columns: { id: true, name: true },
        });
  const accountName = new Map(accounts.map((one) => [one.id, one.name]));
  return events.map((one) => {
    const fact = facts.get(one.sourceId);
    const byHand = one.source === "by_hand";
    const { amountMoney } = one;
    return {
      id: one.id,
      occurredAt: one.occurredAt,
      direction: one.direction,
      amountMoney,
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      counterpartyName: one.counterparty?.name ?? null,
      paymentMethod: one.paymentMethod,
      source: one.source,
      sourceId: one.sourceId,
      sides: sharesOf(
        amountMoney,
        byHand ? [{ side: one.side, part: 1 }] : (fact?.sides ?? WHOLE_FARM)
      ),
      reference: byHand ? one.wageMonth : (fact?.reference ?? null),
      transactionId: one.reference,
      farmAccountName: one.farmAccountId
        ? (accountName.get(one.farmAccountId) ?? null)
        : null,
      approval: one.approval,
      awaitingApproval: one.approval === "awaiting",
      note: one.note,
    };
  });
};
