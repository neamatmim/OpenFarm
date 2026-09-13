import type { Database } from "@OpenFarm/db";

type Db = Pick<Database, "query">;

/** What happened to an animal's whereabouts, in the words the movement log's CSV uses. */
export const MOVEMENT_KINDS = [
  "arrival",
  "birth",
  "intake",
  "move",
  "side_change",
  "sale",
  "died",
  "culled",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** One line of the movement log: when, which animal, what happened, from where to where, and who wrote it. */
export interface MovementLine {
  at: Date;
  tagNumber: string;
  kind: MovementKind;
  from: string | null;
  to: string | null;
  recordedBy: string | null;
}

/** How an animal came onto the farm, by the reason her first Move was written with. */
const arrivalKind = (reason: string | null): MovementKind => {
  if (reason === "born") {
    return "birth";
  }
  return reason === "intake" ? "intake" : "arrival";
};

/** Moves an animal into the farm, then about it, then out of it: a calf born dead is born before she dies. */
const orderOf = (kind: MovementKind) => MOVEMENT_KINDS.indexOf(kind);

/** The Moves in a period: arrivals, births, intakes, Moves between Pens and Side changes. */
const movesBetween = async (
  db: Db,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<MovementLine[]> => {
  const moves = await db.query.animalMove.findMany({
    where: { farmId, movedAt: { gte: from, lt: until } },
    with: {
      animal: {
        columns: { tagNumber: true, birthDate: true },
        with: { intake: { with: { seller: { columns: { name: true } } } } },
      },
      fromPen: { columns: { name: true } },
      toPen: { columns: { name: true } },
      mover: { columns: { name: true } },
    },
  });
  return moves.map((move) => {
    if (move.fromPenId === null) {
      const kind = arrivalKind(move.reason);
      return {
        // A calf is on the farm from the hour she was born, not from when her calving was written down.
        at:
          kind === "birth"
            ? (move.animal.birthDate ?? move.movedAt)
            : move.movedAt,
        tagNumber: move.animal.tagNumber,
        kind,
        from:
          kind === "intake" ? (move.animal.intake?.seller?.name ?? null) : null,
        to: move.toPen.name,
        recordedBy: move.mover?.name ?? null,
      };
    }
    return {
      at: move.movedAt,
      tagNumber: move.animal.tagNumber,
      kind: move.fromSide === move.toSide ? "move" : "side_change",
      from: move.fromPen?.name ?? null,
      to: move.toPen.name,
      recordedBy: move.mover?.name ?? null,
    };
  });
};

/**
 * The movement log (R11): every Move between Pens and every Side change, every arrival — registered, born or
 * bought in — every Sale and every death or cull in a period, in time order. A sale goes from the Pen she stood
 * in to where the buyer took her; an intake comes from the seller; a death leaves from her Pen.
 */
export const movementsBetween = async (
  db: Db,
  farmId: string,
  range: { from: Date; until: Date }
): Promise<MovementLine[]> => {
  const within = { gte: range.from, lt: range.until };
  const [moves, sales, deaths] = await Promise.all([
    movesBetween(db, farmId, range),
    db.query.sale.findMany({
      where: { farmId, soldAt: within },
      with: {
        animal: {
          columns: { tagNumber: true },
          with: { pen: { columns: { name: true } } },
        },
        recorder: { columns: { name: true } },
      },
    }),
    db.query.mortality.findMany({
      where: { farmId, happenedAt: within },
      with: {
        animal: {
          columns: { tagNumber: true },
          with: { pen: { columns: { name: true } } },
        },
        recorder: { columns: { name: true } },
      },
    }),
  ]);
  const lines: MovementLine[] = [
    ...moves,
    ...sales.map((one) => ({
      at: one.soldAt,
      tagNumber: one.animal.tagNumber,
      kind: "sale" as const,
      from: one.animal.pen.name,
      to: one.destination,
      recordedBy: one.recorder?.name ?? null,
    })),
    ...deaths.map((one) => ({
      at: one.happenedAt,
      tagNumber: one.animal.tagNumber,
      kind: one.kind,
      from: one.animal.pen.name,
      to: null,
      recordedBy: one.recorder?.name ?? null,
    })),
  ];
  return lines.toSorted(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      a.tagNumber.localeCompare(b.tagNumber) ||
      orderOf(a.kind) - orderOf(b.kind)
  );
};
