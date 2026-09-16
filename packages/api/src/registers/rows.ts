import type { RegisterRows } from "./all";
import type { RegisterName } from "./register";

/**
 * A register's rows as an answer says them: with the name of the register they came out of, so the screen that
 * asked knows which rows it is holding.
 *
 * This is the one thing about a register the screen needs at hand, so it is kept where reaching for it costs
 * nothing: everything above is a type, and nothing here reaches the database or the five declarations.
 */
export type RowsAnswer = {
  [K in RegisterName]: {
    register: K;
    from: string;
    to: string;
    rows: RegisterRows[K][];
  };
}[RegisterName];

/** The rows a register was read for, paired with its name. The list of registers is what makes the pairing
 *  true; the name narrowed nothing on the way through `registerNamed`, so it is said again here. */
export const rowsAnswer = (
  register: RegisterName,
  found: { from: string; to: string; rows: unknown[] }
): RowsAnswer => ({ register, ...found }) as RowsAnswer;

/**
 * The rows of the register that was asked for, out of an answer that says which register it holds.
 *
 * The check beside the cast is what makes it true: an answer naming the mortality register holds the mortality
 * register's rows. TypeScript follows that when the name is written out where it can see it, and not when the
 * name arrives as a parameter, which is how every screen and test here has it.
 */
export const rowsOfRegister = <K extends RegisterName>(
  answer: RowsAnswer | undefined,
  register: K
): RegisterRows[K][] =>
  answer?.register === register ? (answer.rows as RegisterRows[K][]) : [];
