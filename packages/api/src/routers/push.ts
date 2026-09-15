import { and, eq, isNull } from "@OpenFarm/db/operators";
import { pushSubscription } from "@OpenFarm/db/schema/push";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { rememberPushBrowser } from "../push-store";
import { requireRole } from "../roles";

/**
 * A push endpoint is a URL this farm's server will be asked to POST to. Left open, that is a
 * staff member pointing the server at anything it can reach from inside — a cloud metadata
 * service, a machine on the farm office network. It has to be a push service on the open
 * web, over TLS, and nothing else.
 */
const endpointInput = z
  .url()
  .max(1000)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      // Anything that resolves by address is not a push service.
      /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) ||
      host.startsWith("[")
    );
  }, "That is not a push service");

export const pushRouter = {
  /** What this farm's browsers need to speak to it, and nothing secret: the public half of
   *  the farm's keys, or nothing when the farm does not push at all. */
  key: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .handler(({ context }) => ({ key: context.pushKey })),

  /** This browser agrees to be told. Per browser, not per person: a Manager with a phone and
   *  an office machine has two, and an Alert should reach both. */
  listen: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(
      z.object({
        endpoint: endpointInput,
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let id = "";
      await audited(context).write(
        {
          // Keyed on the row, not the endpoint: an entityId no row carries is a trail entry
          // nothing can find its way back to — and an endpoint in the trail is a browser's
          // address written where anyone who can read the trail can see it.
          entity: "push_subscription",
          entityId: () => id,
          action: "create",
          after: { userId: context.actor.id },
        },
        async (tx) => {
          id = await rememberPushBrowser(
            tx,
            {
              farmId: context.farm.id,
              userId: context.actor.id,
              // A Shed Phone's voice goes when the phone does (ADR 0003).
              deviceId: context.device?.id ?? null,
              ...input,
            },
            now
          );
        }
      );
      return { listening: true };
    }),

  /** This browser would rather not be told. The row stays, revoked: who was told what, and
   *  who stopped being told, is part of the farm's record. */
  stopListening: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(z.object({ endpoint: endpointInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let id = "";
      await audited(context).write(
        {
          entity: "push_subscription",
          entityId: () => id,
          action: "update",
          after: { revokedAt: now.toISOString() },
        },
        async (tx) => {
          const [row] = await tx
            .update(pushSubscription)
            .set({ revokedAt: now })
            .where(
              and(
                eq(pushSubscription.endpoint, input.endpoint),
                eq(pushSubscription.farmId, context.farm.id),
                // Your own browser, not somebody else's.
                eq(pushSubscription.userId, context.actor.id),
                isNull(pushSubscription.revokedAt)
              )
            )
            .returning({ id: pushSubscription.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
          ({ id } = row);
        }
      );
      return { listening: false };
    }),
};
