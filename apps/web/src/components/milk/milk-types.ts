import type { orpc } from "@/utils/orpc";

/** One farm day of milk as the farm answers it: the tank, what was handed over, and each Dispatch. */
export type MilkDay = Awaited<ReturnType<typeof orpc.milk.day.call>>;

/** One Dispatch as the day lists it. */
export type Dispatch = MilkDay["dispatches"][number];

/** A farm day a number of days either side of another, both as `YYYY-MM-DD`. */
export const shiftDay = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, "YYYY-MM-DD".length);
};

/** What a Dispatch comes to: its litres at its price, to the paisa. */
export const worthOf = (litres: number, pricePerLitre: number): number =>
  Math.round(litres * pricePerLitre * 100) / 100;
