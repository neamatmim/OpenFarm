import type { InspectorRegister, LiveState } from "@OpenFarm/domain";
import {
  INSPECTOR_REGISTERS,
  LIVE_STATES,
  SIDES,
  herdSummary,
  identityView,
  isLiveState,
  registrationRecord,
  registrationStanding,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { assertRegistered, recordExport } from "../export-store";
import { protectedProcedure } from "../index";
import { periodInput } from "../period";
import { languageOf } from "../reader-language";
import { registerNamed, rowsAnswer } from "../registers/all";
import type { RegisterName } from "../registers/register";
import { REGISTER_NAMES, sayingIn } from "../registers/register";
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

/** A label in both of the farm's languages, as every paper it hands over writes one. */
const bothLanguages = (key: Parameters<typeof translate>[1]) =>
  `${translate("bn", key)} / ${translate("en", key)}`;

/** Each State with its count, in both languages and the reader's digits. */
const statesSaid = (byState: ByState, language: Language) =>
  LIVE_STATES.flatMap((state) => {
    const count = byState[state];
    return count
      ? [`${bothLanguages(`state.${state}`)} ${formatNumber(count, language)}`]
      : [];
  }).join(" · ");

/** A period as a register is asked for it: either day may be left out for the register's own look-back. */
const askedPeriodInput = z.object({
  from: periodInput.from.optional(),
  to: periodInput.to.optional(),
});
type AskedPeriod = z.infer<typeof askedPeriodInput>;

/** A paper as written: the paper itself, and what it said for the trail to keep. */
interface Made {
  text: string;
  said: Record<string, unknown>;
}

/** The two the Inspector View writes by hand: what the farm is, and what stands on it today. Neither is a
 *  list of rows over a period, so neither is a Register. */
type HandWritten = Exclude<InspectorRegister, RegisterName>;

/**
 * The Registration and the herd summary as papers, each in the language of whoever is producing it, with what
 * the paper said for the trail to keep: the Registration it showed, or the herd it counted.
 */
const PAPERS: Record<
  HandWritten,
  (context: Producing, language: Language) => Promise<Made>
> = {
  registration: async (context, language) => {
    const registration = await registrationOf(context);
    const day = (at: Date | null) =>
      at ? formatDate(at, language, "date") : null;
    return {
      text: registrationRecord({
        farm: context.farm,
        office: registration.office,
        issuedOn: day(registration.issuedOn),
        expiresOn: day(registration.expiresOn),
        standing: registration.standing,
        certificateTakenOn: day(registration.certificate?.takenAt ?? null),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      said: {
        expiresOn: registration.expiresOn?.toISOString() ?? null,
        standing: registration.standing,
        certificateId: registration.certificate?.id ?? null,
      },
    };
  },
  herd_summary: async (context, language) => {
    const herd = await herdOf(context);
    const count = (n: number) => formatNumber(n, language);
    return {
      text: herdSummary({
        farm: context.farm,
        asOf: formatDate(herd.asOf, language, "date"),
        total: count(herd.total),
        bySide: SIDES.flatMap((side) => {
          const lines = herd.bySideAndState.filter(
            (line) => line.side === side
          );
          if (lines.length === 0) {
            return [];
          }
          return [
            {
              label: bothLanguages(`animals.side.${side}`),
              animals: count(
                lines.reduce((sum, line) => sum + line.animals, 0)
              ),
              states: statesSaid(
                Object.fromEntries(
                  lines.map((line) => [line.state, line.animals])
                ),
                language
              ),
            },
          ];
        }),
        byPen: herd.byPen.map((line) => ({
          label: `${line.shed} / ${line.pen}`,
          animals: count(line.animals),
          states: statesSaid(line.byState, language),
        })),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      said: { animals: herd.total, pens: herd.byPen.length },
    };
  },
};

/** Everything the Inspector View hands over: the registers it prints, and the movement log, which is only ever
 *  a spreadsheet. */
const PRINTABLE = [...INSPECTOR_REGISTERS, "movement_log"] as const;
type Printable = (typeof PRINTABLE)[number];

/** Whether a name is one of the registers declared under `registers/`, or one of the two papers above. */
const isRegister = (name: Printable): name is RegisterName =>
  name !== "registration" && name !== "herd_summary";

/** A register asked for in a way it cannot be given: the disease history has no spreadsheet, and the movement
 *  log is not a paper anybody would read. */
const refuse = (missing: "csv" | "paper") => {
  throw new ORPCError("BAD_REQUEST", {
    message:
      missing === "csv"
        ? "That register is printed, not given as a CSV"
        : "That register is a spreadsheet, not a paper",
    data: { refusal: `register_has_no_${missing}` },
  });
};

/** What an inspector is handed, and what the Export keeps of it: the paper or the CSV, and the period it
 *  covers when it covers one. */
interface HandedOver {
  text?: string;
  csv?: string;
  period: { from: string; to: string } | null;
  said: Record<string, unknown>;
}

const handOver = async (
  context: Producing,
  asked: AskedPeriod & { register: Printable; format: "paper" | "csv" },
  language: Language
): Promise<HandedOver> => {
  if (!isRegister(asked.register)) {
    if (asked.format === "csv") {
      refuse("csv");
    }
    const made = await PAPERS[asked.register](context, language);
    return { ...made, period: null };
  }
  const register = registerNamed(asked.register);
  const found = await register.read(
    context.db,
    context.farm.id,
    asked,
    context.clock.now()
  );
  const period = { from: found.from, to: found.to };
  const said = register.said(found.rows);
  if (asked.format === "csv") {
    if (!register.spreadsheet) {
      refuse("csv");
    }
    return { csv: register.csv(found.rows), period, said };
  }
  if (!register.prints) {
    refuse("paper");
  }
  return {
    text: register.paper(
      found.rows,
      period,
      {
        farm: context.farm,
        by: context.actor.name,
        at: formatDate(context.clock.now(), language, "dateTime"),
      },
      sayingIn(language)
    ),
    period,
    said,
  };
};

export const inspectorRouter = {
  /**
   * The Inspector View: the one screen the Manager shows a DLS inspector on their own phone — the
   * Registration with its certificate, and the herd on the farm today by Side and State and by Pen. The
   * inspector never touches the device; the registers are handed over as papers.
   *
   * The Owner's and the Manager's, from their own phones (roles matrix: compliance reports — R; export).
   */
  view: protectedProcedure
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
      assertRegistered(context.farm, "a register for an inspector");
      const language = await languageOf(context.db, context.actor.id);
      const handed = await handOver(context, input, language);
      await recordExport(context, input.register, handed.period, {
        format: input.format,
        ...handed.said,
      });
      // A CSV carries its period, so the file it is saved as can say what it covers.
      return input.format === "csv"
        ? { csv: handed.csv, period: handed.period }
        : { text: handed.text };
    }),
};
