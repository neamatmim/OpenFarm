import { Button } from "@OpenFarm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@OpenFarm/ui/components/sidebar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  FileText,
  Handshake,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Sprout,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import LanguageToggle from "@/components/language-toggle";
import { BottomBar } from "@/components/shell/bottom-bar";
import type { NavItem } from "@/components/shell/navigation";
import { ThemeMenu } from "@/components/theme-menu";
import { Initials } from "@/components/user-menu";
import { Wordmark } from "@/components/wordmark";
import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { forgetWhatThisPhoneRead } from "@/lib/query-cache";
import { orpc } from "@/utils/orpc";

import { PortalNotice } from "./portal-door";

/** The portal's destinations on a phone, beside More for the Ventures: their portfolio, their money, their papers and
 *  their account. */
const PORTAL_BOTTOM_BAR: readonly NavItem[] = [
  {
    to: "/portal",
    label: "portal.nav.portfolio",
    icon: LayoutDashboard,
    audience: "anyone",
  },
  {
    to: "/portal/money",
    label: "portal.nav.money",
    icon: ScrollText,
    audience: "anyone",
  },
  {
    to: "/portal/papers",
    label: "portal.nav.papers",
    icon: FileText,
    audience: "anyone",
  },
  {
    to: "/portal/account",
    label: "portal.nav.account",
    icon: UserRound,
    audience: "anyone",
  },
];
/** Whether a destination is the page being shown. The portfolio is only itself: every portal page is inside it. */
const isHere = (to: string, pathname: string) =>
  to === "/portal"
    ? pathname === "/portal" || pathname === "/portal/"
    : pathname === to || pathname.startsWith(`${to}/`);

/** One line of the sidebar, drawn as the farm's own sidebar draws its lines. */
const PortalNavLink = ({
  to,
  params,
  label,
  icon: Icon,
  here,
  onGo,
}: {
  to: string;
  params?: { agreementId: string };
  label: string;
  icon: LucideIcon;
  here: boolean;
  onGo: () => void;
}) => (
  <SidebarMenuItem>
    <SidebarMenuButton
      className="data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground h-9 gap-3 px-3 text-sm group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center data-active:font-medium"
      isActive={here}
      render={
        <Link
          aria-current={here ? "page" : undefined}
          onClick={onGo}
          params={params}
          to={to}
        />
      }
      tooltip={label}
    >
      <Icon aria-hidden />
      <span className="truncate">{label}</span>
    </SidebarMenuButton>
  </SidebarMenuItem>
);

/**
 * The portal's side of the screen, the farm's sidebar in every way but what is on it: their portfolio, their money and
 * their papers, each Venture they are in, and their account at its foot — collapsing to icons on a desk and sliding
 * over on a phone.
 */
const PortalSidebar = ({ farmName }: { farmName: string | null }) => {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const ventures = theirs.data?.agreements ?? [];
  return (
    <Sidebar collapsible="icon" data-app-chrome mobileTitle={t("nav.menu")}>
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2.5">
        <Link
          className="focus-visible:ring-sidebar-ring flex h-12 items-center gap-3 rounded-lg px-1 outline-none group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
          onClick={close}
          to="/portal"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <Sprout aria-hidden className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <Wordmark className="truncate" />
            <span className="text-sidebar-foreground/65 truncate text-xs">
              {farmName ?? t("portal.title")}
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 pb-2">
        <SidebarGroup className="py-1.5 group-data-[collapsible=icon]:px-2.5">
          <SidebarGroupLabel className="text-sidebar-foreground/70 px-3 text-xs font-semibold">
            {t("portal.title")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <PortalNavLink
                here={isHere("/portal", pathname)}
                icon={LayoutDashboard}
                label={t("portal.nav.portfolio")}
                onGo={close}
                to="/portal"
              />
              <PortalNavLink
                here={isHere("/portal/money", pathname)}
                icon={ScrollText}
                label={t("portal.nav.money")}
                onGo={close}
                to="/portal/money"
              />
              <PortalNavLink
                here={isHere("/portal/papers", pathname)}
                icon={FileText}
                label={t("portal.nav.papers")}
                onGo={close}
                to="/portal/papers"
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {ventures.length > 0 ? (
          <SidebarGroup className="py-1.5 group-data-[collapsible=icon]:px-2.5">
            <SidebarGroupLabel className="text-sidebar-foreground/70 px-3 text-xs font-semibold">
              {t("portal.yourVentures")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {ventures.map((one) => (
                  <PortalNavLink
                    here={isHere(`/portal/ventures/${one.id}`, pathname)}
                    icon={Handshake}
                    key={one.id}
                    label={one.venture.name}
                    onGo={close}
                    params={{ agreementId: one.id }}
                    to="/portal/ventures/$agreementId"
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t p-2 group-data-[collapsible=icon]:px-2.5">
        <SidebarMenu>
          <PortalNavLink
            here={isHere("/portal/account", pathname)}
            icon={UserRound}
            label={t("portal.nav.account")}
            onGo={close}
            to="/portal/account"
          />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t("nav.menu")} title={t("nav.menu")} />
    </Sidebar>
  );
};

/** Who is signed in to the portal — an Investor, by name and phone — their account, and the way out. */
const PortalUserMenu = ({ name, phone }: { name: string; phone: string }) => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("auth.myAccount")}
            className="gap-2 ps-1.5 pe-2"
            variant="ghost"
          />
        }
      >
        <Initials name={name} />
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <ChevronDown aria-hidden className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Initials large name={name} />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-medium">{name}</p>
            <p className="text-muted-foreground truncate text-sm tabular-nums">
              {phone}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {t("portal.anInvestor")}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/portal/account" />}>
          <UserRound aria-hidden />
          {t("portal.nav.account")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            // Forgotten first, so nothing they read stays behind them — in the tab or on the phone — even if signing
            // out itself does not go through (ASVS 14.3.1).
            await forgetWhatThisPhoneRead(queryClient);
            await authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  void navigate({ to: "/portal/login" });
                },
              },
            });
          }}
          variant="destructive"
        >
          <LogOut aria-hidden />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Every portal page, framed as every farm page is (ADR 0007 keeps the two apart, not unalike): the sidebar, the bar
 * over the page with the reader's settings and their menu, the page, the phone's bottom bar — and under every page,
 * what the portal is and whom to ask.
 */
export const PortalShell = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const me = useQuery(orpc.portal.me.queryOptions());
  return (
    <SidebarProvider>
      <PortalSidebar farmName={me.data?.farm.name ?? null} />
      <SidebarInset className="min-w-0">
        <header
          className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-5"
          data-app-chrome
        >
          <SidebarTrigger aria-label={t("nav.menu")} className="-ml-1 size-9" />
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-1">
            <LanguageToggle />
            <ThemeMenu />
            {me.data ? (
              <PortalUserMenu
                name={me.data.name}
                phone={me.data.record.phone}
              />
            ) : null}
          </div>
        </header>
        <main
          className="flex-1 pb-24 outline-none md:pb-4"
          id="main"
          tabIndex={-1}
        >
          {children}
          <PortalNotice>
            {me.data?.farm.phone ? (
              <p>
                {t("portal.askTheFarm", {
                  farm: me.data.farm.name,
                  phone: me.data.farm.phone,
                })}
              </p>
            ) : null}
          </PortalNotice>
        </main>
      </SidebarInset>
      <BottomBar items={PORTAL_BOTTOM_BAR} />
    </SidebarProvider>
  );
};
