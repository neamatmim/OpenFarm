import { uuidv7 } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import type { FarmParameter, ParameterBounds } from "@OpenFarm/domain";
import {
  ALL_FARM_PARAMETERS,
  FARM_PARAMETERS,
  MAX_GRACE_MINUTES,
  STANDARD_KINDS,
  identityView,
  fewestDaysBeforeMilkIsWeighed,
  parametersOwnersAlone,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { pregnancyTimesOf, retimeEveryCalving } from "../breeding-store";
import type { CalvingWorkFollowed } from "../calving-work";
import type { Context } from "../context";
import { dataKeepersInput, readKeepers } from "../data-keepers";
import { farmDay } from "../farm-clock";
import { protectedProcedure, publicProcedure } from "../index";
import { retimePregnancyChecks } from "../instances-store";
import { tell } from "../notice";
import type { OwnersFigure } from "../owners-figures";
import { theOwnersFigures, withoutTheOwnersFigures } from "../owners-figures";
import { photoInput } from "../photo-input";
import { certificatesOf, keepCertificate } from "../registration-store";
import type { RoleName } from "../roles";
import {
  OWNER_ONLY,
  forbidden,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import { scheduleStatus } from "../scheduler";
import { onlyOnAVisit } from "../scope";
import { startWithStandard } from "../standard-store";
import { lockTheFarm } from "../venture-store";

/** A whole number within a Farm Parameter's bounds, as the farm declares them (domain `FARM_PARAMETERS`). */
const withinBounds = ({ min, max }: ParameterBounds) =>
  z.number().int().min(min).max(max).optional();

/** The Farm Parameters a request may name: every number within its declared bounds, and the times of day the Digest
 *  and the quiet hours are kept by. */
const parameters = z
  .object({
    ...(Object.fromEntries(
      Object.entries(FARM_PARAMETERS).map(([key, bounds]) => [
        key,
        withinBounds(bounds),
      ])
    ) as Record<FarmParameter, ReturnType<typeof withinBounds>>),
    digestTimes: z.array(z.string().trim()).min(1).max(6).optional(),
    quietFrom: z.string().trim().optional(),
    quietUntil: z.string().trim().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Nothing to change" }
  );

const identity = z
  .object({
    address: z.string().trim().max(300).nullish(),
    phone: z.string().trim().max(20).nullish(),
    registrationNumber: z.string().trim().max(60).nullish(),
    registrationOffice: z.string().trim().max(200).nullish(),
    /** Days as the certificate prints them, read on the farm's own clock: what a certificate
     *  says is a date, not an instant, and the office in Dhaka and the farm in Savar must
     *  agree on which day it means. */
    registrationIssuedOn: farmDay.nullish(),
    registrationExpiresOn: farmDay.nullish(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Nothing to change" }
  );

/** Every Farm Parameter as a column the trail reads before a change, so a flag raised under an old figure stays
 *  explicable. */
const PARAMETER_COLUMNS = Object.fromEntries(
  ALL_FARM_PARAMETERS.map((key) => [key, true])
) as Record<(typeof ALL_FARM_PARAMETERS)[number], true>;

type ParametersInput = z.infer<typeof parameters>;

/** Refuses a Manager who names a Parameter the Owner alone sets: a Venture's own figures, what the keep-or-sell figures
 *  and culling list read, the checks on the Manager himself, and the lines past which his counts are told. */
const refuseWhatIsTheOwners = (
  input: ParametersInput,
  roles: readonly RoleName[]
) => {
  if (roles.some((role) => role === "owner")) {
    return;
  }
  const named = parametersOwnersAlone("either").filter(
    (key) => input[key] !== undefined
  );
  if (named.length > 0) {
    throw forbidden({
      message: `${named.join(", ")} ${named.length === 1 ? "is" : "are"} the Owner's to set`,
      reason: "owner_only",
    });
  }
};

/**
 * Refuses a Registration that runs out before it was issued, judged with whichever of the two dates the farm already
 * holds: one slip of the year marked the farm's registration expired, raised renewal work, and warned the inspector.
 */
const refuseExpiryBeforeIssue = async (
  tx: Tx,
  farmId: string,
  changes: {
    registrationIssuedOn?: Date | null;
    registrationExpiresOn?: Date | null;
  }
) => {
  if (
    changes.registrationIssuedOn === undefined &&
    changes.registrationExpiresOn === undefined
  ) {
    return;
  }
  const stored = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { registrationIssuedOn: true, registrationExpiresOn: true },
  });
  const issued =
    changes.registrationIssuedOn === undefined
      ? stored?.registrationIssuedOn
      : changes.registrationIssuedOn;
  const expires =
    changes.registrationExpiresOn === undefined
      ? stored?.registrationExpiresOn
      : changes.registrationExpiresOn;
  if (issued && expires && expires < issued) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A registration cannot run out before it was issued",
      data: { refusal: "registration_expires_before_issued" },
    });
  }
};

