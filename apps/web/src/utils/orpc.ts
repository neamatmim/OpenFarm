import { createContext } from "@OpenFarm/api/context";
import { ACTIVE_USER_HEADER, DEVICE_TOKEN_HEADER } from "@OpenFarm/api/device";
import { appRouter } from "@OpenFarm/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

import { getActiveUser, getDeviceToken } from "@/lib/device";

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: () => createContext({ req: getRequest() }),
    })
  )
  .client((): RouterClient<typeof appRouter> => {
    const link = new RPCLink({
      url: "/api/rpc",
      origin: window.location.origin,
      fetch(url, options) {
        // A Shed Phone identifies itself by its device token and whoever is PIN-switched
        // in; a personal session sends neither and is authenticated by its cookie.
        const token = getDeviceToken();
        const active = getActiveUser();
        const headers = new Headers(options?.headers);
        if (token) {
          headers.set(DEVICE_TOKEN_HEADER, token);
          if (active) {
            headers.set(ACTIVE_USER_HEADER, active.userId);
          }
        }
        return fetch(url, { ...options, headers, credentials: "include" });
      },
    });

    return createORPCClient(link);
  });

export const client: RouterClient<typeof appRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
