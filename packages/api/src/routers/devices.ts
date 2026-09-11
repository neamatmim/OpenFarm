import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { shedPhone } from "@OpenFarm/db/schema/device";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { hashToken, randomEnrolmentCode, randomToken } from "../device";
import { protectedProcedure, publicProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";

/** How long a Manager's enrolment code is good for. Long enough to walk to the shed. */
const ENROLMENT_MINUTES = 30;
const MINUTE_MS = 60_000;

export const devicesRouter = {
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .handler(({ context }) =>
      context.db.query.shedPhone.findMany({
        where: { farmId: context.farm.id },
        columns: {
          id: true,
          name: true,
          shedId: true,
          claimedAt: true,
          lastSeenAt: true,
          revokedAt: true,
          enrolmentCode: true,
          enrolmentExpiresAt: true,
        },
        orderBy: { name: "asc" },
      })
    ),

  /** Creates the phone and a one-time code the Manager reads out to it. */
  enrol: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        shedId: z.string().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      const code = randomEnrolmentCode();
      await audited(context).write(
        {
          entity: "shed_phone",
          entityId: id,
          action: "create",
          after: { name: input.name, shedId: input.shedId ?? null },
        },
        (tx) =>
          tx.insert(shedPhone).values({
            id,
            farmId: context.farm.id,
            shedId: input.shedId ?? null,
            name: input.name,
            // No token until the phone claims the code; a hash of the id keeps the column
            // unique and unusable as a credential.
            tokenHash: `unclaimed:${id}`,
            enrolmentCode: code,
            enrolmentExpiresAt: new Date(
              now.getTime() + ENROLMENT_MINUTES * MINUTE_MS
            ),
            enrolledBy: context.actor.id,
            enrolledByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return {
        id,
        name: input.name,
        code,
        expiresInMinutes: ENROLMENT_MINUTES,
      };
    }),

  /** The phone exchanges the Manager's code for its own token. No session yet, by design. */
  claim: publicProcedure
    .input(z.object({ code: z.string().trim().min(4).max(16) }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const phone = await context.db.query.shedPhone.findFirst({
        where: { enrolmentCode: input.code },
      });
      if (
        !phone ||
        phone.revokedAt ||
        !phone.enrolmentExpiresAt ||
        phone.enrolmentExpiresAt <= now
      ) {
        throw new ORPCError("NOT_FOUND", { message: "That code is not valid" });
      }
      const token = randomToken();
      let claimed: { id: string; name: string } | undefined;
      // The phone has no actor yet, so the event records the farm and the device only.
      await audited(context, phone.farmId).write(
        {
          entity: "shed_phone",
          entityId: phone.id,
          action: "update",
          after: { claimedAt: now },
        },
        async (tx) => {
          [claimed] = await tx
            .update(shedPhone)
            .set({
              tokenHash: await hashToken(token),
              enrolmentCode: null,
              enrolmentExpiresAt: null,
              claimedAt: now,
            })
            // Only an unclaimed code can be claimed, so a replay finds nothing.
            .where(
              and(
                eq(shedPhone.id, phone.id),
                eq(shedPhone.enrolmentCode, input.code)
              )
            )
            .returning({ id: shedPhone.id, name: shedPhone.name });
          if (!claimed) {
            throw new ORPCError("NOT_FOUND", {
              message: "That code is not valid",
            });
          }
        }
      );
      if (!claimed) {
        throw new ORPCError("NOT_FOUND", { message: "That code is not valid" });
      }
      return { token, device: claimed };
    }),

  revoke: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "shed_phone",
          entityId: input.id,
          action: "update",
          after: { revokedAt: now },
        },
        async (tx) => {
          const [row] = await tx
            .update(shedPhone)
            .set({ revokedAt: now, enrolmentCode: null })
            .where(
              and(
                eq(shedPhone.id, input.id),
                eq(shedPhone.farmId, context.farm.id),
                isNull(shedPhone.revokedAt)
              )
            )
            .returning({ id: shedPhone.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, revoked: true };
    }),

  /** Who this phone is, and how long before it locks. */
  current: protectedProcedure.handler(({ context }) => ({
    device: context.device,
    actor: context.actor,
    autoLockMinutes: context.farm?.pinAutoLockMinutes ?? null,
  })),
};