/** The Owner hears of each change the Manager makes to the farm's settings — how many, and by whom; what each was and is
 *  now is in the trail (the Owner's decision of 2026-10-04). Nothing for the Owner's own changes. */
const tellTheOwnerOfTheChange = async (
  context: {
    roles: readonly RoleName[];
    actor: { name: string };
    farm: { id: string };
    clock: { now: () => Date };
  },
  tx: Tx,
  changes: Record<string, unknown>
) => {
  const count = Object.keys(changes).length;
  if (count === 0 || context.roles.some((role) => role === "owner")) {
    return;
  }
  const now = context.clock.now();
  await tell(
    tx,
    context.farm.id,
    {
      kind: "settings_changed",
      about: { id: uuidv7(now) },
      facts: { name: context.actor.name, count },
    },
    now
  );
};

/**
 * Refuses a milk wait shorter than her calf's days and then the days a keep is read over, as the farm would have the
 * three once this request is saved. Weighed sooner, the days her milk is read over would take in her calf's milk, and
 * every cow fresh from calving would look short of her keep. Said, not moved for the Owner: they are set together or not
 * at all.
 */
const refuseMilkWeighedTooSoon = (
  input: ParametersInput,
  standing: {
    keepReadDays: number;
    cullMilkAfterDays: number;
    cullCalfMilkDays: number;
  }
) => {
  const keepReadDays = input.keepReadDays ?? standing.keepReadDays;
  const milkAfterDays = input.cullMilkAfterDays ?? standing.cullMilkAfterDays;
  const calfMilkDays = input.cullCalfMilkDays ?? standing.cullCalfMilkDays;
  const soonest = fewestDaysBeforeMilkIsWeighed(keepReadDays, calfMilkDays);
  if (milkAfterDays < soonest) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A cow's milk is weighed past her calf's days and the days her keep is read over: ${soonest} days at the soonest`,
      data: { refusal: "milk_weighed_too_soon", soonestDays: soonest },
    });
  }
};

/**
 * Refuses more days here before a keep is judged than the days a keep is read over, as the farm would have the two once
 * this request is saved: no animal could ever have been kept long enough to be judged, and every one would read "too
 * new" for ever. Said, not moved for the Owner: the two are set together or not at all.
 */
const refuseKeepNeededLongerThanRead = (
  input: ParametersInput,
  standing: { keepReadDays: number; keepNeedsDays: number }
) => {
  const readDays = input.keepReadDays ?? standing.keepReadDays;
  const needsDays = input.keepNeedsDays ?? standing.keepNeedsDays;
  if (readDays < needsDays) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal's keep is judged within the days it is read over: ${readDays} days at the most`,
      data: { refusal: "keep_needed_longer_than_read", readDays },
    });
  }
};

/** One advisory lock key for "creating the farm", so concurrent first-run submissions serialise. */
const BOOTSTRAP_LOCK = 7001;

/**
 * Only the fields this request actually named, so a form that sends one line does not blank the
 * rest. A field the caller left out is untouched; one it sent empty is cleared on purpose.
 *
 * `Object.fromEntries` cannot keep the key types, hence the one cast.
 */
const touched = <Fields extends object>(fields: Fields): Partial<Fields> =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<Fields>;

/** A day the caller named, read on the farm's clock. Undefined stays undefined, which is how
 *  `touched` knows the caller left the field alone. */
const onFarmDay = (day: string | null | undefined) =>
  typeof day === "string" ? startOfFarmDay(day) : day;

/** The farm as the trail records it either side of a change. */
const readIdentity = async (tx: Tx, farmId: string) => {
  const row = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      name: true,
      address: true,
      phone: true,
      registrationNumber: true,
      registrationOffice: true,
      registrationIssuedOn: true,
      registrationExpiresOn: true,
    },
  });
  return row ?? null;
};

/** "HH:MM" on the farm's own clock, which is what every time of day here is. */
const TIME_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/**
 * Refuses Parameters that do not hold together, judged against the farm as it stands inside the write, behind the farm
 * lock: two people saving at once — the Manager the AI window's start, the Owner its end — are judged one after the
 * other, so neither leaves a window that shuts before it opens. Each refusal in a word the screen says in Bangla.
 */
