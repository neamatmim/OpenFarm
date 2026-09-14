import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@OpenFarm/ui/components/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, Sprout } from "lucide-react";

import { useT } from "@/i18n/language-provider";

import type { Role } from "./navigation";
import { navFor } from "./navigation";

/** Whether a destination is the page being shown, or a page inside it (an animal inside Animals). */
const isHere = (to: string, pathname: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

/**
 * The farm's whole system on one side of the screen: grouped by the farm's work, filtered by the Roles a person
 * holds, collapsing to icons on a desk and sliding over on a phone.
 */
export const AppSidebar = ({
  roles,
  farmName,
}: {
  roles: readonly Role[];
  farmName: string | null;
}) => {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon" data-app-chrome mobileTitle={t("nav.menu")}>
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2.5">
        <Link
          className="focus-visible:ring-sidebar-ring flex items-center gap-3 rounded-lg px-1 py-1 outline-none group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
          onClick={close}
          to="/"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg shadow-sm">
            <Sprout aria-hidden className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-base font-semibold tracking-tight">
              {t("app.name")}
            </span>
            <span className="text-sidebar-foreground/65 truncate text-xs">
              {farmName ?? t("shell.farm")}
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 pb-2">
        {navFor(roles).map((group) => (
          <SidebarGroup
            className="py-1.5 group-data-[collapsible=icon]:px-2.5"
            key={group.label}
          >
            <SidebarGroupLabel className="text-sidebar-foreground/70 text-xs font-semibold">
              {t(group.label)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      className="data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground h-9 text-[0.9rem] group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center data-active:font-medium"
                      isActive={isHere(item.to, pathname)}
                      render={<Link onClick={close} to={item.to} />}
                      tooltip={t(item.label)}
                    >
                      <item.icon aria-hidden />
                      <span>{t(item.label)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t p-2 group-data-[collapsible=icon]:px-2.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-9 group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center"
              isActive={isHere("/settings", pathname)}
              render={<Link onClick={close} to="/settings" />}
              tooltip={t("nav.settings")}
            >
              <Settings aria-hidden />
              <span>{t("nav.settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t("nav.menu")} title={t("nav.menu")} />
    </Sidebar>
  );
};
