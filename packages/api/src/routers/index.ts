import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { alertsRouter } from "./alerts";
import { animalsRouter } from "./animals";
import { auditRouter } from "./audit";
import { backupsRouter } from "./backups";
import { devicesRouter } from "./devices";
import { diagnosesRouter } from "./diagnoses";
import { drugsRouter } from "./drugs";
import { farmRouter } from "./farm";
import { feedRouter } from "./feed";
import { herdRouter } from "./herd";
import { homeRouter } from "./home";
import { instancesRouter } from "./instances";
import { languageRouter } from "./language";
import { milkRouter } from "./milk";
import { notifiableRouter } from "./notifiable";
import { observationsRouter } from "./observations";
import { peopleRouter } from "./people";
import { prescriptionsRouter } from "./prescriptions";
import { pushRouter } from "./push";
import { reviewRouter } from "./review";
import { sopsRouter } from "./sops";
import { syncRouter } from "./sync";
import { withdrawalsRouter } from "./withdrawals";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  /** The API's notion of now — from the injected Clock, so clients can show sync age. */
  serverTime: publicProcedure.handler(({ context }) => context.clock.now()),
  alerts: alertsRouter,
  animals: animalsRouter,
  audit: auditRouter,
  backups: backupsRouter,
  devices: devicesRouter,
  diagnoses: diagnosesRouter,
  drugs: drugsRouter,
  farm: farmRouter,
  feed: feedRouter,
  herd: herdRouter,
  home: homeRouter,
  instances: instancesRouter,
  language: languageRouter,
  milk: milkRouter,
  notifiable: notifiableRouter,
  observations: observationsRouter,
  people: peopleRouter,
  prescriptions: prescriptionsRouter,
  push: pushRouter,
  review: reviewRouter,
  sops: sopsRouter,
  sync: syncRouter,
  withdrawals: withdrawalsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.actor,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