const refuseWhatDoesNotHoldTogether = (
  input: ParametersInput,
  standing: NonNullable<Context["farm"]>
) => {
  const cap = input.investorCap ?? standing.investorCap;
  const warnAt = input.investorWarnAt ?? standing.investorWarnAt;
  if (warnAt > cap) {
    // A warning that only arrives after the refusal has already happened is no warning at all.
    throw new ORPCError("BAD_REQUEST", {
      message: "The Investor warning comes before the cap, not after it",
      data: { refusal: "investor_warning_after_cap" },
    });
  }
  refuseMilkWeighedTooSoon(input, standing);
  refuseKeepNeededLongerThanRead(input, standing);
  const opens = input.aiWindowStartHours ?? standing.aiWindowStartHours;
  const closes = input.aiWindowEndHours ?? standing.aiWindowEndHours;
  if (closes <= opens) {
    // A window that shuts before it opens would make every AI job late the moment it was
    // raised, and the farm would learn to ignore the alert that matters most in breeding.
    throw new ORPCError("BAD_REQUEST", {
      message: "The AI window has to close after it opens",
      data: { refusal: "ai_window_backwards" },
    });
  }
  if ((closes - opens) * 60 > MAX_GRACE_MINUTES) {
    // The window's length becomes the work's grace, and the late-work sweep only looks as far
    // back as the longest grace any work may have. A longer window would let a missed service
    // go late without anybody being told.
    throw new ORPCError("BAD_REQUEST", {
      message: "The AI window cannot be longer than a day",
      data: { refusal: "ai_window_too_long" },
    });
  }
  const quietFrom = input.quietFrom ?? standing.quietFrom;
  const quietUntil = input.quietUntil ?? standing.quietUntil;
  if (quietFrom === quietUntil) {
    // Silently meaning "never quiet" is how a farm ends up being woken at two in the
    // morning by a setting it thought it had made.
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Quiet hours that begin when they end are not quiet hours; set them apart or say so plainly",
      data: { refusal: "quiet_hours_same" },
    });
  }
};

/** First-run setup: the signed-in person names the Farm and becomes its Owner.
 *  Refused once a Farm exists — after that, people arrive by invitation. */
