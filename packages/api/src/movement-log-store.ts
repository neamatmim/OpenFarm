import type { Database } from "@OpenFarm/db";
import type { Side } from "@OpenFarm/domain";
import {
  ARRIVAL_MOVE_REASONS,
  MORTALITY_KINDS,
  arrivalFromMove,
} from "@OpenFarm/domain";

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

/** How an Arrival reads in the log: a calf comes into her mother's Pen at her Calving, and a bought animal at
 *  her Intake. An animal who was already here when the farm wrote its opening register moved nowhere, and the
 *  log never asks. */
const ARRIVAL_LINE = { born: "calving", bought: "intake" } as const;

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
        { reason: { in: [...ARRIVAL_MOVE_REASONS] } },
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
  return moves.flatMap((move): MovementLine[] => {
    const line = {
      at: move.movedAt,
      tagNumber: move.animal.tagNumber,
      recordedBy: move.mover?.name ?? null,
    };
    if (move.fromPenId === null) {
      // How she came to be here, as her record reads it — the same answer her page and her Animal Passport get.
      // An animal who was already standing here moved nowhere, and the query above never asks for her.
      const how = arrivalFromMove(move);
      if (how === "already_here") {
        return [];
      }
      const kind = ARRIVAL_LINE[how];
      return [
        {
          ...line,
          kind,
          from:
            kind === "intake"
              ? (move.animal.intake?.seller?.name ?? null)
              : null,
          to: move.toPen.name,
        },
      ];
    }
    const sideChange = move.fromSide !== move.toSide;
    return [
      {
        ...line,
        kind: sideChange ? "side_change" : "move",
        from: sideChange
          ? penOnSide(move.fromPen?.name, move.fromSide)
          : (move.fromPen?.name ?? null),
        to: sideChange
          ? penOnSide(move.toPen.name, move.toSide)
          : move.toPen.name,
      },
    ];
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
