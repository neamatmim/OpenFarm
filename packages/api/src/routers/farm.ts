import { uuidv7 } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import {
  MAX_GRACE_MINUTES,
  STANDARD_KINDS,
  identityView,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { pregnancyTimesOf, retimeEveryCalving } from "../breeding-store";
import type { CalvingWorkFollowed } from "../calving-work";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { photoInput } from "../photo-input";
import { certificatesOf, keepCertificate } from "../registration-store";
import { forbidden, requirePersonalSession, requireRole } from "../roles";
import { scheduleStatus } from "../scheduler";
import { onlyOnAVisit } from "../scope";
import { startWithStandard } from "../standard-store";

/** The Farm Parameters, as a set that grows a row at a time as the increments needing them
 *  land. Each is a number the Manager may tune, never a rule hidden in the code. */
const parameters = z
  .object({
    /** How far the tank reading may sit from what the cows account for before the Manager
     *  is asked to look. */
    milkTolerancePercent: z.number().int().min(0).max(100).optional(),
    feedTolerancePercent: z.number().int().min(0).max(100).optional(),
    digestTimes: z.array(z.string().trim()).min(1).max(6).optional(),
    quietFrom: z.string().trim().optional(),
    quietUntil: z.string().trim().optional(),
    /** How long an Overdue Instance may stay open before the Owner is told as well. */
    escalationMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    /** How long after making an entry Staff may still put it right. */
    staffCorrectionHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 7)
      .optional(),
    /** How long after an entry was made the Manager may still put it right. */
    managerCorrectionDays: z.number().int().min(0).max(365).optional(),
    /** How early the farm is told its DLS registration is running out. */
    registrationRenewalLeadDays: z.number().int().min(0).max(365).optional(),
    /** What a bought-in fattening animal is fed towards unless the Manager says otherwise
     *  for that animal. */
    fatteningTargetWeightKg: z.number().int().min(1).max(2000).optional(),
    /** The AI window after a Heat, in hours. */
    aiWindowStartHours: z.number().int().min(0).max(72).optional(),
    aiWindowEndHours: z.number().int().min(1).max(96).optional(),
    /** The days from an attempt's first service to its Pregnancy Check — not before a vet can
     *  tell, and not so late that a cow who did not take has missed two heats. */
    pregnancyCheckAfterDays: z.number().int().min(28).max(90).optional(),
    /** How long a cow carries, which Expected Calving is worked out from. Within what cattle do. */
    gestationDays: z.number().int().min(260).max(300).optional(),
    /** How long before her Expected Calving a cow is dried off, and walked to the calving pen. */
    dryOffLeadDays: z.number().int().min(30).max(90).optional(),
    calvingPrepLeadDays: z.number().int().min(1).max(30).optional(),
    /** How many attempts that did not take raise a Repeat Breeder. */
    repeatBreederThreshold: z.number().int().min(2).max(10).optional(),
    /** The taka above which a Money Event waits for the Owner. */
    approvalThresholdBdt: z.number().int().min(0).max(100_000_000).optional(),
    /** What part of a Venture's target capital is the least worth starting on. */
    ventureFloorPercent: z.number().int().min(0).max(100).optional(),
    /** What part of a Venture's capital keeps the animals rather than buying them. */
    ventureRunningPercent: z.number().int().min(0).max(90).optional(),
    /** Where a new Investment Agreement's split starts. A default, never a rule. */
    ventureInvestorsPercent: z.number().int().min(0).max(100).optional(),
    /** The days a Venture keeps selling after its window before the Farm buys the rest. */
    windUpDays: z.number().int().min(0).max(180).optional(),
    adjustmentThresholdBdt: z.number().int().min(0).max(1_000_000).optional(),
    /** How many Investors the Farm may have at a time, and where it starts warning. */
    investorCap: z.number().int().min(1).max(50).optional(),
    investorWarnAt: z.number().int().min(1).max(50).optional(),
    runningBudgetWarnBdt: z.number().int().min(0).max(100_000_000).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Nothing to change" }
  );

/**
 * What the farm is, rather than how it is tuned: where it is, how to reach it, and the
 * registration an inspector asks for first.
 *
 * Its own act and not one of the Parameters, because those are numbers the Manager may turn up
 * and down, and this is the farm's identity — it appears on documents that leave the farm, and
 * changing it changes what those documents say.
 */
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

/** The Parameters a Venture is planned and watched by, which are the Owner's to set as the Venture is
 *  hers. The rest are the running of the farm, which the Manager keeps. */
const A_VENTURES_OWN = [
  "ventureFloorPercent",
  "ventureRunningPercent",
  "ventureInvestorsPercent",
  "windUpDays",
  "adjustmentThresholdBdt",
  "investorCap",
  "investorWarnAt",
  "runningBudgetWarnBdt",
] as const;

const aVenturesOwn = (input: z.infer<typeof parameters>): boolean =>
  A_VENTURES_OWN.some((key) => input[key] !== undefined);

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
  current: protectedProcedure.handler(({ context }) => {
    if (!context.farm) {
      return null;
    }
    // Which farm, and no more, for somebody the farm's settings are not for: a Vet here only on a visit, or somebody
    // who holds no Role yet. Thresholds, windows and tolerances are the running of the farm.
    if (onlyOnAVisit(context) || context.roles.length === 0) {
      return { id: context.farm.id, name: context.farm.name };
    }
    // The Approval Threshold is a money figure, and money is not Barn Staff's or the Vet's to see; the
    // three a Venture is planned by are the Owner's alone, as a Venture is.
    const {
      approvalThresholdBdt,
      ventureFloorPercent,
      ventureRunningPercent,
      ventureInvestorsPercent,
      windUpDays,
      adjustmentThresholdBdt,
      investorCap,
      investorWarnAt,
      runningBudgetWarnBdt,
      ...withoutMoney
    } = context.farm;
    const planning = context.roles.some((role) => role === "owner")
      ? {
          ventureFloorPercent,
          ventureRunningPercent,
          ventureInvestorsPercent,
          windUpDays,
          adjustmentThresholdBdt,
          investorCap,
          investorWarnAt,
          runningBudgetWarnBdt,
        }
      : {};
    const readsMoney = context.roles.some(
      (role) => role === "owner" || role === "manager"
    );
    return readsMoney
      ? { ...withoutMoney, ...planning, approvalThresholdBdt }
      : withoutMoney;
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
        (tx) =>
          tx
            .update(farm)
            .set(
              touched({
                address: input.address,
                phone: input.phone,
                registrationNumber: input.registrationNumber,
                registrationOffice: input.registrationOffice,
                registrationIssuedOn: onFarmDay(input.registrationIssuedOn),
                registrationExpiresOn: onFarmDay(input.registrationExpiresOn),
              })
            )
            .where(eq(farm.id, farmId))
      );
      return { id: farmId };
    }),

  /** The Manager tunes the Farm Parameters. Audited like any other write, with the values
   *  as they stood before, so a flag raised under an old tolerance stays explicable. */
  setParameters: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(parameters)
    .handler(async ({ context, input }) => {
      if (
        aVenturesOwn(input) &&
        !context.roles.some((role) => role === "owner")
      ) {
        throw forbidden({
          message: "A Venture's own figures are the Owner's to set",
          reason: "owner_only",
        });
      }
      for (const time of [
        ...(input.digestTimes ?? []),
        input.quietFrom,
        input.quietUntil,
      ]) {
        if (time !== undefined && !TIME_OF_DAY.test(time)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${time}" is not a time of day`,
          });
        }
      }
      const cap = input.investorCap ?? context.farm.investorCap;
      const warnAt = input.investorWarnAt ?? context.farm.investorWarnAt;
      if (warnAt > cap) {
        // A warning that only arrives after the refusal has already happened is no warning at all.
        throw new ORPCError("BAD_REQUEST", {
          message: "The Investor warning comes before the cap, not after it",
        });
      }
      const opens = input.aiWindowStartHours ?? context.farm.aiWindowStartHours;
      const closes = input.aiWindowEndHours ?? context.farm.aiWindowEndHours;
      if (closes <= opens) {
        // A window that shuts before it opens would make every AI job late the moment it was
        // raised, and the farm would learn to ignore the alert that matters most in breeding.
        throw new ORPCError("BAD_REQUEST", {
          message: "The AI window has to close after it opens",
        });
      }
      if ((closes - opens) * 60 > MAX_GRACE_MINUTES) {
        // The window's length becomes the work's grace, and the late-work sweep only looks as far
        // back as the longest grace any work may have. A longer window would let a missed service
        // go late without anybody being told.
        throw new ORPCError("BAD_REQUEST", {
          message: "The AI window cannot be longer than a day",
        });
      }
      const quietFrom = input.quietFrom ?? context.farm.quietFrom;
      const quietUntil = input.quietUntil ?? context.farm.quietUntil;
      if (quietFrom === quietUntil) {
        // Silently meaning "never quiet" is how a farm ends up being woken at two in the
        // morning by a setting it thought it had made.
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Quiet hours that begin when they end are not quiet hours; set them apart or say so plainly",
        });
      }
      // Only the Parameters this request named; the rest stay as the Manager last set them.
      const changes = touched(input);
      let retimed: CalvingWorkFollowed | null = null;
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: async (tx) =>
            (await tx.query.farm.findFirst({
              where: { id: context.farm.id },
              columns: {
                milkTolerancePercent: true,
                feedTolerancePercent: true,
                digestTimes: true,
                quietFrom: true,
                quietUntil: true,
                escalationMinutes: true,
                staffCorrectionHours: true,
                managerCorrectionDays: true,
                registrationRenewalLeadDays: true,
                fatteningTargetWeightKg: true,
                aiWindowStartHours: true,
                aiWindowEndHours: true,
                pregnancyCheckAfterDays: true,
                gestationDays: true,
                dryOffLeadDays: true,
                calvingPrepLeadDays: true,
                repeatBreederThreshold: true,
                approvalThresholdBdt: true,
                ventureFloorPercent: true,
                ventureRunningPercent: true,
                ventureInvestorsPercent: true,
                windUpDays: true,
                adjustmentThresholdBdt: true,
                investorCap: true,
                investorWarnAt: true,
                runningBudgetWarnBdt: true,
              },
            })) ?? null,
          after: () => Promise.resolve({ ...changes, ...retimed }),
        },
        async (tx) => {
          await tx
            .update(farm)
            .set(changes)
            .where(eq(farm.id, context.farm.id));
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
              pregnancyTimesOf({ ...context.farm, ...changes }),
              context.clock.now(),
              audited(context).recordEvent
            );
          }
        }
      );
      return { ...context.farm, ...changes };
    }),
};