export const farmRouter = {
  /** When the server's own clock last raised the day's work and told people about late work — and whether it is
   *  failing — so a silent schedule is something the Owner can see rather than discover. */
  schedule: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => scheduleStatus(context.db)),

  bootstrap: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .handler(async ({ context, input }) => {
      if (context.farm) {
        throw new ORPCError("CONFLICT", { message: "The farm already exists" });
      }
      const now = context.clock.now();
      const farmId = uuidv7(now);
      const ownerId = context.actor.id;
      await audited(context, farmId).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "create",
          after: { name: input.name, ownerId },
        },
        async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`
          );
          const existing = await tx.query.farm.findFirst({
            columns: { id: true },
          });
          if (existing) {
            throw new ORPCError("CONFLICT", {
              message: "The farm already exists",
            });
          }
          await tx
            .insert(farm)
            .values({ id: farmId, name: input.name, createdAt: now });
          await tx.insert(roleAssignment).values({
            id: uuidv7(now),
            farmId,
            userId: ownerId,
            role: "owner",
            grantedBy: ownerId,
            grantedByRole: "owner",
            createdAt: now,
          });
        }
      );
      return { id: farmId, name: input.name };
    }),

  /**
   * Starts the farm with the standard lists instead of an empty store: the Feed Items, the Rations they make, and the
   * Drug List and notifiable diseases. The Owner's, as setting the farm up is. Whatever the farm already has by name
   * is left alone, so asking twice adds nothing the second time. The Standard Playbook is not here: an SOP raises
   * work, and each one is the Owner's to read and publish.
   */
  startWithStandard: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ kinds: z.array(z.enum(STANDARD_KINDS)).min(1) }))
    .handler(({ context, input }) =>
      startWithStandard(
        context.db,
        audited(context).recordEvent,
        {
          farmId: context.farm.id,
          actorId: context.actor.id,
          roleUsed: context.roleUsed,
          now: context.clock.now(),
        },
        input.kinds
      )
    ),
  /**
   * The farm's own doors — its sign-in and a Shed Phone's — name the farm to anybody before they sign in, as every paper
   * it prints does and its address already says. The name and nothing else; nothing before the farm is set up. The
   * Investor portal's door asks `portal.door`, which names nobody while the portal is shut.
   */
  door: publicProcedure.handler(({ context }) => ({
    farmName: context.farm?.name ?? null,
  })),

  current: protectedProcedure.handler(({ context }) => {
    if (!context.farm) {
      return null;
    }
    // Which farm, and no more, for somebody the farm's settings are not for: a Vet here only on a visit, or somebody
    // who holds no Role yet. Thresholds, windows and tolerances are the running of the farm.
    if (onlyOnAVisit(context) || context.roles.length === 0) {
      return { id: context.farm.id, name: context.farm.name };
    }
    // The Approval Threshold is a money figure, and money is not Barn Staff's or the Vet's to see. What a Venture is
    // planned by, the market price and the lines the Manager's counts are told past are the Owner's alone to read.
    const { approvalThresholdMoney, ...rest } = context.farm;
    const isOwner = context.roles.some((role) => role === "owner");
    const readsMoney =
      isOwner || context.roles.some((role) => role === "manager");
    const owners: Partial<Pick<typeof context.farm, OwnersFigure>> = isOwner
      ? theOwnersFigures(context.farm)
      : {};
    return {
      ...withoutTheOwnersFigures(rest),
      ...(readsMoney ? { approvalThresholdMoney } : {}),
      ...owners,
    };
  }),

  /**
   * The Farm Identity. Whoever the roles matrix lets read the Farm Parameters: the Owner, the
   * Manager, and a Vet who needs it to write a letter. Not Barn Staff — what the farm's paperwork
   * says is none of a milker's business.
   */
  identity: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const [latest] = await certificatesOf(context.db, context.farm.id);
      return {
        ...identityView(
          context.farm,
          context.clock.now(),
          context.farm.registrationRenewalLeadDays
        ),
        /** When the certificate was last photographed; null for a farm that has not. */
        certificateUpdatedAt: latest?.takenAt ?? null,
      };
    }),

  /**
   * Every photograph of the Registration certificate the farm has kept, newest first: when, and by whom.
   * The first is the certificate the farm holds now; the rest are what it held before.
   */
  certificates: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const kept = await certificatesOf(context.db, context.farm.id);
      return kept.map(({ id, takenAt }) => ({ id, takenAt }));
    }),

  /**
   * A photograph of the Registration certificate — the one the farm holds now, or an earlier one by its id.
   * The first thing an inspector asks to see.
   */
  certificate: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ id: z.string().optional() }).default({}))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.registrationCertificate.findFirst({
        where: {
          farmId: context.farm.id,
          ...(input.id ? { id: input.id } : {}),
        },
        columns: { contentType: true, data: true },
        orderBy: { takenAt: "desc", id: "desc" },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: "No certificate has been photographed",
        });
      }
      return row;
    }),

  /**
   * Photographs the Registration certificate. The newer photograph is the certificate now, and the one before
   * it is kept. The Owner's or the Manager's, as the identity is, from their own phones.
   */
  setCertificate: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(photoInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const farmId = context.farm.id;
      let kept = "";
      await audited(context).write(
        {
          entity: "registration_certificate",
          entityId: () => kept,
          action: "create",
          after: () =>
            Promise.resolve({
              id: kept,
              contentType: input.contentType,
              takenAt: now.toISOString(),
            }),
        },
        async (tx) => {
          kept = await keepCertificate(tx, farmId, input, {
            by: context.actor.id,
            now,
          });
          // The certificate is printed beside every transport card: the Owner hears when the Manager changes it.
          await tellTheOwnerOfTheChange(context, tx, { certificate: kept });
        }
      );
      return { id: kept, certificateUpdatedAt: now };
    }),

  /**
   * Writes the farm down. The Owner or the Manager (roles matrix: farm parameters are both
   * theirs), because the registration decision has the Manager entering it from the certificate
   * at go-live and the Owner answering for it afterwards.
   */
  setIdentity: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(identity)
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          // What it said before, because these are the words on documents the farm has already
          // sent out, and "what did the card say in March" is a question with an answer.
          before: (tx) => readIdentity(tx, farmId),
          after: (tx) => readIdentity(tx, farmId),
        },
        async (tx) => {
          const changes = touched({
            address: input.address,
            phone: input.phone,
            registrationNumber: input.registrationNumber,
            registrationOffice: input.registrationOffice,
            registrationIssuedOn: onFarmDay(input.registrationIssuedOn),
            registrationExpiresOn: onFarmDay(input.registrationExpiresOn),
          });
          await refuseExpiryBeforeIssue(tx, farmId, changes);
          await tx.update(farm).set(changes).where(eq(farm.id, farmId));
          // Printed on every transport card, receipt and Investor paper: the Owner hears when the Manager changes them.
          await tellTheOwnerOfTheChange(context, tx, changes);
        }
      );
      return { id: farmId };
    }),

  /**
   * The farm's name, put right. Typed once when the farm was set up and printed on every paper since, so a slip there
   * would otherwise stay for good. The Owner's alone, and audited with what it said before: the papers already sent out
   * said that.
   */
  rename: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          before: (tx) => readIdentity(tx, farmId),
          after: (tx) => readIdentity(tx, farmId),
        },
        (tx) =>
          tx.update(farm).set({ name: input.name }).where(eq(farm.id, farmId))
      );
      return { id: farmId, name: input.name };
    }),

  /**
   * Who runs the server the farm's records are on, and who keeps the nightly encrypted copy and in which country: the
   * facts the privacy notice tells an Investor. The Owner's alone.
   */
  dataKeepers: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(({ context }) => readKeepers(context.db, context.farm.id)),

  /**
   * The Owner writes down who keeps the farm's records, once they are chosen. Audited with what it said before: these
   * are the words on the notice Investors were handed.
   */
  setDataKeepers: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(dataKeepersInput)
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          // As the trail writes any record down: a plain copy of the three.
          before: async (tx) => ({ ...(await readKeepers(tx, farmId)) }),
          after: async (tx) => ({ ...(await readKeepers(tx, farmId)) }),
        },
        (tx) => tx.update(farm).set(input).where(eq(farm.id, farmId))
      );
      return { id: farmId };
    }),

  /** The Manager tunes the Farm Parameters. Audited like any other write, with the values
   *  as they stood before, so a flag raised under an old tolerance stays explicable. */
  setParameters: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(parameters)
    .handler(async ({ context, input }) => {
      refuseWhatIsTheOwners(input, context.roles);
      for (const time of [
        ...(input.digestTimes ?? []),
        input.quietFrom,
        input.quietUntil,
      ]) {
        if (time !== undefined && !TIME_OF_DAY.test(time)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${time}" is not a time of day`,
            data: { refusal: "not_a_time_of_day", time },
          });
        }
      }
      // Only the Parameters this request named; the rest stay as the Manager last set them.
      const changes = touched(input);
      let retimed: CalvingWorkFollowed | null = null;
      let checksMoved: { instanceId: string; from: Date; to: Date }[] = [];
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: async (tx) =>
            (await tx.query.farm.findFirst({
              where: { id: context.farm.id },
              columns: PARAMETER_COLUMNS,
            })) ?? null,
          after: () =>
            Promise.resolve({
              ...changes,
              ...retimed,
              ...(checksMoved.length > 0 ? { checksMoved } : {}),
            }),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const standing =
            (await tx.query.farm.findFirst({
              where: { id: context.farm.id },
            })) ?? context.farm;
          refuseWhatDoesNotHoldTogether(input, standing);
          await tx
            .update(farm)
            .set(changes)
            .where(eq(farm.id, context.farm.id));
          await tellTheOwnerOfTheChange(context, tx, changes);
          // A calving timed by a gestation or a lead that just changed is timed again, and its open
          // work goes to the new day — the same as a date that moves for any other reason.
          if (
            changes.gestationDays !== undefined ||
            changes.dryOffLeadDays !== undefined ||
            changes.calvingPrepLeadDays !== undefined
          ) {
            retimed = await retimeEveryCalving(
              tx,
              context.farm.id,
              // As the farm stands behind the lock, not as this request found it: a lead saved a moment ago by
              // somebody else is the lead the calvings go by.
              pregnancyTimesOf({ ...standing, ...changes }),
              context.clock.now(),
              audited(context).recordEvent
            );
          }
          // A check waiting goes to the new days after a service, as calving work goes to its new day.
          if (changes.pregnancyCheckAfterDays !== undefined) {
            checksMoved = await retimePregnancyChecks(
              tx,
              context.farm.id,
              changes.pregnancyCheckAfterDays
            );
          }
        }
      );
      // As `farm.current` would read it to them: a Manager who saves the milk tolerance is not handed back how short the
      // cash may be before the Owner hears.
      const saved = { ...context.farm, ...changes };
      return context.roles.includes("owner")
        ? saved
        : withoutTheOwnersFigures(saved);
    }),
};
