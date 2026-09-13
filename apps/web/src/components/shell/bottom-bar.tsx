import { useSidebar } from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { useT } from "@/i18n/language-provider";

import type { Role } from "./navigation";
import { BOTTOM_BAR } from "./navigation";

const tab =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.72rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A phone's few daily destinations for the Role a person lands as, and More for everything else — thumb-reach,
 * labelled, never icons alone. Hidden while somebody is working a Step, so the completion action owns the bottom.
 */
export const BottomBar = ({ role }: { role: Role }) => {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label={t("nav.menu")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur md:hidden"
      data-app-chrome
    >
      {BOTTOM_BAR[role].map((item) => {
        const here = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            aria-current={here ? "page" : undefined}
            className={cn(
              tab,
              here
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={item.to}
            to={item.to}
          >
            <span
              className={cn(
                "grid h-7 w-12 place-items-center rounded-full transition-colors",
                here && "bg-secondary"
              )}
            >
              <item.icon aria-hidden className="size-5" />
            </span>
            <span className="max-w-full truncate">{t(item.label)}</span>
          </Link>
        );
      })}
      <button
        className={cn(tab, "text-muted-foreground hover:text-foreground")}
        onClick={() => setOpenMobile(true)}
        type="button"
      >
        <span className="grid h-7 w-12 place-items-center rounded-full">
          <Menu aria-hidden className="size-5" />
        </span>
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
};
