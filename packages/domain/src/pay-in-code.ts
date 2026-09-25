/** What every Pay-in Code starts with. Not the "OF" of OpenFarm: an O on a deposit slip reads as a nought. */
const PREFIX = "PAY";

/** The Agreement's place is written with at least two digits, so a code's digits run together still split one way. */
const AGREEMENT_DIGITS = 2;

const CODE = new RegExp(`^${PREFIX}-(?<venture>\\d+)-(?<agreement>\\d+)$`, "u");

/**
 * The prefix, then the numbers as a bank may have printed them: apart, with whatever it put between them, or run
 * together into one. Letters straight after the prefix are a word, not a code.
 */
const CARRIED = new RegExp(
  `${PREFIX}[^A-Z0-9]*(?<first>\\d+)(?:[^A-Z0-9]+(?<second>\\d+))?(?!\\d)`,
  "gu"
);

const BANGLA_DIGIT = /[০-৯]/gu;
const BANGLA_ZERO = 0x09_e6;

/**
 * The code OpenFarm gives one Investment Agreement when it is recorded, for the Investor to write on the transfer
 * that sends its capital: the Venture's place among the farm's Ventures and the Agreement's among the Venture's, both
 * counted from one, as `PAY-3-07`. Short, uppercase and written by hand without a letter mistaken for a digit.
 */
export const payInCode = (
  ventureOrdinal: number,
  agreementOrdinal: number
): string =>
  `${PREFIX}-${ventureOrdinal}-${String(agreementOrdinal).padStart(AGREEMENT_DIGITS, "0")}`;

/**
 * Which one of these Pay-in Codes a bank's reference carries, if it carries exactly one: dashes, spaces or slashes
 * between the numbers, none at all, a nought dropped, lower case or Bangla digits are all the same code. A reference
 * that carries two says nothing about whose money it is, so nothing is picked.
 */
export const payInCodeIn = (
  reference: string,
  codes: readonly string[]
): string | undefined => {
  const typed = reference
    .toUpperCase()
    .replaceAll(BANGLA_DIGIT, (digit) =>
      String((digit.codePointAt(0) ?? BANGLA_ZERO) - BANGLA_ZERO)
    );
  const found = new Set<string>();
  for (const carried of typed.matchAll(CARRIED)) {
    const { first = "", second } = carried.groups ?? {};
    for (const code of codes) {
      const { venture, agreement } = CODE.exec(code)?.groups ?? {};
      if (venture === undefined || agreement === undefined) {
        continue;
      }
      const apart =
        second !== undefined &&
        Number(first) === Number(venture) &&
        Number(second) === Number(agreement);
      const runTogether = first === `${venture}${agreement}`;
      if (apart || runTogether) {
        found.add(code);
      }
    }
  }
  const [only] = found;
  return found.size === 1 ? only : undefined;
};
