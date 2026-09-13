import type { Database } from "@OpenFarm/db";
import type { Side } from "@OpenFarm/domain";
import { MORTALITY_KINDS } from "@OpenFarm/domain";

type Db = Pick<Database, "query">;

/**
 * What happened to an animal's whereabouts, in the words the movement log's CSV uses: a calf coming into her
 * mother's Pen at her Calving, a bought animal's Intake, a Move between Pens or one that changes her Side, a
 * Sale, and a death or cull. In that order when two fall at the same instant — a calf born dead is born before
 * she dies.
 */
export const MOVEMENT_KINDS = [
  "calving",
  "intake",
  "move",
  "side_change",
  "sale",
  ...MORTALITY_KINDS,
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

/** The Moves that put an animal in a Pen from outside the farm's record, by the reason they were written with.
 *  An animal entered by registering her — the opening register above all — was already there, and moved
 *  nowhere. */
const ARRIVAL_REASONS = ["born", "intake"];

/** A Pen as a Side change names it: which Side she stood on there. */
const penOnSide = (pen: string | undefined, side: Side | null) =>
  pen && side ? `${pen} (${side})` : (pen ?? null);

/** Calvings, intakes, Moves between Pens and Side changes in a period. */
const movesBetween = async (
  db: Db,
  farmId: string,
  within: { gte: Date; lt: Date }
): Promise<MovementLine[]> => {
  const moves = await db.query.animalMove.findMany({
    where: {
      farmId,
      movedAt: within,
      OR: [
        { fromPenId: { isNotNull: true } },
        { reason: { in: ARRIVAL_REASONS } },
      ],
    },
    with: {
      animal: {
        columns: { tagNumber: true },
        with: { intake: { with: { seller: { columns: { name: true } } } } },
      },
      fromPen: { columns: { name: true } },
      toPen: { columns: { name: true } },
      mover: { columns: { name: true } },
    },
  });
  return moves.map((move) => {
    const line = {
      at: move.movedAt,
      tagNumber: move.animal.tagNumber,
      recordedBy: move.mover?.name ?? null,
    };
    if (move.fromPenId === null) {
      const kind = move.reason === "intake" ? "intake" : "calving";
      return {
        ...line,
        kind,
        from:
          kind === "intake" ? (move.animal.intake?.seller?.name ?? null) : null,
        to: move.toPen.name,
      };
    }
    const sideChange = move.fromSide !== move.toSide;
    return {
      ...line,
      kind: sideChange ? "side_change" : "move",
      from: sideChange
        ? penOnSide(move.fromPen?.name, move.fromSide)
        : (move.fromPen?.name ?? null),
      to: sideChange
        ? penOnSide(move.toPen.name, move.toSide)
        : move.toPen.name,
    };
  });
};

/** An animal leaving the farm, from the Pen she stood in, as whoever wrote it down wrote it. */
const leaving = (
  one: {
    animal: { tagNumber: string; pen: { name: string } };
    recorder: { name: string } | null;
  },
  at: Date,
  kind: MovementKind,
  to: string | null
): MovementLine => ({
  at,
  tagNumber: one.animal.tagNumber,
  kind,
  from: one.animal.pen.name,
  to,
  recordedBy: one.recorder?.name ?? null,
});

const leaverColumns = {
  animal: {
    columns: { tagNumber: true },
    with: { pen: { columns: { name: true } } },
  },
  recorder: { columns: { name: true } },
} as const;

/**
 * The movement log (R11): every Move between Pens and every Side change, every calf coming into her Pen at her
 * Calving and every bought animal's Intake, every Sale and every death or cull in a period, in time order. An
 * intake comes from the seller; a Side change names the Side at both ends; a sale goes from her Pen to where the
 * buyer took her; a death leaves from her Pen.
 */
export const movementsBetween = async (
  db: Db,
  farmId: string,
  range: { from: Date; until: Date }
): Promise<MovementLine[]> => {
  const within = { gte: range.from, lt: range.until };
  const [moves, sales, deaths] = await Promise.all([
    movesBetween(db, farmId, within),
    db.query.sale.findMany({
      where: { farmId, soldAt: within },
      with: leaverColumns,
    }),
    db.query.mortality.findMany({
      where: { farmId, happenedAt: within },
      with: leaverColumns,
    }),
  ]);
  const lines: MovementLine[] = [
    ...moves,
    ...sales.map((one) => leaving(one, one.soldAt, "sale", one.destination)),
    ...deaths.map((one) => leaving(one, one.happenedAt, one.kind, null)),
  ];
  const orderOf = (kind: MovementKind) => MOVEMENT_KINDS.indexOf(kind);
  return lines.toSorted(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      a.tagNumber.localeCompare(b.tagNumber) ||
      orderOf(a.kind) - orderOf(b.kind)
  );
};
