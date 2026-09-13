import { SidebarInset, SidebarProvider } from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import { AppSidebar } from "./app-sidebar";
import { BottomBar } from "./bottom-bar";
import type { Role } from "./navigation";
import { primaryRole } from "./navigation";
import { TopBar } from "./top-bar";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** A screen that belongs to the work in hand — a Step being worked — where the phone's bottom bar steps aside
     *  so the completion action owns the bottom of the screen. */
    focusedWork?: boolean;
  }
}

/**
 * Every signed-in page: the grouped sidebar, the top bar, the page, and on a phone the Role's bottom bar. The page
 * itself decides its width and layout; the shell only frames it.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const me = useQuery(orpc.people.me.queryOptions());
  const focused = useMatches({
    select: (matches) => matches.some((match) => match.staticData?.focusedWork),
  });
  const roles = (me.data?.roles ?? []) as Role[];

  return (
    <SidebarProvider>
      <a
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        href="#main"
      >
        {t("shell.skip")}
      </a>
      <AppSidebar farmName={me.data?.farm?.name ?? null} roles={roles} />
      <SidebarInset className="min-w-0">
        <TopBar />
        <main
          className={cn(
            "flex-1 outline-none",
            focused ? "pb-6" : "pb-24 md:pb-10"
          )}
          id="main"
          tabIndex={-1}
        >
          {children}
        </main>
      </SidebarInset>
      {focused ? null : <BottomBar role={primaryRole(roles)} />}
    </SidebarProvider>
  );
};
