import { groupedBy } from "./grouped-by";
import type { AnimalState, ExitState, Side } from "./lifecycle";
import { isExitState } from "./lifecycle";

// Where an Animal stood and for how long, how she came to be on the farm, and how she left — worked out from her Moves
// and her State, and worked out here once, because her page, her Animal Passport, the movement log and what her feed
// cost all say it and used to say it four ways.

/** One line of an Animal's Pen history: where she stood, and on which Side, from one move until the next
 *  — or until she left. */
export interface PenHistoryLine {
  animalId: string;
  penId: string;
  side: Side;
  from: Date;
  /** When she moved on or left the farm; null while she is still there. */
  until: Date | null;
}

/** Whether a Pen history line was the one she was standing in at that moment. */
export const covers = (line: PenHistoryLine, at: Date): boolean =>
  line.from <= at && (line.until === null || at < line.until);

/** One Pen Spell: the Pen she stood in, from when, and until what took her away — the next Move, or her Exit. */
export interface PenSpellOf<Pen> {
  pen: Pen;
  from: Date;
  /** Null while she is still standing there. */
  until: Date | null;
}

/**
 * One Animal's Pen Spells, in the order she stood them. The Move that put her in a Pen begins a spell and the
 * next Move ends it; her last one ends when she left the farm, so no reader ever says a cow who has gone is
 * still standing in a Pen. Moves at the same instant keep the order they were written in.
 */
export const penSpellsOf = <Pen>(
  moves: readonly { id: string; movedAt: Date; toPen: Pen }[],
  /** Her Exit, if she has left; null while she is still here. */
  leftAt: Date | null
): PenSpellOf<Pen>[] => {
  const inOrder = moves.toSorted(
    (a, b) =>
      a.movedAt.getTime() - b.movedAt.getTime() || a.id.localeCompare(b.id)
  );
  return inOrder.map((move, index) => ({
    pen: move.toPen,
    from: move.movedAt,
    until: inOrder[index + 1]?.movedAt ?? leftAt,
  }));
};

/**
 * Every Animal's Pen history, from her moves and the day she left. The first move is the one that put her
 * on the farm; each later one ends the line before it. Moves at the same instant keep the order they were
 * written in.
 */
export const penHistoryOf = (
  moves: readonly {
    id: string;
    animalId: string;
    toPenId: string;
    toSide: Side;
    movedAt: Date;
  }[],
  leftAt: ReadonlyMap<string, Date>
): PenHistoryLine[] =>
  [...groupedBy(moves, (move) => move.animalId).entries()].flatMap(
    ([animalId, hers]) =>
      // Each animal's own Pen Spells, named by the Pen and the Side she stood on there.
      penSpellsOf(
        hers.map((move) => ({
          id: move.id,
          movedAt: move.movedAt,
          toPen: { penId: move.toPenId, side: move.toSide },
        })),
        leftAt.get(animalId) ?? null
      ).map((spell) => ({
        animalId,
        penId: spell.pen.penId,
        side: spell.pen.side,
        from: spell.from,
        until: spell.until,
      }))
  );

/**
 * Which Side each Animal was on at a moment, read from her own Pen history — indexed once, because the
 * farm asks it for every dose and every litre.
 */
export const sidesOverTime = (
  history: readonly PenHistoryLine[]
): ((animal: { id: string; side: Side }, at: Date) => Side) => {
  const byAnimal = groupedBy(history, (line) => line.animalId);
  return (animal, at) =>
    byAnimal.get(animal.id)?.find((line) => covers(line, at))?.side ??
    animal.side;
};

/** How an Animal came to be on the farm. */
export const ARRIVALS = ["born", "bought", "already_here"] as const;
export type ArrivalKind = (typeof ARRIVALS)[number];

/** The reason written on the Move that puts an Animal in her first Pen, by what it says of how she arrived. */
const ARRIVAL_OF = {
  born: "born",
  intake: "bought",
} as const satisfies Record<string, ArrivalKind>;

/** The reasons a Move says an Animal came onto the farm — anything else on a first Move means she was already
 *  standing here when the farm wrote its opening register, and came from nowhere. */
export const ARRIVAL_MOVE_REASONS = Object.keys(
  ARRIVAL_OF
) as (keyof typeof ARRIVAL_OF)[];

/** How an Animal arrived, and when: born here at a Calving, bought in at an Intake, or already standing when the
 *  farm opened its register — which is what the Move into her first Pen was written for. */
export interface Arrival {
  how: ArrivalKind;
  at: Date;
}

/** How one Move says an Animal came onto the farm, by the reason it was written with. */
export const arrivalFromMove = (move: { reason: string | null }): ArrivalKind =>
  ARRIVAL_OF[move.reason as keyof typeof ARRIVAL_OF] ?? "already_here";

/**
 * How she came to be on the farm, from the Move that put her in her first Pen — the one Move with no Pen behind
 * it. Nothing at all for an Animal with no such Move, which the farm's own records should not have.
 */
export const arrivalOf = (
  moves: readonly {
    movedAt: Date;
    fromPenId: string | null;
    reason: string | null;
  }[]
): Arrival | null => {
  const [first] = moves
    .filter((move) => move.fromPenId === null)
    .toSorted((a, b) => a.movedAt.getTime() - b.movedAt.getTime());
  return first ? { how: arrivalFromMove(first), at: first.movedAt } : null;
};

/** How an Animal left the farm, and when: her State once it is an Exit, and the moment she reached it. */
export interface Exit {
  how: ExitState;
  at: Date;
}

/** How she left, or nothing while she is still here. Her State says which way she went, and when it changed says
 *  when — the same answer for a paper, a page and a register, however she went. */
export const exitOf = (her: {
  state: AnimalState;
  stateChangedAt: Date;
}): Exit | null =>
  isExitState(her.state) ? { how: her.state, at: her.stateChangedAt } : null;
