import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { alertsRouter } from "./alerts";
import { animalsRouter } from "./animals";
import { auditRouter } from "./audit";
import { devicesRouter } from "./devices";
import { farmRouter } from "./farm";
import { herdRouter } from "./herd";
import { instancesRouter } from "./instances";
import { languageRouter } from "./language";
import { milkRouter } from "./milk";
import { peopleRouter } from "./people";
import { pushRouter } from "./push";
import { reviewRouter } from "./review";
import { sopsRouter } from "./sops";
import { syncRouter } from "./sync";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  /** The API's notion of now — from the injected Clock, so clients can show sync age. */
  serverTime: publicProcedure.handler(({ context }) => context.clock.now()),
  alerts: alertsRouter,
  animals: animalsRouter,
  audit: auditRouter,
  devices: devicesRouter,
  farm: farmRouter,
  herd: herdRouter,
  instances: instancesRouter,
  language: languageRouter,
  milk: milkRouter,
  people: peopleRouter,
  push: pushRouter,
  review: reviewRouter,
  sops: sopsRouter,
  sync: syncRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.actor,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
