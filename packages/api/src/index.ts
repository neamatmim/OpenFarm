import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
  const { session } = context;
  // Better Auth already refuses expired sessions at the HTTP edge; checking here as well
  // keeps the rule true for every caller of the router, including tests on a fake clock.
  const expired = session
    ? session.session.expiresAt <= context.clock.now()
    : true;
  if (!session?.user || expired || context.person?.disabledAt) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
