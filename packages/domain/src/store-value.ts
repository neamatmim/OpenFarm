import { roundMoney } from "./money";

/** What some stock is worth at its prices; stock with no price adds nothing. */
const worthOf = (stock: readonly { amount: number; price: number | null }[]) =>
  roundMoney(
    stock.reduce((sum, one) => sum + one.amount * (one.price ?? 0), 0)
  );

/**
 * What the Farm's store held at a moment, in taka (CONTEXT.md: **Capital Employed**; ADR 0023): each Feed Item's Stock on
 * Hand at its average price, and each medicine's doses at what a dose cost then — the prices the animals are charged at.
 * A book below nothing holds nothing. Stock that has no price — fodder from the farm's own fields, a medicine never
 * bought — adds nothing, and is counted so the figure can say so. Silage still in the pit (a **Feed Making** whose made
 * feed has not come out) is feed the farm holds, at what went into it (ADR 0031): out of Stock on Hand, as nobody can
 * feed it yet, but not out of what the farm has tied up.
 */
export const storeValueOf = ({
  feed,
  medicine,
  inThePit = { worthMoney: 0, unpriced: 0 },
}: {
  feed: readonly { onHand: number; averagePriceMoney: number | null }[];
  medicine: readonly { expected: number; perDoseMoney: number | null }[];
  inThePit?: { worthMoney: number; unpriced: number };
}) => {
  const held = {
    feed: feed
      .filter((one) => one.onHand > 0)
      .map((one) => ({ amount: one.onHand, price: one.averagePriceMoney })),
    medicine: medicine
      .filter((one) => one.expected > 0)
      .map((one) => ({ amount: one.expected, price: one.perDoseMoney })),
  };
  const feedMoney = roundMoney(worthOf(held.feed) + inThePit.worthMoney);
  const medicineMoney = worthOf(held.medicine);
  return {
    feedMoney,
    medicineMoney,
    totalMoney: roundMoney(feedMoney + medicineMoney),
    /** How many feeds and medicines held stock with no price, which adds nothing above — a pit nothing can price
     *  among them. */
    unpriced:
      [...held.feed, ...held.medicine].filter((one) => one.price === null)
        .length + inThePit.unpriced,
  };
};

export type StoreValue = ReturnType<typeof storeValueOf>;
