import { Toaster } from "@OpenFarm/ui/components/sonner";
import { TooltipProvider } from "@OpenFarm/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import { evlogErrorHandler } from "evlog/nitro/v3";
import { ThemeProvider } from "next-themes";

import type { orpc } from "@/utils/orpc";

import { LanguageProvider } from "../i18n/language-provider";

import appCss from "../index.css?url";

/** The router and query devtools cover the phone's bottom bar and actions; they show only when a developer sets
 *  VITE_DEVTOOLS=true. */
const SHOW_DEVTOOLS = import.meta.env.VITE_DEVTOOLS === "true";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

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
        title: "OpenFarm",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // What makes the app installable on a barn phone's home screen.
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
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

function RootDocument() {
  return (
    // The theme class lands on the html element before React arrives, from what this device chose.
    <html lang="bn" suppressHydrationWarning>
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
          storageKey="openfarm.theme"
        >
          <LanguageProvider>
            <TooltipProvider>
              <div className="min-h-svh">
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
}
