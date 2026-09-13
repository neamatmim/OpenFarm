import type { InspectorRegister, LiveState } from "@OpenFarm/domain";
import {
  INSPECTOR_REGISTERS,
  LIVE_STATES,
  REGISTERS_WITH_CSV,
  SIDES,
  diseaseHistory,
  herdSummary,
  identityView,
  isLiveState,
  registrationRecord,
  registrationStanding,
  startOfFarmDay,
  treatmentRegister,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { toCsv } from "../csv";
import { assertRegistered, recordExport } from "../export-store";
import { farmDay } from "../farm-clock";
import type { DiagnosisLine, TreatmentLine } from "../health-register-store";
import {
  defaultWindow,
  diagnosesBetween,
  treatmentsBetween,
} from "../health-register-store";
import { protectedProcedure } from "../index";
import { periodOf } from "../period";
import { languageOf } from "../reader-language";
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

/** A window a register was asked for. */
interface Asked {
  from?: string;
  to?: string;
}

/** A window as asked for over the wire: either day may be left out for the register's own look-back. */
const windowInput = z.object({
  from: farmDay.optional(),
  to: farmDay.optional(),
});

/** The window a health register covers: the one asked for, or its look-back, refused when it runs backwards or
 *  past a year. */
const windowOf = (
  register: "treatment_register" | "disease_history",
  asked: Asked,
  now: Date
) => {
  const standard = defaultWindow(register, now);
  const window = {
    from: asked.from ?? standard.from,
    to: asked.to ?? standard.to,
  };
  return { ...window, range: periodOf(window) };
};

/** A farm day as a paper writes it, in the reader's language. */
const daySaid = (day: string, language: Language) =>
  formatDate(startOfFarmDay(day), language, "date");

/** What became of an animal since her diagnosis, in both languages. */
const outcomeSaid = (
  outcome: DiagnosisLine["outcome"],
  language: Language
): string => {
  if (outcome.kind === "on_the_farm") {
    return bothLanguages("inspector.onTheFarm");
  }
  const gone = bothLanguages(`state.${outcome.kind}`);
  return outcome.on ? `${gone} ${daySaid(outcome.on, language)}` : gone;
};

/** The treatment register as a CSV, in the DLS template's order: plain words and farm days for a spreadsheet. */
const treatmentCsv = (doses: readonly TreatmentLine[]) =>
  toCsv(
    [
      "date",
      "tag",
      "diagnosis",
      "drug",
      "dose",
      "route",
      "course",
      "given_by",
      "prescribed_by",
      "milk_withdrawal_ends",
      "meat_withdrawal_ends",
    ],
    doses.map((one) => [
      one.givenOn,
      one.tagNumber,
      one.diagnosis,
      one.drug,
      one.dose,
      one.route,
      one.course,
      one.givenBy,
      one.prescribedBy,
      one.milkClearOn,
      one.meatClearOn,
    ])
  );

/**
 * The Inspector View's registers as papers, each in the language of whoever is producing it, with what the paper
 * said for the trail to keep: the Registration it showed, the herd it counted, or the window and how many doses
 * or diagnoses it listed. The treatment register is also given as a CSV.
 */
const PAPERS = {
  registration: async (
    context: Producing,
    language: Language,
    _asked: Asked
  ) => {
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
  herd_summary: async (
    context: Producing,
    language: Language,
    _asked: Asked
  ) => {
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
  treatment_register: async (
    context: Producing,
    language: Language,
    asked: Asked
  ) => {
    const window = windowOf("treatment_register", asked, context.clock.now());
    const doses = await treatmentsBetween(
      context.db,
      context.farm.id,
      window.range
    );
    return {
      text: treatmentRegister({
        farm: context.farm,
        from: daySaid(window.from, language),
        to: daySaid(window.to, language),
        doses: doses.map((one) => ({
          ...one,
          givenOn: daySaid(one.givenOn, language),
          route: one.route ? bothLanguages(`route.${one.route}`) : null,
          milkClearOn: one.milkClearOn && daySaid(one.milkClearOn, language),
          meatClearOn: one.meatClearOn && daySaid(one.meatClearOn, language),
        })),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      csv: treatmentCsv(doses),
      said: { from: window.from, to: window.to, doses: doses.length },
    };
  },
  disease_history: async (
    context: Producing,
    language: Language,
    asked: Asked
  ) => {
    const window = windowOf("disease_history", asked, context.clock.now());
    const diagnoses = await diagnosesBetween(
      context.db,
      context.farm.id,
      window.range
    );
    return {
      text: diseaseHistory({
        farm: context.farm,
        from: daySaid(window.from, language),
        to: daySaid(window.to, language),
        diagnoses: diagnoses.map((one) => ({
          ...one,
          diagnosedOn: daySaid(one.diagnosedOn, language),
          outcome: outcomeSaid(one.outcome, language),
        })),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      said: {
        from: window.from,
        to: window.to,
        diagnoses: diagnoses.length,
        notifiable: diagnoses.filter((one) => one.notifiable).length,
      },
    };
  },
} satisfies Record<
  InspectorRegister,
  (
    context: Producing,
    language: Language,
    asked: Asked
  ) => Promise<{ text: string; csv?: string; said: Record<string, unknown> }>
>;

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
   * R4, the treatment register: every dose in a window — thirty days back from today unless asked — with the
   * diagnosis, drug, dose and route, the course, who gave it, the prescribing Vet, and when the milk and meat
   * were clear. The Owner's and the Manager's, from their own phones.
   */
  treatments: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(windowInput)
    .handler(async ({ context, input }) => {
      const window = windowOf("treatment_register", input, context.clock.now());
      return {
        from: window.from,
        to: window.to,
        rows: await treatmentsBetween(
          context.db,
          context.farm.id,
          window.range
        ),
      };
    }),

  /**
   * R5, the disease history: every diagnosis in a window — six months back from today unless asked — with the
   * notifiable ones marked and their reference, and what became of the animal since.
   */
  diseases: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(windowInput)
    .handler(async ({ context, input }) => {
      const window = windowOf("disease_history", input, context.clock.now());
      return {
        from: window.from,
        to: window.to,
        rows: await diagnosesBetween(context.db, context.farm.id, window.range),
      };
    }),

  /**
   * One of the Inspector View's registers as a paper, headed by the farm and stamped with who produced it and
   * when. Every print is an Export that keeps what the paper said; a farm without its Registration number is
   * told so instead.
   */
  print: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      windowInput.extend({
        report: z.enum(INSPECTOR_REGISTERS),
        format: z.enum(["paper", "csv"]).default("paper"),
      })
    )
    .handler(async ({ context, input }) => {
      if (
        input.format === "csv" &&
        !REGISTERS_WITH_CSV.includes(input.report)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That register is printed, not given as a CSV",
          data: { refusal: "register_has_no_csv" },
        });
      }
      assertRegistered(context.farm, "a register for an inspector");
      const language = await languageOf(context.db, context.actor.id);
      const made = await PAPERS[input.report](context, language, input);
      await recordExport(context, input.report, null, {
        format: input.format,
        ...made.said,
      });
      return input.format === "csv" && "csv" in made
        ? { csv: made.csv }
        : { text: made.text };
    }),
};
