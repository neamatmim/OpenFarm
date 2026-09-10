import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { auditRouter } from "./audit";
import { farmRouter } from "./farm";
import { languageRouter } from "./language";
import { peopleRouter } from "./people";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  /** The API's notion of now — from the injected Clock, so clients can show sync age. */
  serverTime: publicProcedure.handler(({ context }) => context.clock.now()),
  audit: auditRouter,
  farm: farmRouter,
  language: languageRouter,
  people: peopleRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
