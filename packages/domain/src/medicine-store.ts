import type { ExpiryWindow, LotHappening, LotIn, LotsReplayed } from "./lots";
import { replayLots } from "./lots";

/** One Lot of medicine as it came in: a Medicine Purchase, and what its box says. */
export type MedicineLotIn = LotIn & { lotNumber: string | null };

/** Something that happened to a product's medicine, at the moment it happened. */
export type MedicineHappening =
  | { kind: "bought"; at: Date; lot: MedicineLotIn }
  | { kind: "given"; at: Date; doseId: string }
  | { kind: "counted"; at: Date; counted: number };

/** A product's medicine as the store holds it now: the Lots replayed, each dose's Lot by its id. */
export type MedicineStore = LotsReplayed<MedicineLotIn>;

/**
 * A product's medicine, replayed in the order things happened (`replayLots`): a Medicine Purchase brings its Lot in,
 * a dose comes out of the Lot first to expire among those already bought, and a count is what was on the shelf.
 *
 * Replayed rather than summed: the count once stored what the book said that day and the farm added up the
 * differences, so a dose given before a count but written down after it came off the shelf twice, an earlier count
 * put right undid what a later one found, doses found over the book never showed, and a dose was taken from a Lot
 * bought after it was given. The count wins, and what is written about the days before it cannot move it.
 */
export const medicineStoreOf = (
  happenings: readonly MedicineHappening[],
  window: ExpiryWindow
): MedicineStore =>
  replayLots(
    happenings.map((one): LotHappening<MedicineLotIn> => {
      if (one.kind === "bought") {
        return { kind: "in", at: one.at, lot: one.lot };
      }
      if (one.kind === "given") {
        return { kind: "out", at: one.at, quantity: 1, id: one.doseId };
      }
      return one;
    }),
    window
  );
