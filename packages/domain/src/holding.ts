import type { Costs } from "./costs";
import type { Side } from "./lifecycle";

/**
 * Every kind of charge an Animal carries, as the costing shares them out: what she ate, the doses she was given, her
 * part of the Vet's fees for visits that named her, the Hasil the haat took on her, her part of the Buying Trip that
 * brought her and the Selling Trips that took her, and her part of the Herd Costs. The one list of them: a sum names
 * which of these it counts, and a new kind is added here once.
 */
export const CHARGE_KINDS = [
  "feed",
  "dose",
  "vet",
  "hasil",
  "buying_trip",
  "selling_trip",
  "herd",
] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

/** One charge to one Animal: what kind, when, on which Side, what it came to, and what it came from. */
export interface Charge {
  kind: ChargeKind;
  animalId: string;
  side: Side;
  at: Date;
  /** Nought for a dose of something the farm had not bought by then, which is shown, never charged. */
  bdt: number;
  /** What it came from — the Feed Item, the medicine, the haat's Intake, the outing, the Category of a Herd Cost — so a
   *  sum can be read back as what it was made of. */
  fromId: string;
  /** Home-grown fodder with no price: how much of it there was. Nought for anything but feed. */
  unpricedKg: number;
  /** False where the sum is short by it: feed with no price, or a dose of a product never bought. */
  priced: boolean;
}

/**
 * The charges each sum counts, as CONTEXT.md defines it.
 *
 * - Everything: a **Settlement**, **Return on Cost** and **Margin** ask what an Animal cost whichever purse paid.
 * - What the Farm is owed: a **Reimbursement** is only what the Farm paid for the whole herd — not the Hasil or a
 *   Buying Trip, which came out of the Venture's own Buying Float, but the Selling Trips the Farm paid for later.
 * - Her keep: **Cost of Gain** now, and a dairy cow's milk against her keep, ask what keeping her costs, not what
 *   moving her did.
 */
export const EVERY_CHARGE: ReadonlySet<ChargeKind> = new Set(CHARGE_KINDS);
export const WHAT_THE_FARM_IS_OWED: ReadonlySet<ChargeKind> = new Set([
  "feed",
  "dose",
  "vet",
  "herd",
  "selling_trip",
]);
export const HER_KEEP: ReadonlySet<ChargeKind> = new Set([
  "feed",
  "dose",
  "vet",
  "herd",
]);

/** Whose an Animal was at a moment: a Venture's id, or `null` for the Farm's own. */
export type OwnedThenBy = (animalId: string, at: Date) => string | null;

/**
 * One Animal's time with one owner on one Side (CONTEXT.md, Holding): from the moment that owner took her on until
 * she left them, or `null` while she is still theirs.
 */
export interface Holding {
  animalId: string;
  owner: string | null;
  side: Side;
  from: Date;
  until: Date | null;
}

/**
 * What one owner's Animals were charged: every charge of the kinds asked for to an Animal that was that owner's on
 * the day it was charged. What a Venture's Settlement and Reimbursement are made of, and the Farm's own reports.
 */
export const chargesOfOwner = (
  charges: readonly Charge[],
  owner: string | null,
  ownedThenBy: OwnedThenBy,
  kinds: ReadonlySet<ChargeKind> = EVERY_CHARGE
): Charge[] =>
  charges.filter(
    (one) => kinds.has(one.kind) && ownedThenBy(one.animalId, one.at) === owner
  );

/**
 * What one Holding was charged: her charges of the kinds asked for, on its Side, dated from the moment its owner took
 * her on to the moment she left them, and hers that day. The last of those settles a charge on the very moment she
 * changed hands, which both Holdings' dates would otherwise take in.
 */
export const chargesInHolding = (
  charges: readonly Charge[],
  holding: Holding,
  ownedThenBy: OwnedThenBy,
  kinds: ReadonlySet<ChargeKind> = EVERY_CHARGE
): Charge[] =>
  charges.filter(
    (one) =>
      one.animalId === holding.animalId &&
      kinds.has(one.kind) &&
      one.side === holding.side &&
      one.at >= holding.from &&
      (holding.until === null || one.at <= holding.until) &&
      ownedThenBy(one.animalId, one.at) === holding.owner
  );

