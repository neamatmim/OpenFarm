import type {
  HealthRegister,
  InspectorRegister,
  LiveState,
} from "@OpenFarm/domain";
import {
  INSPECTOR_REGISTERS,
  LIVE_STATES,
  REGISTERS_WITH_CSV,
  SIDES,
  diseaseHistory,
  farmDayOf,
  herdSummary,
  identityView,
  isLiveState,
  registrationRecord,
  registrationStanding,
  startOfFarmDay,
  treatmentRegister,
  vaccinationRegister,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { toCsv } from "../csv";
import { assertRegistered, recordExport } from "../export-store";
import type {
  DiagnosisLine,
  TreatmentLine,
  VaccinationLine,
} from "../health-register-store";
import {
  diagnosesBetween,
  lookBackFrom,
  treatmentsBetween,
  vaccinationsBetween,
} from "../health-register-store";
import { protectedProcedure } from "../index";
import { periodInput, periodOf } from "../period";
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

/** A period as a register is asked for it: either day may be left out for the register's own look-back. */
const askedPeriodInput = z.object({
  from: periodInput.from.optional(),
  to: periodInput.to.optional(),
});
type AskedPeriod = z.infer<typeof askedPeriodInput>;

/** The period a health register covers: the one asked for, a missing first day its look-back from the last, a
 *  missing last day today — refused when it runs backwards or past a year. */
const registerPeriod = (
  register: HealthRegister,
  asked: AskedPeriod,
  now: Date
) => {
  const to = asked.to ?? farmDayOf(now);
  const period = { from: asked.from ?? lookBackFrom(register, to), to };
  return { ...period, range: periodOf(period) };
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

/** The vaccination register as a CSV, in the report set's order: plain words and farm days for a spreadsheet. */
const vaccinationCsv = (doses: readonly VaccinationLine[]) =>
  toCsv(
    ["tag", "vaccine", "date", "lot_number", "given_by"],
    doses.map((one) => [
      one.tagNumber,
      one.vaccine,
      one.givenOn,
      one.lotNumber,
      one.givenBy,
    ])
  );

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

/** A register as made: the paper, the CSV when it has one, the period it covers when it covers one, and what
 *  it said for the trail to keep. */
interface Made {
  text: string;
  csv?: string;
  period?: { from: string; to: string };
  said: Record<string, unknown>;
}

/**
 * The Inspector View's registers as papers, each in the language of whoever is producing it, with what the paper
 * said for the trail to keep: the Registration it showed, the herd it counted, or how many doses
 * or diagnoses it listed. The treatment register is also given as a CSV.
 */
const PAPERS: Record<
  InspectorRegister,
  (context: Producing, language: Language, asked: AskedPeriod) => Promise<Made>
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
  vaccination_register: async (context, language, asked) => {
    const period = registerPeriod(
      "vaccination_register",
      asked,
      context.clock.now()
    );
    const doses = await vaccinationsBetween(
      context.db,
      context.farm.id,
      period.range
    );
    return {
      text: vaccinationRegister({
        farm: context.farm,
        from: daySaid(period.from, language),
        to: daySaid(period.to, language),
        doses: doses.map((one) => ({
          ...one,
          givenOn: daySaid(one.givenOn, language),
        })),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      csv: vaccinationCsv(doses),
      period,
      said: {
        doses: doses.length,
        withoutLot: doses.filter((one) => one.lotNumber === null).length,
      },
    };
  },
  treatment_register: async (context, language, asked) => {
    const period = registerPeriod(
      "treatment_register",
      asked,
      context.clock.now()
    );
    const doses = await treatmentsBetween(
      context.db,
      context.farm.id,
      period.range
    );
    return {
      text: treatmentRegister({
        farm: context.farm,
        from: daySaid(period.from, language),
        to: daySaid(period.to, language),
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
      period,
      said: { doses: doses.length },
    };
  },
  disease_history: async (context, language, asked) => {
    const period = registerPeriod(
      "disease_history",
      asked,
      context.clock.now()
    );
    const diagnoses = await diagnosesBetween(
      context.db,
      context.farm.id,
      period.range
    );
    return {
      text: diseaseHistory({
        farm: context.farm,
        from: daySaid(period.from, language),
        to: daySaid(period.to, language),
        diagnoses: diagnoses.map((one) => ({
          ...one,
          diagnosedOn: daySaid(one.diagnosedOn, language),
          outcome: outcomeSaid(one.outcome, language),
        })),
        producedBy: context.actor.name,
        producedAt: formatDate(context.clock.now(), language, "dateTime"),
      }),
      period,
      said: {
        diagnoses: diagnoses.length,
        notifiable: diagnoses.filter((one) => one.notifiable).length,
      },
    };
  },
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
   * R3, the vaccination register: every vaccine dose in a period — a year back from today unless asked — per
   * animal, with the vaccine, the day, the Lot Number it came from, and who gave it. The Owner's and the
   * Manager's, from their own phones.
   */
  vaccinations: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(askedPeriodInput)
    .handler(async ({ context, input }) => {
      const period = registerPeriod(
        "vaccination_register",
        input,
        context.clock.now()
      );
      return {
        from: period.from,
        to: period.to,
        rows: await vaccinationsBetween(
          context.db,
          context.farm.id,
          period.range
        ),
      };
    }),

  /**
   * R4, the treatment register: every dose in a period — thirty days back from today unless asked — with the
   * diagnosis, drug, dose and route, the course, who gave it, the prescribing Vet, and when the milk and meat
   * were clear. The Owner's and the Manager's, from their own phones.
   */
  treatments: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(askedPeriodInput)
    .handler(async ({ context, input }) => {
      const period = registerPeriod(
        "treatment_register",
        input,
        context.clock.now()
      );
      return {
        from: period.from,
        to: period.to,
        rows: await treatmentsBetween(
          context.db,
          context.farm.id,
          period.range
        ),
      };
    }),

  /**
   * R5, the disease history: every diagnosis in a period — six months back from today unless asked — with the
   * notifiable ones marked and their reference, and what became of the animal since.
   */
  diseases: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(askedPeriodInput)
    .handler(async ({ context, input }) => {
      const period = registerPeriod(
        "disease_history",
        input,
        context.clock.now()
      );
      return {
        from: period.from,
        to: period.to,
        rows: await diagnosesBetween(context.db, context.farm.id, period.range),
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
      askedPeriodInput.extend({
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
      await recordExport(context, input.report, made.period ?? null, {
        format: input.format,
        ...made.said,
      });
      // A CSV carries its period, so the file it is saved as can say what it covers.
      return input.format === "csv"
        ? { csv: made.csv, period: made.period }
        : { text: made.text };
    }),
};
