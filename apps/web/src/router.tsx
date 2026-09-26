import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import NotFound from "./components/not-found";
import { pageNonce } from "./lib/nonce";
import { keepQueriesOnDevice } from "./lib/query-cache";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc } from "./utils/orpc";

export const getRouter = () => {
  const queryClient = createQueryClient();
  // What the app has read is kept on the device, so a phone that opens with no signal opens
  // on what it last knew rather than on a spinner.
  keepQueriesOnDevice(queryClient);

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { orpc, queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: NotFound,
    // The scripts the server writes into the page carry the nonce the Investor address's policy lets run.
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
