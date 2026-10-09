import type {
  InspectorRegister,
  LiveState,
  PaperDocument,
  Said,
} from "@OpenFarm/domain";
import {
  INSPECTOR_REGISTERS,
  LIVE_STATES,
  SIDES,
  farmDayOf,
  herdSummaryPaper,
  identityView,
  isLiveState,
  registrationPaper,
  registrationStanding,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { stampedFileName } from "../export-name";
import { assertRegistered, recordExport } from "../export-store";
import { protectedProcedure } from "../index";
import { madeOn } from "../paper-values";
import { periodInput } from "../period";
import { registerNamed } from "../registers/all";
import type { RegisterName } from "../registers/register";
import { REGISTER_NAMES } from "../registers/register";
import { rowsAnswer } from "../registers/rows";
import { certificatesOf } from "../registration-store";
import { requirePersonalSession, requireRole } from "../roles";

/** The request a register is produced under: on a farm, by a person. */
type Producing = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: { id: string; name: string };
};

/** The farm's Registration as the Inspector View shows it: the record, where it stands, and its certificate. */
const registrationOf = async (context: Producing) => {
  const view = identityView(
    context.farm,
    context.clock.now(),
    context.farm.registrationRenewalLeadDays
  );
  const [certificate] = await certificatesOf(context.db, context.farm.id);
  return {
    number: view.registrationNumber,
    office: view.registrationOffice,
    issuedOn: view.registrationIssuedOn,
    expiresOn: view.registrationExpiresOn,
    standing: registrationStanding(view),
    certificate: certificate
      ? { id: certificate.id, takenAt: certificate.takenAt }
      : null,
  };
};

/** Each State's count in one Pen. */
type ByState = Partial<Record<LiveState, number>>;

/**
 * Every animal on the farm today, counted by Side and State and by Pen. Animals that have gone keep the Pen
 * they were last in, so they are left out by their State, in the query, not by where they were.
 */
const herdOf = async (context: Producing) => {
  const here = await context.db.query.animal.findMany({
    where: { farmId: context.farm.id, state: { in: [...LIVE_STATES] } },
    columns: { side: true, state: true, penId: true },
    with: {
      pen: {
        columns: { id: true, name: true },
        with: { shed: { columns: { name: true } } },
      },
    },
  });
  const bySideAndState = SIDES.flatMap((side) =>
    LIVE_STATES.flatMap((state) => {
      const count = here.filter(
        (one) => one.side === side && one.state === state
      ).length;
      return count > 0 ? [{ side, state, animals: count }] : [];
    })
  );
  const pens = new Map<
    string,
    { penId: string; shed: string; pen: string; byState: ByState }
  >();
  for (const one of here) {
    if (!isLiveState(one.state)) {
      continue;
    }
    const line = pens.get(one.penId) ?? {
      penId: one.penId,
      shed: one.pen.shed.name,
      pen: one.pen.name,
      byState: {},
    };
    line.byState[one.state] = (line.byState[one.state] ?? 0) + 1;
    pens.set(one.penId, line);
  }
  const byPen = [...pens.values()]
    .map((line) => ({
      ...line,
      animals: Object.values(line.byState).reduce((sum, n) => sum + n, 0),
    }))
    .toSorted(
      (a, b) =>
        a.shed.localeCompare(b.shed) ||
        a.pen.localeCompare(b.pen) ||
        a.penId.localeCompare(b.penId)
    );
  return {
    asOf: context.clock.now(),
    total: here.length,
    bySideAndState,
    byPen,
  };
};

/** The farm day a moment fell on, or nothing where there was none. */
const dayOf = (at: Date | null) => (at ? farmDayOf(at) : null);

/** A word of the farm's in both its languages, for a paper read in either. */
const bothOf = (key: MessageKey): Said => ({
  bn: translate("bn", key),
  en: translate("en", key),
});

