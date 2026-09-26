import { Toaster } from "@OpenFarm/ui/components/sonner";
import { TooltipProvider } from "@OpenFarm/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import { evlogErrorHandler } from "evlog/nitro/v3";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";

import { forgetShell } from "@/lib/install";
import { HOST_ATTRIBUTE, pageHost } from "@/lib/page-context";
import type { orpc } from "@/utils/orpc";

import { LanguageProvider, useT } from "../i18n/language-provider";

import appCss from "../index.css?url";

/** The router and query devtools cover the phone's bottom bar and actions; they show only when a developer sets
 *  VITE_DEVTOOLS=true. */
const SHOW_DEVTOOLS = import.meta.env.VITE_DEVTOOLS === "true";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

/** On the portal's own address, whatever service worker an older visit left there is taken away. */
const useNoShellOnThePortal = () => {
  useEffect(() => {
    if (pageHost() === "portal") {
      void forgetShell();
    }
  }, []);
};

const RootDocument = () => {
  useNoShellOnThePortal();
  // The theme's inline script runs under the Investor address's policy only with the page's nonce.
  const { nonce } = useRouter().options.ssr ?? {};
  // Which address this is, written on the page for the browser to read back (lib/page-context).
  const host = pageHost();
  return (
    // The theme class lands on the html element before React arrives, from what this device chose.
    <html {...{ [HOST_ATTRIBUTE]: host }} lang="bn" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      {/* Browser extensions (a grammar checker, a password manager) write attributes onto the body before React
        arrives; they are not the page's, and must not make React throw the page away. */}
      <body suppressHydrationWarning>
        {/* Light by default — the shed is in sunlight — and dark or this device's own choice when the person asks. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem
          nonce={nonce}
          storageKey="openfarm.theme"
        >
          <LanguageProvider>
            <TooltipProvider>
              <div className="min-h-svh">
                <SkipToMain />
                <Outlet />
              </div>
            </TooltipProvider>
          </LanguageProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        {SHOW_DEVTOOLS ? (
          <>
            <TanStackRouterDevtools position="bottom-left" />
            <ReactQueryDevtools
              position="bottom"
              buttonPosition="bottom-right"
            />
          </>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },

  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "color-scheme",
        content: "light dark",
      },
      {
        name: "theme-color",
        content: "#315d4d",
      },
      {
        title: "OpenFarm",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // What makes the app installable on a barn phone's home screen — and on the portal's own address, an icon that
      // opens the portal there rather than the farm's first page, which that address does not serve.
      {
        rel: "manifest",
        href:
          pageHost() === "portal"
            ? "/portal.webmanifest"
            : "/manifest.webmanifest",
      },
      {
        rel: "icon",
        href: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
  }),

  component: RootDocument,
});

const focusMain = () => {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>("#main")?.focus()
  );
};

/** The first keyboard stop on every public and signed-in route. */
const SkipToMain = () => {
  const t = useT();
  return (
    <a
      className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 shadow-lg focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      href="#main"
      onClick={focusMain}
    >
      {t("shell.skip")}
    </a>
  );
};
