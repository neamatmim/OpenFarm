import type { LiveState } from "@OpenFarm/domain";
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
import { z } from "zod";

import type { Context } from "../context";
import { assertRegistered, recordExport } from "../export-store";
import { protectedProcedure } from "../index";
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

/**
 * The two registers as papers, each in the language of whoever is producing it, with what the paper said for
 * the trail to keep: the Registration it showed, or the herd it counted.
 */
const PAPERS = {
  registration: async (context: Producing, language: Language) => {
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
  herd_summary: async (context: Producing, language: Language) => {
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
} as const;

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
   * One of the Inspector View's registers as a paper, headed by the farm and stamped with who produced it and
   * when. Every print is an Export that keeps what the paper said; a farm without its Registration number is
   * told so instead.
   */
  print: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ report: z.enum(INSPECTOR_REGISTERS) }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "a register for an inspector");
      const language = await languageOf(context.db, context.actor.id);
      const { text, said } = await PAPERS[input.report](context, language);
      await recordExport(context, input.report, null, said);
      return { text };
    }),
};
