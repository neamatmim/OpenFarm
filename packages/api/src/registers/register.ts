import type { Database } from "@OpenFarm/db";
import type {
  FarmIdentity,
  HealthRegister,
  PaperDocument,
  Said,
} from "@OpenFarm/domain";
import { farmDayOf, registerDocument, startOfFarmDay } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";

import { toCsv } from "../csv";
import { periodOf } from "../period";

/** As much of the database as a register needs: it reads, and writes nothing. */
export type Db = Pick<Database, "query">;

/** Everything an inspector asks for by period: the four health registers, and the movement log. */
export const REGISTER_NAMES = [
  "vaccination_register",
  "treatment_register",
  "disease_history",
  "mortality_register",
  "movement_log",
] as const satisfies readonly (HealthRegister | "movement_log")[];
export type RegisterName = (typeof REGISTER_NAMES)[number];

/** The farm days a register covers, and the instants they run between. */
export interface Period {
  from: string;
  to: string;
  range: { from: Date; until: Date };
}

/** How a register's values are said in one of the farm's languages: a paper is written in each, and read in one. */
export interface Saying {
  /** A farm day in this language. */
  day: (farmDay: string) => string;
  /** A label or a word of the farm's in this language. */
  word: (key: MessageKey) => string;
  /** A figure in this language's digits. */
  figure: (value: number) => string;
}

/**
 * One column of a register: what the paper calls it and says on its line, what the CSV heads it and holds
 * under that heading, or both.
 *
 * The two faces are declared together and in one order because that is where they disagree, and the
 * disagreement is the point: the paper says "Disposal: Burned — খামারের পেছনে" in words, in whichever of the
 * farm's languages it is read in, and the CSV says `burned` and the note beside it in the DLS template's columns. A column
 * with no paper face is one the CSV alone carries; one with no CSV face is the paper's alone.
 */
export interface Column<Row> {
  paper?: {
    bn: string;
    en: string;
    /** What the line says — null for a row that leaves the line out altogether. */
    said: (row: Row, saying: Saying) => string | null;
  };
  csv?: {
    header: string;
    value: (row: Row) => string | number | null;
  };
}

/**
 * One of the registers the farm keeps for an inspector, declared once: how far back it looks, how it is read
 * out of the database, what it is called, and its columns.
 *
 * The paper, the CSV, the period it covers and what the Export keeps of it are all worked out from this, so a
 * seventh register is a seventh file rather than a seventh set of edits spread over the codebase.
 */
export interface Register<Row> {
  name: RegisterName;
  /** How far back it looks when nobody names a first day, counting the last day of the period. */
  looksBack: { months: number; days: number };
  read: (
    db: Db,
    farmId: string,
    range: { from: Date; until: Date }
  ) => Promise<Row[]>;
  /** How it prints: its title, what it says for a period holding nothing, and the line a row is headed by.
   *  Null for the movement log, which is only ever a spreadsheet.
   *
   *  The words are the paper's own, not the screen's, although the screen has its own for the same registers.
   *  A paper the farm may have to produce years later should not be retitled by somebody rewording a heading
   *  on a page. What a column *says* is a different matter: a Disposal or a Route is the farm's word for the
   *  thing, and both read it from the same place. */
  paper: {
    title: { bn: string; en: string };
    none: { bn: string; en: string };
    heading: (row: Row, saying: Saying) => string;
  } | null;
  columns: Column<Row>[];
  /** What the Export keeps of what this register said, beside the period and the Registration number. */
  kept: (rows: Row[]) => Record<string, unknown>;
}

/** Nothing written where a name, a number or a date was expected, as every paper the farm hands over writes
 *  it. The CSV leaves the cell empty instead, because a spreadsheet counts an em dash as a value. */
export const NOTHING = "—";

/** A year back, the last day counted: what comes round or adds up yearly — vaccinations, since FMD and
 *  anthrax come round yearly, deaths, and movements. */
export const A_YEAR_BACK = { months: -12, days: 1 };

