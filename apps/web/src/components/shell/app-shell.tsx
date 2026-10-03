import { SidebarInset, SidebarProvider } from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { useShedPhoneKeeper } from "@/lib/shed-phone";
import { orpc } from "@/utils/orpc";

import { AppSidebar } from "./app-sidebar";
import { BottomBar } from "./bottom-bar";
import type { Role } from "./navigation";
import { BOTTOM_BAR, primaryRole } from "./navigation";
import { TopBar } from "./top-bar";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** A screen that belongs to the work in hand — a Step being worked — where the phone's bottom bar steps aside
     *  so the completion action owns the bottom of the screen. */
    focusedWork?: boolean;
  }
}

/** Wide enough for the sidebar and a table beside it. Below this a tablet keeps the sidebar to its icons. */
const ROOM_FOR_THE_SIDEBAR = "(min-width: 1024px)";

/** Where this device keeps whether its reader closed the sidebar on a laptop. */
const SIDEBAR_KEPT = "openfarm.sidebar";

/** The reader's own choice on this device, where the device will say: browser storage can be shut. */
const keptChoice = (): boolean | null => {
  try {
    const kept = window.localStorage.getItem(SIDEBAR_KEPT);
    return kept === null ? null : kept === "open";
  } catch {
    return null;
  }
};

const keepChoice = (open: boolean) => {
  try {
    window.localStorage.setItem(SIDEBAR_KEPT, open ? "open" : "closed");
  } catch {
    // Not kept, then: the sidebar opens again next time, as it always did.
  }
};

/**
 * Whether the sidebar stands open: open on a laptop, down to its icons on a tablet, where the whole sidebar would
 * leave a table half the screen. On a laptop it opens as its reader last left it on this device, as Carbon's shell
 * leaves the choice to the person; closed there, it stays closed after a reload. Whoever opens or closes it has it
 * their way until the screen itself changes width across the line — a tablet turned on its side — and then it
 * follows the screen again. A phone has its own drawer and is not this. The Investor portal's sidebar follows the
 * same rule.
 */
export const useSidebarOpen = () => {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const room = window.matchMedia(ROOM_FOR_THE_SIDEBAR);
    const follow = () => setOpen(room.matches && (keptChoice() ?? true));
    follow();
    room.addEventListener("change", follow);
    return () => room.removeEventListener("change", follow);
  }, []);
  const choose = useCallback((next: boolean) => {
    setOpen(next);
    if (window.matchMedia(ROOM_FOR_THE_SIDEBAR).matches) {
      keepChoice(next);
    }
  }, []);
  return [open, choose] as const;
};

/**
 * Every signed-in page: the grouped sidebar, the top bar, the page, and on a phone the Role's bottom bar. The page
 * itself decides its width and layout; the shell only frames it.
 */
export const AppShell = ({ children }: { children: ReactNode }) => {
  useShedPhoneKeeper();
  const me = useQuery(orpc.people.me.queryOptions());
  const focused = useMatches({
    select: (matches) => matches.some((match) => match.staticData?.focusedWork),
  });
  const roles = (me.data?.roles ?? []) as Role[];
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen();

  return (
    <SidebarProvider onOpenChange={setSidebarOpen} open={sidebarOpen}>
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
      {focused || roles.length === 0 ? null : (
        <BottomBar items={BOTTOM_BAR[primaryRole(roles)]} />
      )}
    </SidebarProvider>
  );
};