/** Each State with its count, as the herd summary tables it. */
const statesOf = (byState: ByState) =>
  LIVE_STATES.flatMap((state) => {
    const count = byState[state];
    return count ? [{ label: bothOf(`state.${state}`), count }] : [];
  });

/** A period as a register is asked for it: either day may be left out for the register's own look-back. */
const askedPeriodInput = z.object({
  from: periodInput.from.optional(),
  to: periodInput.to.optional(),
});
type AskedPeriod = z.infer<typeof askedPeriodInput>;

/** A paper as laid out: the paper itself, and what the Export keeps of what it said. */
interface Made {
  document: PaperDocument;
  kept: Record<string, unknown>;
}

/** The two the Inspector View writes by hand: what the farm is, and what stands on it today. Neither is a
 *  list of rows over a period, so neither is a Register. */
type HandWritten = Exclude<InspectorRegister, RegisterName>;

/**
 * The Registration and the herd summary laid out as papers, read in Bangla or English, with what the paper said for the
 * trail to keep: the Registration it showed, or the herd it counted.
 */
const PAPERS: Record<HandWritten, (context: Producing) => Promise<Made>> = {
  registration: async (context) => {
    const registration = await registrationOf(context);
    return {
      document: registrationPaper({
        farm: context.farm,
        office: registration.office,
        issuedOn: dayOf(registration.issuedOn),
        expiresOn: dayOf(registration.expiresOn),
        standing: registration.standing,
        certificateTakenOn: dayOf(registration.certificate?.takenAt ?? null),
        producedAt: madeOn(context.clock.now()),
        producedBy: context.actor.name,
      }),
      kept: {
        expiresOn: registration.expiresOn?.toISOString() ?? null,
        standing: registration.standing,
        certificateId: registration.certificate?.id ?? null,
      },
    };
  },
  herd_summary: async (context) => {
    const herd = await herdOf(context);
    return {
      document: herdSummaryPaper({
        farm: context.farm,
        asOf: farmDayOf(herd.asOf),
        total: herd.total,
        bySide: SIDES.flatMap((side) => {
          const lines = herd.bySideAndState.filter(
            (line) => line.side === side
          );
          if (lines.length === 0) {
            return [];
          }
          return [
            {
              label: bothOf(`animals.side.${side}`),
              animals: lines.reduce((sum, line) => sum + line.animals, 0),
              states: statesOf(
                Object.fromEntries(
                  lines.map((line) => [line.state, line.animals])
                )
              ),
            },
          ];
        }),
        byPen: herd.byPen.map((line) => ({
          label: `${line.shed} / ${line.pen}`,
          animals: line.animals,
          states: statesOf(line.byState),
        })),
        producedAt: madeOn(context.clock.now()),
        producedBy: context.actor.name,
      }),
      kept: { animals: herd.total, pens: herd.byPen.length },
    };
  },
};

/** Everything the Inspector View hands over: the registers it prints, and the movement log, which is only ever
 *  a spreadsheet. */
const PRINTABLE = [...INSPECTOR_REGISTERS, "movement_log"] as const;
type Printable = (typeof PRINTABLE)[number];

/** Whether a name is one of the registers declared under `registers/`, or one of the two papers above. */
const isRegister = (name: Printable): name is RegisterName =>
  (REGISTER_NAMES as readonly string[]).includes(name);

/** A register asked for in a way it cannot be given: the disease history has no spreadsheet, and the movement
 *  log is not a paper anybody would read. Said before anything is read, because a register the farm cannot
 *  hand over that way is not a register it should be reading a year of first. */
const refuse = (missing: "csv" | "paper") =>
  new ORPCError("BAD_REQUEST", {
    message:
      missing === "csv"
        ? "That register is printed, not given as a CSV"
        : "That register is given as a CSV, not printed",
    data: {
      refusal:
        missing === "csv" ? "register_has_no_csv" : "register_has_no_paper",
    },
  });

