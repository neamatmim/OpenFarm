import type { MessageKey } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Building2,
  Dna,
  FileSignature,
  Globe,
  MoonStar,
  SlidersHorizontal,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { useIsOwner } from "@/components/money";
import { useT } from "@/i18n/language-provider";

interface SettingsSectionLink {
  to:
    | "/farm"
    | "/farm/rules"
    | "/farm/money"
    | "/farm/portal"
    | "/farm/agreement-templates"
    | "/farm/people"
    | "/farm/shed-phones"
    | "/farm/breeds"
    | "/farm/eid-dates"
    | "/farm/backups";
  label: MessageKey;
  icon: LucideIcon;
  /** The Owner's alone, as its page is. */
  owner?: boolean;
}

/** Every part of the farm's settings, in the order a farm is set up: what it is, how it behaves, its money, what
 *  its Investors see, who works on it, its lists, and last whether it is being copied off its machine. */
const SECTIONS: readonly SettingsSectionLink[] = [
  { to: "/farm", label: "settings.section.farm", icon: Building2 },
  {
    to: "/farm/rules",
    label: "settings.section.rules",
    icon: SlidersHorizontal,
  },
  { to: "/farm/money", label: "settings.section.money", icon: Wallet },
  {
    to: "/farm/portal",
    label: "settings.section.portal",
    icon: Globe,
    owner: true,
  },
  {
    to: "/farm/agreement-templates",
    label: "nav.templates",
    icon: FileSignature,
    owner: true,
  },
  { to: "/farm/people", label: "nav.people", icon: Users },
  { to: "/farm/shed-phones", label: "nav.devices", icon: Smartphone },
  { to: "/farm/breeds", label: "nav.breeds", icon: Dna },
  { to: "/farm/eid-dates", label: "settings.section.eid", icon: MoonStar },
  { to: "/farm/backups", label: "nav.backups", icon: Archive },
];

/**
 * The farm's settings in one place, as GitHub's, Shopify's and Microsoft 365's are: its parts listed down the left on
 * a desk, the part open beside them, and on a phone the same parts in a row to swipe along. Each part is a page of
 * its own, so a link can go straight to one; the Farm details part is `/farm` itself, matched exactly.
 */
export const SettingsNav = () => {
  const t = useT();
  const owner = useIsOwner();
  const shown = SECTIONS.filter((section) => !section.owner || owner);
  const list = useRef<HTMLUListElement>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // On a phone the parts are a row wider than the screen: the open one is brought into it.
  useEffect(() => {
    const open =
      list.current?.querySelector(`[href="${pathname}"]`) ??
      // A page inside a part (one person) is marked by its part's link.
      list.current?.querySelector("[data-status=active]");
    open?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav
      aria-label={t("nav.identity")}
      className="lg:bg-card/40 border-b lg:w-60 lg:shrink-0 lg:border-e lg:border-b-0"
    >
      <p className="text-muted-foreground hidden px-6 pt-8 pb-2 text-xs font-semibold tracking-wider uppercase lg:block">
        {t("nav.identity")}
      </p>
      <ul
        ref={list}
        className="flex gap-1 overflow-x-auto px-4 py-2 lg:sticky lg:top-14 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-3 lg:py-0"
      >
        {shown.map(({ to, label, icon: Icon }) => (
          <li className="shrink-0" key={to}>
            <Link
              activeOptions={{ exact: to === "/farm" }}
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring relative flex h-11 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 md:h-9",
                "data-[status=active]:bg-muted data-[status=active]:text-foreground data-[status=active]:font-medium",
                // The current part is marked as the sidebar marks its page: a bar at its edge, on a desk.
                "lg:data-[status=active]:before:bg-primary lg:data-[status=active]:before:absolute lg:data-[status=active]:before:inset-y-2 lg:data-[status=active]:before:start-0 lg:data-[status=active]:before:w-[3px] lg:data-[status=active]:before:rounded-full"
              )}
              to={to}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {t(label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
