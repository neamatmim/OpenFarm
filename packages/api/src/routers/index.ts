import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { alertsRouter } from "./alerts";
import { animalsRouter } from "./animals";
import { auditRouter } from "./audit";
import { backupsRouter } from "./backups";
import { bakiRouter } from "./baki";
import { breedingRouter } from "./breeding";
import { breedsRouter } from "./breeds";
import { cashRouter } from "./cash";
import { costsRouter } from "./costs";
import { cullingRouter } from "./culling";
import { devicesRouter } from "./devices";
import { diagnosesRouter } from "./diagnoses";
import { drugsRouter } from "./drugs";
import { eidRouter } from "./eid";
import { farmRouter } from "./farm";
import { farmAccountsRouter } from "./farm-accounts";
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
import { portalRouter } from "./portal";
import { portalPreviewRouter } from "./portal-preview";
import { prescriptionsRouter } from "./prescriptions";
import { pushRouter } from "./push";
import { readyRouter } from "./ready";
import { reportsRouter } from "./reports";
import { returnsRouter } from "./returns";
import { reviewRouter } from "./review";
import { saleRouter } from "./sale";
import { sellingTripsRouter } from "./selling-trips";
import { sopsRouter } from "./sops";
import { stockRouter } from "./stock";
import { syncRouter } from "./sync";
import { templatesRouter } from "./templates";
import { treatmentsRouter } from "./treatments";
import { tripsRouter } from "./trips";
import { venturesRouter } from "./ventures";
import { vetCasesRouter } from "./vet-cases";
import { withdrawalsRouter } from "./withdrawals";

/** Whether the API answers at all. */
const healthCheck = publicProcedure.handler(() => "OK");

/**
 * The router's shape, spelled out as each part's own type. Left to inference, the whole of it is written into the
 * declaration file expanded, and it has grown past what the compiler will write; named, each part is written by name.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface has no index signature, and oRPC's Router type asks for one
type AppRouterShape = {
  healthCheck: typeof healthCheck;
  alerts: typeof alertsRouter;
  animals: typeof animalsRouter;
  audit: typeof auditRouter;
  backups: typeof backupsRouter;
  breeds: typeof breedsRouter;
  devices: typeof devicesRouter;
  diagnoses: typeof diagnosesRouter;
  drugs: typeof drugsRouter;
  eid: typeof eidRouter;
  farm: typeof farmRouter;
  farmAccounts: typeof farmAccountsRouter;
  fattening: typeof fatteningRouter;
  feed: typeof feedRouter;
  herd: typeof herdRouter;
  home: typeof homeRouter;
  returns: typeof returnsRouter;
  instances: typeof instancesRouter;
  intake: typeof intakeRouter;
  language: typeof languageRouter;
  milk: typeof milkRouter;
  notifiable: typeof notifiableRouter;
  observations: typeof observationsRouter;
  papers: typeof papersRouter;
  people: typeof peopleRouter;
  prescriptions: typeof prescriptionsRouter;
  push: typeof pushRouter;
  ready: typeof readyRouter;
  costs: typeof costsRouter;
  culling: typeof cullingRouter;
  inspector: typeof inspectorRouter;
  money: typeof moneyRouter;
  cash: typeof cashRouter;
  baki: typeof bakiRouter;
  reports: typeof reportsRouter;
  breeding: typeof breedingRouter;
  stock: typeof stockRouter;
  review: typeof reviewRouter;
  sale: typeof saleRouter;
  trips: typeof tripsRouter;
  sellingTrips: typeof sellingTripsRouter;
  ventures: typeof venturesRouter;
  investorStatements: typeof investorStatementsRouter;
  investors: typeof investorsRouter;
  portal: typeof portalRouter;
  portalPreview: typeof portalPreviewRouter;
  sops: typeof sopsRouter;
  templates: typeof templatesRouter;
  sync: typeof syncRouter;
  vetCases: typeof vetCasesRouter;
  treatments: typeof treatmentsRouter;
  withdrawals: typeof withdrawalsRouter;
};

export const appRouter: AppRouterShape = {
  healthCheck,
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
  farmAccounts: farmAccountsRouter,
  fattening: fatteningRouter,
  feed: feedRouter,
  herd: herdRouter,
  home: homeRouter,
  returns: returnsRouter,
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
  culling: cullingRouter,
  inspector: inspectorRouter,
  money: moneyRouter,
  cash: cashRouter,
  baki: bakiRouter,
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
  portal: portalRouter,
  portalPreview: portalPreviewRouter,
  sops: sopsRouter,
  templates: templatesRouter,
  sync: syncRouter,
  vetCases: vetCasesRouter,
  treatments: treatmentsRouter,
  withdrawals: withdrawalsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
