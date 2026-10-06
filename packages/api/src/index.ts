import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
  const { session, actor } = context;
  // Better Auth already refuses expired sessions at the HTTP edge; checking here as well
  // keeps the rule true for every caller of the router, including tests on a fake clock.
  // A Shed Phone has no personal session: its device token, and the Manager's power to
  // revoke it, are the gate (ADR 0003).
  const sessionExpired =
    session !== null && session.session.expiresAt <= context.clock.now();
  // A Shed Phone taken off the farm's list is told so on whatever it asks, not only at its next PIN: it forgets its
  // token and asks to be enrolled again, rather than pausing as if somebody had merely signed out.
  if (context.deviceStatus === "revoked") {
    throw new ORPCError("UNAUTHORIZED", {
      message: "This phone has been taken off the farm",
      data: { refusal: "phone_revoked" },
    });
  }
  if (!actor || sessionExpired || context.person?.disabledAt) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      actor,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
