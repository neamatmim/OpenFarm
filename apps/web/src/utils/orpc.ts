import { createContext } from "@OpenFarm/api/context";
import { DEVICE_TOKEN_HEADER, SWITCH_TOKEN_HEADER } from "@OpenFarm/api/device";
import { appRouter } from "@OpenFarm/api/routers/index";
import type { MessageKey } from "@OpenFarm/i18n";
import { DEFAULT_LANGUAGE, isLanguage, translate } from "@OpenFarm/i18n";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { toast } from "sonner";

import { getDeviceToken, getSwitchToken } from "@/lib/device";

/** What a failed read says, in the language the page is showing: a code the person can act on, never the server's
 *  English. A read their Role may not make is not worth retrying. */
const sayFailure = (
  error: Error
): { key: MessageKey; retry: boolean } | null => {
  const { code } = error as { code?: unknown };
  // Nothing there is the page's to say — "no such animal" in its own words — not a failed connection.
  if (code === "NOT_FOUND") {
    return null;
  }
  if (code === "FORBIDDEN") {
    return { key: "common.forbidden", retry: false };
  }
  if (code === "UNAUTHORIZED") {
    return { key: "common.signedOut", retry: false };
  }
  return { key: "common.loadFailed", retry: true };
};

const pageLanguage = () => {
  const lang =
    typeof document === "undefined" ? null : document.documentElement.lang;
  return isLanguage(lang) ? lang : DEFAULT_LANGUAGE;
};

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const language = pageLanguage();
        const failure = sayFailure(error);
        if (!failure) {
          return;
        }
        const { key, retry } = failure;
        toast.error(translate(language, key), {
          // One toast per kind of failure, not one per query that met it.
          id: key,
          action: retry
            ? {
                label: translate(language, "common.retry"),
                onClick: () => {
                  query.invalidate();
                },
              }
            : undefined,
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        // Kept long enough to be worth restoring from the device after a day in the shed.
        gcTime: 14 * 24 * 60 * 60 * 1000,
        // A phone with no signal is not a phone with an error: it shows what it last knew,
        // and tries again when the network comes back.
        networkMode: "offlineFirst",
        retry: 1,
      },
    },
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
        // A Shed Phone identifies itself by its device token and the switch token it got
        // by proving a PIN; a personal session sends neither and uses its cookie.
        const token = getDeviceToken();
        const switchToken = getSwitchToken();
        const headers = new Headers(options?.headers);
        if (token) {
          headers.set(DEVICE_TOKEN_HEADER, token);
          if (switchToken) {
            headers.set(SWITCH_TOKEN_HEADER, switchToken);
          }
        }
        return fetch(url, { ...options, headers, credentials: "include" });
      },
    });

    return createORPCClient(link);
  });

export const client: RouterClient<typeof appRouter> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
