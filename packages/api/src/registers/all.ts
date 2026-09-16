import { DISEASE_HISTORY } from "./disease-history";
import { MORTALITY_REGISTER } from "./mortality";
import { MOVEMENT_LOG } from "./movement-log";
import type {
  Db,
  FarmProducing,
  Register,
  RegisterName,
  Saying,
} from "./register";
import { csvOf, hasCsv, paperOf, readRegister } from "./register";
import { TREATMENT_REGISTER } from "./treatment";
import { VACCINATION_REGISTER } from "./vaccination";

/**
 * A register holding its rows only to hand them back to itself: everything the Inspector View does with one,
 * with what a row actually holds forgotten.
 *
 * A name that is still any of five indexes the list above to a register of all five, which TypeScript will not
 * let anything be read out of. It does not need to: what the rows hold is the register's own business, and its
 * period, its paper, its CSV and what its Export keeps are all worked out by the register itself. Only the
 * screen needs them by name, and `rowsAnswer` is where they are said.
 *
 * The rows are `unknown[]` on the way through, which is as loose as it sounds: handing one register's rows to
 * another compiles, and prints the wrong thing. They are read and handed back within a few lines of one
 * another, off the one register a request named, and nowhere else.
 */
export interface Paperwork<Row = unknown> {
  name: RegisterName;
  /** Never set, and never read: what one of this register's rows holds, remembered so that the list of
   *  registers can say which rows an answer is carrying without anybody keeping a second list of them. */
  readonly row?: Row;
  /** Whether it prints as a paper, and whether it may be taken away as a spreadsheet. */
  prints: boolean;
  savesAsCsv: boolean;
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
  /** What the Export keeps of what this register said. */
  kept: (rows: unknown[]) => Record<string, unknown>;
}

/** One register with its rows' type put away. Every row that arrives here came out of this same register's own
 *  reader, which is what makes taking them back as its own rows true. */
const paperwork = <Row>(register: Register<Row>): Paperwork<Row> => {
  const its = (rows: unknown[]) => rows as Row[];
  return {
    name: register.name,
    prints: register.paper !== null,
    savesAsCsv: hasCsv(register),
    read: (db, farmId, asked, now) =>
      readRegister(register, db, farmId, asked, now),
    paper: (rows, period, produced, saying) =>
      paperOf(register, its(rows), period, produced, saying),
    csv: (rows) => csvOf(register, its(rows)),
    kept: (rows) => register.kept(its(rows)),
  };
};

/**
 * Every register the farm keeps for an inspector, each declared in a file of its own.
 *
 * This list and the files it names are the whole of what a register is: its period, its paper, its
 * spreadsheet, the Export that records it and the rows the Inspector View lists are all worked out from here.
 * A seventh register is a file of its own, its name in `REGISTER_NAMES`, a line here — and a section on the
 * screen, because what a person reads off a register is a decision about a screen.
 */
const REGISTERS = {
  vaccination_register: paperwork(VACCINATION_REGISTER),
  treatment_register: paperwork(TREATMENT_REGISTER),
  disease_history: paperwork(DISEASE_HISTORY),
  mortality_register: paperwork(MORTALITY_REGISTER),
  movement_log: paperwork(MOVEMENT_LOG),
};

/** What each register's rows hold, remembered by the list itself rather than said again here. */
export type RegisterRows = {
  [K in keyof typeof REGISTERS]: NonNullable<(typeof REGISTERS)[K]["row"]>;
};

/** The register a name belongs to, ready to be read, printed and recorded. */
export const registerNamed = (name: RegisterName): Paperwork => REGISTERS[name];
