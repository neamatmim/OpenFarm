import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { alertsRouter } from "./alerts";
import { animalsRouter } from "./animals";
import { auditRouter } from "./audit";
import { backupsRouter } from "./backups";
import { breedingRouter } from "./breeding";
import { breedsRouter } from "./breeds";
import { costsRouter } from "./costs";
import { devicesRouter } from "./devices";
import { diagnosesRouter } from "./diagnoses";
import { drugsRouter } from "./drugs";
import { eidRouter } from "./eid";
import { farmRouter } from "./farm";
import { fatteningRouter } from "./fattening";
import { feedRouter } from "./feed";
import { herdRouter } from "./herd";
import { homeRouter } from "./home";
import { inspectorRouter } from "./inspector";
import { instancesRouter } from "./instances";
import { intakeRouter } from "./intake";
import { investorStatementsRouter } from "./investor-statements";
import { investorsRouter } from "./investors";
import { languageRouter } from "./language";
import { milkRouter } from "./milk";
import { moneyRouter } from "./money";
import { notifiableRouter } from "./notifiable";
import { observationsRouter } from "./observations";
import { papersRouter } from "./papers";
import { peopleRouter } from "./people";
import { prescriptionsRouter } from "./prescriptions";
import { pushRouter } from "./push";
import { readyRouter } from "./ready";
import { reportsRouter } from "./reports";
import { reviewRouter } from "./review";
import { saleRouter } from "./sale";
import { sellingTripsRouter } from "./selling-trips";
import { sopsRouter } from "./sops";
import { stockRouter } from "./stock";
import { syncRouter } from "./sync";
import { templatesRouter } from "./templates";
import { tripsRouter } from "./trips";
import { venturesRouter } from "./ventures";
import { vetCasesRouter } from "./vet-cases";
import { withdrawalsRouter } from "./withdrawals";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  /** The API's notion of now — from the injected Clock, so clients can show sync age. */
  serverTime: publicProcedure.handler(({ context }) => context.clock.now()),
  alerts: alertsRouter,
  animals: animalsRouter,
  audit: auditRouter,
  backups: backupsRouter,
  breeds: breedsRouter,
  devices: devicesRouter,
  diagnoses: diagnosesRouter,
  drugs: drugsRouter,
  eid: eidRouter,
  farm: farmRouter,
  fattening: fatteningRouter,
  feed: feedRouter,
  herd: herdRouter,
  home: homeRouter,
  instances: instancesRouter,
  intake: intakeRouter,
  language: languageRouter,
  milk: milkRouter,
  notifiable: notifiableRouter,
  observations: observationsRouter,
  papers: papersRouter,
  people: peopleRouter,
  prescriptions: prescriptionsRouter,
  push: pushRouter,
  ready: readyRouter,
  costs: costsRouter,
  inspector: inspectorRouter,
  money: moneyRouter,
  reports: reportsRouter,
  breeding: breedingRouter,
  stock: stockRouter,
  review: reviewRouter,
  sale: saleRouter,
  trips: tripsRouter,
  sellingTrips: sellingTripsRouter,
  ventures: venturesRouter,
  investorStatements: investorStatementsRouter,
  investors: investorsRouter,
  sops: sopsRouter,
  templates: templatesRouter,
  sync: syncRouter,
  vetCases: vetCasesRouter,
  withdrawals: withdrawalsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.actor,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
