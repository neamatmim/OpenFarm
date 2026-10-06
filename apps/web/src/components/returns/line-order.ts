/** A breakdown line as far as its order goes: a buying weight by its kilos, anything else by what it is called. */
interface Ordered {
  line:
    | { kind: "band"; fromKg: number | null; toKg: number | null }
    | { kind: string };
  said: string;
}

const isBand = (
  line: Ordered["line"]
): line is { kind: "band"; fromKg: number | null; toKg: number | null } =>
  line.kind === "band";

/**
 * Two breakdown lines in order. Buying weights go lightest first — by their words "150–200 kg" would come before
 * "50–100 kg" — the open-ended lightest band first and the open-ended heaviest last, and a line with no weight after
 * them all. Every other line goes by what it is called.
 */
export const lineOrder = (a: Ordered, b: Ordered): number => {
  const aBand = isBand(a.line);
  const bBand = isBand(b.line);
  if (aBand !== bBand) {
    return aBand ? -1 : 1;
  }
  if (isBand(a.line) && isBand(b.line)) {
    const from =
      (a.line.fromKg ?? Number.NEGATIVE_INFINITY) -
      (b.line.fromKg ?? Number.NEGATIVE_INFINITY);
    if (from !== 0 && !Number.isNaN(from)) {
      return from;
    }
    const to =
      (a.line.toKg ?? Number.POSITIVE_INFINITY) -
      (b.line.toKg ?? Number.POSITIVE_INFINITY);
    return Number.isNaN(to) ? 0 : to;
  }
  return a.said.localeCompare(b.said);
};
