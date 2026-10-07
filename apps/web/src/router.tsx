import { setFarmLocale } from "@OpenFarm/i18n";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import NotFound, { PageFailed } from "./components/not-found";
import { pageFarmLocale, pageHost, pageNonce } from "./lib/page-context";
import { keepQueriesOnDevice } from "./lib/query-cache";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
  // Where the farm is, before the page draws its first sum or day: in the browser, from what the server wrote on it.
  setFarmLocale(pageFarmLocale());
  const queryClient = createQueryClient();
  // What the app has read is kept on the device, so a phone that opens with no signal opens
  // on what it last knew rather than on a spinner.
  // Waited for before a signed-in screen asks who is signed in: opened cold with no signal, what it last knew is the
  // only answer there is, and asking before it is back sent a milker to the sign-in mid-shift.
  const restored = keepQueriesOnDevice(queryClient, pageHost());

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { orpc, queryClient, restored },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: PageFailed,
    // The scripts the server writes into the page carry the nonce both addresses' policies let run.
    ssr: { nonce: pageNonce() },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