/** A farm day moved by calendar months, then days — the 10th of April six months back and a day on is the 11th
 *  of October. A month too short for the day ends it: the 31st of August six months back is the 29th of
 *  February, never March. */
const dayMoved = (day: string, { months = 0, days = 0 }) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const monthIndex = month - 1 + months;
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const moved = new Date(
    Date.UTC(year, monthIndex, Math.min(date, lastOfMonth) + days)
  );
  return moved.toISOString().slice(0, "YYYY-MM-DD".length);
};

/** The period a register covers: the one asked for, a missing first day its own look-back from the last, a
 *  missing last day today — refused when it runs backwards or past a year. */
export const periodCovered = <Row>(
  register: Register<Row>,
  asked: { from?: string; to?: string },
  now: Date
): Period => {
  const to = asked.to ?? farmDayOf(now);
  const from = asked.from ?? dayMoved(to, register.looksBack);
  return { from, to, range: periodOf({ from, to }) };
};

/** A register's rows for a period, with the days that period turned out to be. */
export const readRegister = async <Row>(
  register: Register<Row>,
  db: Db,
  farmId: string,
  asked: { from?: string; to?: string },
  now: Date
): Promise<{ from: string; to: string; rows: Row[] }> => {
  const period = periodCovered(register, asked, now);
  return {
    from: period.from,
    to: period.to,
    rows: await register.read(db, farmId, period.range),
  };
};

/** How the farm says things in one of its languages. */
export const sayingIn = (language: Language): Saying => ({
  day: (farmDay) => formatDate(startOfFarmDay(farmDay), language, "date"),
  word: (key) => translate(language, key),
  figure: (value) => formatNumber(value, language),
});

/** The farm's two languages' sayings, which every paper is written in. */
const SAYINGS = { bn: sayingIn("bn"), en: sayingIn("en") };

/** Who produced a paper, on what farm, and when — the stamp the report set asks of every paper the farm
 *  hands over, so that two copies of one register can be told apart. */
export interface FarmProducing {
  farm: FarmIdentity;
  by: string;
  at: Said;
}

/** A register as the paper an inspector is handed: each entry and each of its fields said in both of the farm's
 *  languages, read in either; a field a row leaves out is left out in both. */
export const paperOf = <Row>(
  register: Register<Row>,
  rows: Row[],
  period: { from: string; to: string },
  produced: FarmProducing
): PaperDocument => {
  const shape = register.paper;
  if (!shape) {
    throw new Error(`${register.name} is not a register that prints`);
  }
  return registerDocument({
    farm: produced.farm,
    title: shape.title,
    from: period.from,
    to: period.to,
    none: shape.none,
    records: rows.map((row) => ({
      heading: {
        bn: shape.heading(row, SAYINGS.bn),
        en: shape.heading(row, SAYINGS.en),
      },
      fields: register.columns.flatMap((column) => {
        if (!column.paper) {
          return [];
        }
        const bn = column.paper.said(row, SAYINGS.bn);
        const en = column.paper.said(row, SAYINGS.en);
        return bn === null || en === null
          ? []
          : [
              {
                label: { bn: column.paper.bn, en: column.paper.en },
                value: { bn, en },
              },
            ];
      }),
    })),
    producedAt: produced.at,
    producedBy: produced.by,
  });
};

/** Whether a register may be taken away as a CSV: it may when its columns say what a spreadsheet would hold. */
export const hasCsv = <Row>(register: Register<Row>): boolean =>
  register.columns.some((column) => column.csv !== undefined);

/** A register as a CSV, in its columns' order: the values a spreadsheet holds, not the words a reader reads. */
export const csvOf = <Row>(register: Register<Row>, rows: Row[]): string =>
  toCsv(
    register.columns.flatMap((column) =>
      column.csv ? [column.csv.header] : []
    ),
    rows.map((row) =>
      register.columns.flatMap((column) =>
        column.csv ? [column.csv.value(row)] : []
      )
    )
  );
