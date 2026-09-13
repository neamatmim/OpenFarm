import type { Side } from "@OpenFarm/domain";
import {
  LIVE_STATES,
  farmDayOf,
  herdSummary,
  identityView,
  isExitState,
  registrationRecord,
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

type FarmContext = Context & { farm: NonNullable<Context["farm"]> };

type State = (typeof LIVE_STATES)[number];

const SIDES: readonly Side[] = ["dairy", "fattening"];

/** The farm's Registration as the Inspector View shows it: the record, where it stands, and its certificate. */
const registrationOf = async (context: FarmContext) => {
  const now = context.clock.now();
  const view = identityView(
    context.farm,
    now,
    context.farm.registrationRenewalLeadDays
  );
  const [certificate] = await certificatesOf(context.db, context.farm.id);
  return {
    number: view.registrationNumber,
    office: view.registrationOffice,
    issuedOn: view.registrationIssuedOn,
    expiresOn: view.registrationExpiresOn,
    expired: view.registrationExpired,
    endingSoon: view.registrationEndingSoon,
    certificate: certificate
      ? { id: certificate.id, takenAt: certificate.takenAt }
      : null,
  };
};

/**
 * Every animal on the farm today, counted by Side and State and by Pen. Animals that have gone keep the Pen
 * they were last in, so they are left out by their State, not by where they were.
 */
const herdOf = async (context: FarmContext) => {
  const animals = await context.db.query.animal.findMany({
    where: { farmId: context.farm.id },
    columns: { side: true, state: true, penId: true },
    with: {
      pen: {
        columns: { id: true, name: true },
        with: { shed: { columns: { name: true } } },
      },
    },
  });
  const here = animals.filter((one) => !isExitState(one.state));
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
    {
      penId: string;
      shed: string;
      pen: string;
      byState: Partial<Record<State, number>>;
    }
  >();
  for (const one of here) {
    const line = pens.get(one.penId) ?? {
      penId: one.penId,
      shed: one.pen.shed.name,
      pen: one.pen.name,
      byState: {},
    };
    const state = one.state as State;
    line.byState[state] = (line.byState[state] ?? 0) + 1;
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
const statesSaid = (
  byState: Partial<Record<State, number>>,
  language: Language
) =>
  LIVE_STATES.flatMap((state) => {
    const count = byState[state];
    return count
      ? [`${bothLanguages(`state.${state}`)} ${formatNumber(count, language)}`]
      : [];
  }).join(" · ");

/** The two registers' papers, each in the language of whoever is producing it. */
const PAPERS = {
  registration: async (
    context: FarmContext & { actor: { name: string } },
    language: Language
  ) => {
    const registration = await registrationOf(context);
    const day = (at: Date | null) =>
      at ? formatDate(at, language, "date") : null;
    let standing: "valid" | "ending_soon" | "expired" | "unknown" = "valid";
    if (registration.expiresOn === null) {
      standing = "unknown";
    } else if (registration.expired) {
      standing = "expired";
    } else if (registration.endingSoon) {
      standing = "ending_soon";
    }
    return registrationRecord({
      farm: context.farm,
      office: registration.office,
      issuedOn: day(registration.issuedOn),
      expiresOn: day(registration.expiresOn),
      standing,
      certificateTakenOn: day(registration.certificate?.takenAt ?? null),
      producedBy: context.actor.name,
      producedAt: formatDate(context.clock.now(), language, "dateTime"),
    });
  },
  herd_summary: async (
    context: FarmContext & { actor: { name: string } },
    language: Language
  ) => {
    const herd = await herdOf(context);
    const count = (n: number) => formatNumber(n, language);
    return herdSummary({
      farm: context.farm,
      asOf: formatDate(herd.asOf, language, "date"),
      total: count(herd.total),
      bySide: SIDES.flatMap((side) => {
        const lines = herd.bySideAndState.filter((line) => line.side === side);
        if (lines.length === 0) {
          return [];
        }
        return [
          {
            label: bothLanguages(`animals.side.${side}`),
            animals: count(lines.reduce((sum, line) => sum + line.animals, 0)),
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
    });
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
      today: farmDayOf(context.clock.now()),
    })),

  /**
   * One of the Inspector View's registers as a paper, headed by the farm and stamped with who produced it and
   * when. Every print is an Export; a farm without its Registration number is told so instead.
   */
  print: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ report: z.enum(["registration", "herd_summary"]) }))
    .handler(async ({ context, input }) => {
      assertRegistered(context.farm, "a register for an inspector");
      const language = await languageOf(context.db, context.actor.id);
      const text = await PAPERS[input.report](context, language);
      await recordExport(context, input.report, null, {
        day: farmDayOf(context.clock.now()),
      });
      return { text };
    }),
};
