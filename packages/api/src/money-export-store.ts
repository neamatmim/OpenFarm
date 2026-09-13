import type { Database } from "@OpenFarm/db";
import type { MoneySource } from "@OpenFarm/db/schema/money";
import type { MoneyToSummarise } from "@OpenFarm/domain";

type Db = Pick<Database, "query">;
type Side = "dairy" | "fattening";

/** One Money Event as the accountant's CSV lists it and the summary adds it up. */
export interface ExportedMoney extends MoneyToSummarise {
  id: string;
  occurredAt: Date;
  paymentMethod: string;
  source: MoneySource;
  sourceId: string;
  /** What the accountant can find the record by: a tag, a challan, a Feed Item, a product, a wage's month. */
  reference: string | null;
  approval: "not_needed" | "awaiting" | "approved";
  note: string | null;
}

/** What a record is known by, and the Side its money belongs to. */
interface RecordFacts {
  reference: string | null;
  side: Side | null;
}

const idsOf = (
  events: readonly { source: MoneySource; sourceId: string }[],
  source: MoneySource
) => events.filter((one) => one.source === source).map((one) => one.sourceId);

/** The one Side all these animals share, or null when they are on both or there are none. */
const sharedSide = (sides: readonly Side[]): Side | null => {
  const [first] = sides;
  return first !== undefined && sides.every((side) => side === first)
    ? first
    : null;
};

/**
 * What each record behind these Money Events is known by and which Side it belongs to. Milk is the Dairy
 * side's; a bought or sold animal's money is her Side's; a Vet Fee is the Side of the animals the Vet
 * named, when they share one; feed and medicine bought for the store belong to the whole farm; money
 * entered by hand says its own Side.
 */
const recordFactsOf = async (
  db: Db,
  farmId: string,
  events: readonly { source: MoneySource; sourceId: string }[]
): Promise<Map<string, RecordFacts>> => {
  const [dispatches, intakes, sales, feedIns, medicines, fees] =
    await Promise.all([
      db.query.dispatch.findMany({
        where: { farmId, id: { in: idsOf(events, "dispatch") } },
        columns: { id: true, challan: true },
      }),
      db.query.intake.findMany({
        where: { farmId, id: { in: idsOf(events, "intake") } },
        columns: { id: true },
        with: { animal: { columns: { tagNumber: true, side: true } } },
      }),
      db.query.sale.findMany({
        where: { farmId, id: { in: idsOf(events, "sale") } },
        columns: { id: true },
        with: { animal: { columns: { tagNumber: true, side: true } } },
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
        columns: { id: true },
        with: {
          animals: {
            with: { animal: { columns: { tagNumber: true, side: true } } },
          },
        },
      }),
    ]);
  return new Map<string, RecordFacts>([
    ...dispatches.map(
      (one) => [one.id, { reference: one.challan, side: "dairy" }] as const
    ),
    ...[...intakes, ...sales].map(
      (one) =>
        [
          one.id,
          { reference: one.animal.tagNumber, side: one.animal.side },
        ] as const
    ),
    ...feedIns.map(
      (one) => [one.id, { reference: one.feedItem.nameBn, side: null }] as const
    ),
    ...medicines.map(
      (one) => [one.id, { reference: one.product.nameBn, side: null }] as const
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
          side: sharedSide(seen.map((animal) => animal.side)),
        },
      ] as const;
    }),
  ]);
};

/** Every Money Event of a period, oldest first, as the accountant receives them. */
export const moneyForTheAccountant = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<ExportedMoney[]> => {
  const events = await db.query.moneyEvent.findMany({
    where: { farmId, occurredAt: { gte: from, lt: until } },
    with: {
      category: { columns: { nameBn: true, nameEn: true } },
      counterparty: { columns: { name: true } },
    },
    orderBy: { occurredAt: "asc", id: "asc" },
  });
  const facts = await recordFactsOf(db, farmId, events);
  return events.map((one) => {
    const fact = facts.get(one.sourceId);
    const byHand = one.source === "by_hand";
    return {
      id: one.id,
      occurredAt: one.occurredAt,
      direction: one.direction,
      amountBdt: Number(one.amountBdt),
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      counterpartyName: one.counterparty?.name ?? null,
      paymentMethod: one.paymentMethod,
      source: one.source,
      sourceId: one.sourceId,
      side: byHand ? one.side : (fact?.side ?? null),
      reference: byHand ? one.wageMonth : (fact?.reference ?? null),
      approval: one.approval,
      awaitingApproval: one.approval === "awaiting",
      note: one.note,
    };
  });
};
