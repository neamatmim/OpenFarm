import { useSidebar } from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { useT } from "@/i18n/language-provider";

import type { NavItem } from "./navigation";

const tab =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A phone's few daily destinations — the Role a person lands as on the farm, or an Investor's in the portal — and
 * More for everything else: thumb-reach, labelled, never icons alone. Hidden while somebody is working a Step, so the
 * completion action owns the bottom.
 */
export const BottomBar = ({ items }: { items: readonly NavItem[] }) => {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label={t("nav.menu")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur md:hidden"
      data-app-chrome
      data-slot="bottom-bar"
    >
      {items.map((item) => {
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
            data-slot="bottom-bar-item"
            key={item.to}
            to={item.to}
          >
            <span
              className={cn(
                "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                here && "bg-secondary"
              )}
            >
              <item.icon aria-hidden className="size-5" />
              {item.count ? (
                <span
                  className={cn(
                    "absolute -top-1 right-1 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold tabular-nums",
                    item.fresh
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate">{t(item.label)}</span>
          </Link>
        );
      })}
      <button
        aria-expanded={openMobile}
        className={cn(
          tab,
          openMobile
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
        data-slot="bottom-bar-item"
        onClick={() => setOpenMobile(true)}
        type="button"
      >
        <span
          className={cn(
            "grid h-7 w-12 place-items-center rounded-full transition-colors",
            openMobile && "bg-secondary"
          )}
        >
          <Menu aria-hidden className="size-5" />
        </span>
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
};
