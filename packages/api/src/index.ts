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