/** What the farm can hand this register over as, refused before the farm's own Registration is looked at:
 *  which way round it goes is what main did, and an inspector asking for a spreadsheet nobody makes should
 *  hear that, not that the farm's paperwork is incomplete. */
const assertCanBeGiven = (register: Printable, format: "paper" | "csv") => {
  if (!isRegister(register)) {
    if (format === "csv") {
      throw refuse("csv");
    }
    return;
  }
  const declared = registerNamed(register);
  if (format === "csv" && !declared.savesAsCsv) {
    throw refuse("csv");
  }
  if (format === "paper" && !declared.prints) {
    throw refuse("paper");
  }
};

/** What an inspector is handed, and what the Export keeps of it: the paper or the CSV, and the period it
 *  covers when it covers one. */
interface HandedOver {
  document?: PaperDocument;
  csv?: string;
  period: { from: string; to: string } | null;
  kept: Record<string, unknown>;
}

const handOver = async (
  context: Producing,
  asked: AskedPeriod & { register: Printable; format: "paper" | "csv" }
): Promise<HandedOver> => {
  if (!isRegister(asked.register)) {
    const made = await PAPERS[asked.register](context);
    return { document: made.document, period: null, kept: made.kept };
  }
  const register = registerNamed(asked.register);
  const found = await register.read(
    context.db,
    context.farm.id,
    asked,
    context.clock.now()
  );
  const period = { from: found.from, to: found.to };
  const kept = register.kept(found.rows);
  if (asked.format === "csv") {
    return { csv: register.csv(found.rows), period, kept };
  }
  return {
    document: register.paper(found.rows, period, {
      farm: context.farm,
      by: context.actor.name,
      at: madeOn(context.clock.now()),
    }),
    period,
    kept,
  };
};

export const inspectorViewRouter = {
  /**
   * The Inspector View: the one screen the Manager shows a DLS inspector on their own phone — the
   * Registration with its certificate, and the herd on the farm today by Side and State and by Pen. The
   * inspector never touches the device; the registers are handed over as papers.
   *
   * The Owner's and the Manager's, from their own phones (roles matrix: compliance reports — R; export).
   */
  get: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .handler(async ({ context }) => ({
      registration: await registrationOf(context),
      herd: await herdOf(context),
    })),

  /**
   * One of the registers an inspector asks for by period, as the Inspector View lists it on the screen: the
   * period it turned out to cover — the register's own look-back unless the reader named one — and its rows,
   * oldest first, with the name of the register they came out of.
   *
   * The Owner's and the Manager's, from their own phones.
   */
  rows: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(askedPeriodInput.extend({ register: z.enum(REGISTER_NAMES) }))
    .handler(async ({ context, input }) =>
      rowsAnswer(
        input.register,
        await registerNamed(input.register).read(
          context.db,
          context.farm.id,
          input,
          context.clock.now()
        )
      )
    ),

  /**
   * One of the Inspector View's registers as the inspector is handed it: a paper headed by the farm and
   * stamped with who produced it and when, or the CSV they take away. Every one is an Export that keeps what
   * it said; a farm without its Registration number is told so instead.
   */
  print: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      askedPeriodInput.extend({
        register: z.enum(PRINTABLE),
        format: z.enum(["paper", "csv"]).default("paper"),
      })
    )
    .handler(async ({ context, input }) => {
      assertCanBeGiven(input.register, input.format);
      assertRegistered(context.farm, "a register for an inspector");
      const handed = await handOver(context, input);
      await recordExport(context, input.register, handed.period, {
        format: input.format,
        ...handed.kept,
      });
      // A CSV carries its period, so the file it is saved as can say what it covers.
      return input.format === "csv"
        ? {
            csv: handed.csv,
            period: handed.period,
            fileName: stampedFileName(
              context.farm,
              input.register.replaceAll("_", "-"),
              handed.period,
              context.clock.now()
            ),
          }
        : { document: handed.document };
    }),
};
