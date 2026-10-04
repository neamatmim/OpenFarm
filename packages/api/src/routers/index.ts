import type { RouterClient } from "@orpc/server";

import { alertsRouter } from "./alerts";
import { animalsRouter } from "./animals";
import { auditRouter } from "./audit";
import { backupsRouter } from "./backups";
import { breedingRouter } from "./breeding";
import { breedsRouter } from "./breeds";
import { buyingTripsRouter } from "./buying-trips";
import { cashRouter } from "./cash";
import { costsRouter } from "./costs";
import { cullListRouter } from "./cull-list";
import { devicesRouter } from "./devices";
import { diagnosesRouter } from "./diagnoses";
import { drugsRouter } from "./drugs";
import { eidDatesRouter } from "./eid-dates";
import { farmRouter } from "./farm";
import { farmAccountsRouter } from "./farm-accounts";
import { fatteningRouter } from "./fattening";
import { feedRouter } from "./feed";
import { financialYearsRouter } from "./financial-years";
import { homeRouter } from "./home";
import { inspectorViewRouter } from "./inspector-view";
import { intakesRouter } from "./intakes";
import { investorStatementsRouter } from "./investor-statements";
import { investorsRouter } from "./investors";
import { languageRouter } from "./language";
import { milkRouter } from "./milk";
import { moneyRouter } from "./money";
import { monthlyReportRouter } from "./monthly-report";
import { notifiableDiseasesRouter } from "./notifiable-diseases";
import { observationsRouter } from "./observations";
import { overviewRouter } from "./overview";
import { papersRouter } from "./papers";
import { peopleRouter } from "./people";
import { portalRouter } from "./portal";
import { portalPreviewRouter } from "./portal-preview";
import { prescriptionsRouter } from "./prescriptions";
import { pushRouter } from "./push";
import { readyForSaleRouter } from "./ready-for-sale";
import { receivablesRouter } from "./receivables";
import { reportsRouter } from "./reports";
import { returnsRouter } from "./returns";
import { reviewQueueRouter } from "./review-queue";
import { salesRouter } from "./sales";
import { sellingTripsRouter } from "./selling-trips";
import { shedsRouter } from "./sheds";
import { sopsRouter } from "./sops";
import { stockRouter } from "./stock";
import { syncRouter } from "./sync";
import { templatesRouter } from "./templates";
import { treatmentsRouter } from "./treatments";
import { venturesRouter } from "./ventures";
import { vetCasesRouter } from "./vet-cases";
import { withdrawalsRouter } from "./withdrawals";
import { workRouter } from "./work";

/**
 * The router's shape, spelled out as each part's own type. Left to inference, the whole of it is written into the
 * declaration file expanded, and it has grown past what the compiler will write; named, each part is written by name.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- an interface has no index signature, and oRPC's Router type asks for one
type AppRouterShape = {
  alerts: typeof alertsRouter;
  animals: typeof animalsRouter;
  audit: typeof auditRouter;
  backups: typeof backupsRouter;
  breeds: typeof breedsRouter;
  devices: typeof devicesRouter;
  diagnoses: typeof diagnosesRouter;
  drugs: typeof drugsRouter;
  eidDates: typeof eidDatesRouter;
  farm: typeof farmRouter;
  financialYears: typeof financialYearsRouter;
  farmAccounts: typeof farmAccountsRouter;
  fattening: typeof fatteningRouter;
  feed: typeof feedRouter;
  sheds: typeof shedsRouter;
  home: typeof homeRouter;
  overview: typeof overviewRouter;
  monthlyReport: typeof monthlyReportRouter;
  returns: typeof returnsRouter;
  work: typeof workRouter;
  intakes: typeof intakesRouter;
  language: typeof languageRouter;
  milk: typeof milkRouter;
  notifiableDiseases: typeof notifiableDiseasesRouter;
  observations: typeof observationsRouter;
  papers: typeof papersRouter;
  people: typeof peopleRouter;
  prescriptions: typeof prescriptionsRouter;
  push: typeof pushRouter;
  readyForSale: typeof readyForSaleRouter;
  costs: typeof costsRouter;
  cullList: typeof cullListRouter;
  inspectorView: typeof inspectorViewRouter;
  money: typeof moneyRouter;
  cash: typeof cashRouter;
  receivables: typeof receivablesRouter;
  reports: typeof reportsRouter;
  breeding: typeof breedingRouter;
  stock: typeof stockRouter;
  reviewQueue: typeof reviewQueueRouter;
  sales: typeof salesRouter;
  buyingTrips: typeof buyingTripsRouter;
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
  alerts: alertsRouter,
  animals: animalsRouter,
  audit: auditRouter,
  backups: backupsRouter,
  breeds: breedsRouter,
  devices: devicesRouter,
  diagnoses: diagnosesRouter,
  drugs: drugsRouter,
  eidDates: eidDatesRouter,
  farm: farmRouter,
  financialYears: financialYearsRouter,
  farmAccounts: farmAccountsRouter,
  fattening: fatteningRouter,
  feed: feedRouter,
  sheds: shedsRouter,
  home: homeRouter,
  overview: overviewRouter,
  monthlyReport: monthlyReportRouter,
  returns: returnsRouter,
  work: workRouter,
  intakes: intakesRouter,
  language: languageRouter,
  milk: milkRouter,
  notifiableDiseases: notifiableDiseasesRouter,
  observations: observationsRouter,
  papers: papersRouter,
  people: peopleRouter,
  prescriptions: prescriptionsRouter,
  push: pushRouter,
  readyForSale: readyForSaleRouter,
  costs: costsRouter,
  cullList: cullListRouter,
  inspectorView: inspectorViewRouter,
  money: moneyRouter,
  cash: cashRouter,
  receivables: receivablesRouter,
  reports: reportsRouter,
  breeding: breedingRouter,
  stock: stockRouter,
  reviewQueue: reviewQueueRouter,
  sales: salesRouter,
  buyingTrips: buyingTripsRouter,
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
