import type { DiagnosisRow } from "./disease-history";
import { DISEASE_HISTORY } from "./disease-history";
import type { DeathRow } from "./mortality";
import { MORTALITY_REGISTER } from "./mortality";
import type { MovementRow } from "./movement-log";
import { MOVEMENT_LOG } from "./movement-log";
import type {
  Db,
  FarmProducing,
  Register,
  RegisterName,
  Saying,
} from "./register";
import { csvOf, hasCsv, paperOf, readRegister } from "./register";
import type { TreatmentRow } from "./treatment";
import { TREATMENT_REGISTER } from "./treatment";
import type { VaccinationRow } from "./vaccination";
import { VACCINATION_REGISTER } from "./vaccination";

/** What each register's rows hold, by the name the trail records it under. */
export interface RegisterRows {
  vaccination_register: VaccinationRow;
  treatment_register: TreatmentRow;
  disease_history: DiagnosisRow;
  mortality_register: DeathRow;
  movement_log: MovementRow;
}

/**
 * Every register the farm keeps for an inspector, each declared in a file of its own.
 *
 * This list and the files it names are the whole of what a register is: the Inspector View's screen, its
 * papers, its spreadsheets and the Exports that record them are all worked out from here.
 */
export const REGISTERS: { [K in RegisterName]: Register<RegisterRows[K]> } = {
  vaccination_register: VACCINATION_REGISTER,
  treatment_register: TREATMENT_REGISTER,
  disease_history: DISEASE_HISTORY,
  mortality_register: MORTALITY_REGISTER,
  movement_log: MOVEMENT_LOG,
};

/**
 * A register holding its rows only to hand them back to itself: everything the Inspector View does with one,
 * with what a row actually holds forgotten.
 *
 * A name that is still any of five indexes the list above to a register of all five, which TypeScript will not
 * let anything be read out of. It does not need to: what the rows hold is the register's own business, and its
 * period, its paper, its CSV and what its Export keeps are all worked out by the register itself. Only the
 * screen needs them by name, and `rowsAnswer` is where they are said.
 */
export interface Paperwork {
  name: RegisterName;
  /** Whether it prints as a paper, and whether it may be taken away as a spreadsheet. */
  prints: boolean;
  spreadsheet: boolean;
  read: (
    db: Db,
    farmId: string,
    asked: { from?: string; to?: string },
    now: Date
  ) => Promise<{ from: string; to: string; rows: unknown[] }>;
  paper: (
    rows: unknown[],
    period: { from: string; to: string },
    produced: FarmProducing,
    saying: Saying
  ) => string;
  csv: (rows: unknown[]) => string;
  said: (rows: unknown[]) => Record<string, unknown>;
}

/** One register with its rows' type put away. Every row that arrives here came out of this same register's own
 *  reader, which is what makes taking them back as its own rows true. */
const paperwork = <Row>(register: Register<Row>): Paperwork => {
  const its = (rows: unknown[]) => rows as Row[];
  return {
    name: register.name,
    prints: register.paper !== null,
    spreadsheet: hasCsv(register),
    read: (db, farmId, asked, now) =>
      readRegister(register, db, farmId, asked, now),
    paper: (rows, period, produced, saying) =>
      paperOf(register, its(rows), period, produced, saying),
    csv: (rows) => csvOf(register, its(rows)),
    said: (rows) => register.said(its(rows)),
  };
};

const PAPERWORK: Record<RegisterName, Paperwork> = {
  vaccination_register: paperwork(VACCINATION_REGISTER),
  treatment_register: paperwork(TREATMENT_REGISTER),
  disease_history: paperwork(DISEASE_HISTORY),
  mortality_register: paperwork(MORTALITY_REGISTER),
  movement_log: paperwork(MOVEMENT_LOG),
};

/** The register a name belongs to, ready to be read, printed and recorded. */
export const registerNamed = (name: RegisterName): Paperwork => PAPERWORK[name];

/** A register's rows as an answer says them: with the name of the register they came out of, so the screen
 *  that asked knows which rows it is holding. */
export type RowsAnswer = {
  [K in RegisterName]: {
    register: K;
    from: string;
    to: string;
    rows: RegisterRows[K][];
  };
}[RegisterName];

/** The rows a register was read for, paired with its name. The list above is what makes the pairing true; the
 *  name narrowed nothing on the way through `registerNamed`, so it is said again here. */
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
