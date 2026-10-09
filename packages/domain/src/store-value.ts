import { roundMoney } from "./money";

/**
 * What the Farm's store held at a moment, in taka (CONTEXT.md: **Capital Employed**; ADR 0023): each Feed Item's Stock on
 * Hand at its average price, and each medicine's doses at what a dose cost then — the prices the animals are charged at.
 * A book below nothing holds nothing. Stock that has no price — fodder from the farm's own fields, a medicine never
 * bought — adds nothing, and is counted so the figure can say so.
 */
export const storeValueOf = ({
  feed,
  medicine,
}: {
  feed: readonly { onHand: number; averagePriceMoney: number | null }[];
  medicine: readonly { expected: number; perDoseMoney: number | null }[];
}) => {
  const held = [
    ...feed.map((one) => ({
      kind: "feed",
      amount: one.onHand,
      price: one.averagePriceMoney,
    })),
    ...medicine.map((one) => ({
      kind: "medicine",
      amount: one.expected,
      price: one.perDoseMoney,
    })),
  ].filter((one) => one.amount > 0);
  const worth = (kind: string) =>
    roundMoney(
      held
        .filter((one) => one.kind === kind)
        .reduce((sum, one) => sum + one.amount * (one.price ?? 0), 0)
    );
  const feedMoney = worth("feed");
  const medicineMoney = worth("medicine");
  return {
    feedMoney,
    medicineMoney,
    totalMoney: roundMoney(feedMoney + medicineMoney),
    /** How many feeds and medicines held stock with no price, which adds nothing above. */
    unpriced: held.filter((one) => one.price === null).length,
  };
};

export type StoreValue = ReturnType<typeof storeValueOf>;