/** What some charges came to, by kind, unrounded: the sum every figure of an Animal's cost is read from. */
export const costsOf = (charges: readonly Charge[]): Costs => {
  const bdtOf = (...kinds: ChargeKind[]) =>
    charges
      .filter((one) => kinds.includes(one.kind))
      .reduce((sum, one) => sum + one.bdt, 0);
  return {
    feedBdt: bdtOf("feed"),
    unpricedKg: charges.reduce((sum, one) => sum + one.unpricedKg, 0),
    medicineBdt: bdtOf("dose"),
    uncostedDoses: charges.filter((one) => one.kind === "dose" && !one.priced)
      .length,
    vetBdt: bdtOf("vet"),
    hasilBdt: bdtOf("hasil"),
    tripBdt: bdtOf("buying_trip", "selling_trip"),
    herdBdt: bdtOf("herd"),
  };
};

/** What happened to one Animal that could end a Holding: her Sale, every Internal Sale of her, her crossing from the
 *  Dairy side, her death. */
export interface WhatHappened {
  sale: { soldAt: Date; priceBdt: number } | null;
  /** Every Internal Sale of her, in the order they were saved. */
  internalSales: readonly {
    id: string;
    fromVentureId: string | null;
    priceBdt: number;
    /** When it was saved: which of two came first. */
    createdAt: Date;
    /** When she changed hands: the start of the day written on the sale. */
    on: Date;
  }[];
  /** Her crossing to the Fattening side, and the price the Owner put on it — or none yet. */
  crossing: { on: Date; priceBdt: number | null } | null;
  died: Date | null;
}

/** How a Holding ended: when, and what came back — nothing for a death, and not yet known for a crossing not priced. */
export interface Left {
  how: "sold" | "sold_to_venture" | "crossed" | "died";
  on: Date;
  backBdt: number | null;
}

/**
 * How one Holding ended, or `null` while she is still its owner's (CONTEXT.md, Holding): her crossing off the Dairy
 * side, an Internal Sale away from this owner after she came to it, her Sale while she was theirs, or her death. One
 * rule for the Farm's Seasons, a Venture's cattle and a dairy Animal's whole stay.
 */
export const howSheLeft = (
  holding: {
    animalId: string;
    owner: string | null;
    side: Side;
    from: Date;
    /** The Internal Sale that brought her to this owner, if one did: only a later one takes her away again, however
     *  close in time — sold to a Venture and bought back in one sitting is two Holdings, not one. */
    cameBy?: string | null;
  },
  her: WhatHappened,
  ownedThenBy: OwnedThenBy
): Left | null => {
  if (holding.side === "dairy" && her.crossing) {
    return {
      how: "crossed",
      on: her.crossing.on,
      backBdt: her.crossing.priceBdt,
    };
  }
  const cameAt = holding.cameBy
    ? her.internalSales.findIndex((one) => one.id === holding.cameBy)
    : -1;
  const soldOn = her.internalSales.find(
    (one, index) =>
      one.fromVentureId === holding.owner &&
      (holding.cameBy ? index > cameAt : one.createdAt >= holding.from)
  );
  if (soldOn) {
    return {
      how: "sold_to_venture",
      // The start of the day she was sold on, though never before this owner took her on, for one bought and sold
      // on in the same day.
      on: soldOn.on > holding.from ? soldOn.on : holding.from,
      backBdt: soldOn.priceBdt,
    };
  }
  if (
    her.sale &&
    ownedThenBy(holding.animalId, her.sale.soldAt) === holding.owner
  ) {
    return { how: "sold", on: her.sale.soldAt, backBdt: her.sale.priceBdt };
  }
  return her.died ? { how: "died", on: her.died, backBdt: 0 } : null;
};
