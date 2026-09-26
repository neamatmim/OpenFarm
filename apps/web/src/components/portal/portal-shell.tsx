import { formatNumber } from "@OpenFarm/i18n";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Handshake,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Sprout,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import LanguageToggle from "@/components/language-toggle";
import { Notice } from "@/components/page";
import {
  usePortalPlaces,
  usePreviewing,
  useTheirOpenVentures,
  useTheirPortfolio,
  useTheirRecord,
} from "@/components/portal/portal-source";
import { BottomBar } from "@/components/shell/bottom-bar";
import type { NavItem } from "@/components/shell/navigation";
import { ThemeMenu } from "@/components/theme-menu";
import { Initials } from "@/components/user-menu";
import { Wordmark } from "@/components/wordmark";
import { useLanguage, useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { leaveTheEndedSignIn } from "@/lib/ended-sign-in";
import { useOnline } from "@/lib/online";
import { forgetWhatThisPhoneRead } from "@/lib/query-cache";
import { wordOf } from "@/lib/saying";

import { PortalNotice } from "./portal-door";

/** The portal's destinations on a phone, beside More for the Ventures: their portfolio, their money, their papers and
 *  their account — wherever the portal is drawn. While the farm is raising capital for a Venture it shows them, that
 *  takes their account's place, which is still under More: a sixth would crowd the bar. */
const bottomBarOf = (
  places: ReturnType<typeof usePortalPlaces>,
  raising: boolean
): readonly NavItem[] => [
  {
    to: places.home.path,
    label: "portal.nav.portfolio",
    icon: LayoutDashboard,
    audience: "anyone",
  },
  {
    to: places.money.path,
    label: "portal.nav.money",
    icon: ScrollText,
    audience: "anyone",
  },
  {
    to: places.papers.path,
    label: "portal.nav.papers",
    icon: FileText,
    audience: "anyone",
  },
  raising
    ? {
        to: places.openVentures.path,
        label: "portal.nav.raising",
        icon: Sprout,
        audience: "anyone",
      }
    : {
        to: places.account.path,
        label: "portal.nav.account",
        icon: UserRound,
        audience: "anyone",
      },
];
/** Whether a destination is the page being shown. The portfolio is only itself: every portal page is inside it. */
const isHere = (to: string, home: string, pathname: string) =>
  to === home
    ? pathname === home || pathname === `${home}/`
    : pathname === to || pathname.startsWith(`${to}/`);

/** One line of the sidebar, drawn as the farm's own sidebar draws its lines. */
const PortalNavLink = ({
  to,
  params,
  label,
  icon: Icon,
  here,
  onGo,
  count,
  fresh = false,
}: {
  to: string;
  params?: { agreementId: string };
  label: string;
  icon: LucideIcon;
  here: boolean;
  onGo: () => void;
  /** How many there are, in the reader's own digits, said beside it; nothing for none. */
  count?: string;
  /** Whether any of them is new to the reader, which sets the count in the brand's colour. */
  fresh?: boolean;
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
    {count ? (
      <SidebarMenuBadge
        className={cn(
          "tabular-nums",
          fresh && "bg-sidebar-primary text-sidebar-primary-foreground"
        )}
      >
        {count}
      </SidebarMenuBadge>
    ) : null}
  </SidebarMenuItem>
);

/**
 * The portal's side of the screen, the farm's sidebar in every way but what is on it: their portfolio, their money and
 * their papers, each Venture they are in, and their account at its foot — collapsing to icons on a desk and sliding
 * over on a phone.
 */
const PortalSidebar = ({ farmName }: { farmName: string | null }) => {
  const t = useT();
  const { language } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const theirs = useTheirPortfolio();
  const places = usePortalPlaces();
  const home = places.home.path;
  const here = (to: string) => isHere(to, home, pathname);
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const ventures = theirs.data?.agreements ?? [];
  const offered = useTheirOpenVentures().data ?? [];
  return (
    <Sidebar collapsible="icon" data-app-chrome mobileTitle={t("nav.menu")}>
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2.5">
        <Link
          className="focus-visible:ring-sidebar-ring flex h-12 items-center gap-3 rounded-lg px-1 outline-none group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
          onClick={close}
          to={home}
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
                here={here(home)}
                icon={LayoutDashboard}
                label={t("portal.nav.portfolio")}
                onGo={close}
                to={places.home.path}
              />
              <PortalNavLink
                here={here(places.money.path)}
                icon={ScrollText}
                label={t("portal.nav.money")}
                onGo={close}
                to={places.money.path}
              />
              <PortalNavLink
                here={here(places.papers.path)}
                icon={FileText}
                label={t("portal.nav.papers")}
                onGo={close}
                to={places.papers.path}
              />
              {/* Only while the farm is raising capital for a Venture it shows them. */}
              {offered.length > 0 ? (
                <PortalNavLink
                  count={formatNumber(offered.length, language)}
                  fresh={offered.some((one) => one.isNew === true)}
                  here={here(places.openVentures.path)}
                  icon={Sprout}
                  label={t("portal.open.title")}
                  onGo={close}
                  to={places.openVentures.path}
                />
              ) : null}
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
                    here={here(places.venture(one.id).path)}
                    icon={Handshake}
                    key={one.id}
                    label={one.venture.name}
                    onGo={close}
                    to={places.venture(one.id).path}
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
            here={here(places.account.path)}
            icon={UserRound}
            label={t("portal.nav.account")}
            onGo={close}
            to={places.account.path}
          />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t("nav.menu")} title={t("nav.menu")} />
    </Sidebar>
  );
};

/** Whose portal this is — an Investor, by name and phone — their account, and the way out: signing out in their own
 *  portal, back to their page in the Owner's Preview. */
const PortalUserMenu = ({ name, phone }: { name: string; phone: string }) => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const places = usePortalPlaces();
  const previewing = usePreviewing();
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
        <DropdownMenuItem render={<Link to={places.account.path} />}>
          <UserRound aria-hidden />
          {t("portal.nav.account")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {previewing ? (
          // The Owner reading somebody's portal signs nobody out: the way out is back to that Investor's page.
          <DropdownMenuItem
            render={
              <Link
                params={{ investorId: previewing.investorId }}
                to="/investors/$investorId"
              />
            }
          >
            <ArrowLeft aria-hidden />
            {t("portal.preview.back", { name: previewing.name })}
          </DropdownMenuItem>
        ) : (
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
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Leaves the portal the moment any question it asks is answered that the sign-in has run its day — not only at the
 * next page, since a tab left open past its day would otherwise go on showing what it read in it.
 */
const useLeaveWhenTheDayIsDone = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const dayIsDone =
          event.type === "updated" &&
          event.action.type === "error" &&
          wordOf(event.action.error) === "signed_in_too_long";
        if (!dayIsDone) {
          return;
        }
        const leave = async () => {
          await leaveTheEndedSignIn(queryClient);
          await navigate({ search: { ended: true }, to: "/portal/login" });
        };
        void leave();
      }),
    [queryClient, navigate]
  );
};

/**
 * Keeps the page's scroll padding as tall as what is pinned over it — the Preview's band wraps onto a second line on a
 * phone — so a control reached by Tab never stops under it (WCAG 2.4.11; `--pinned-top` in globals.css).
 */
const usePinnedTop = () => {
  const pinned = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const block = pinned.current;
    const root = document.documentElement;
    if (!block) {
      return;
    }
    const measure = () =>
      root.style.setProperty("--pinned-top", `${block.offsetHeight}px`);
    // Measured now, and again whenever it changes height: an observer says nothing until the page is next painted.
    measure();
    const watching =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    watching?.observe(block);
    return () => {
      watching?.disconnect();
      root.style.removeProperty("--pinned-top");
    };
  }, []);
  return pinned;
};

/**
 * Every portal page, framed as every farm page is (ADR 0007 keeps the two apart, not unalike): the sidebar, the bar
 * over the page with the reader's settings and their menu, the page, the phone's bottom bar — and under every page,
 * what the portal is and whom to ask.
 */
export const PortalShell = ({
  band,
  children,
}: {
  /** Drawn over every page, above the bar: the Preview's word on whose portal this is. */
  band?: ReactNode;
  children: ReactNode;
}) => {
  const t = useT();
  const me = useTheirRecord();
  const places = usePortalPlaces();
  // With no connection the page says so, rather than show figures the tab read earlier as though they were today's:
  // the portal keeps nothing on the phone to open with (ADR 0009).
  const online = useOnline();
  useLeaveWhenTheDayIsDone();
  const pinned = usePinnedTop();
  const raising = (useTheirOpenVentures().data?.length ?? 0) > 0;
  return (
    <SidebarProvider>
      <PortalSidebar farmName={me.data?.farm.name ?? null} />
      <SidebarInset className="min-w-0">
        {/* The band and the bar are pinned together, so the Preview's band never covers the reader's settings. */}
        <div className="sticky top-0 z-30" data-app-chrome ref={pinned}>
          {band}
          <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-5">
            <SidebarTrigger
              aria-label={t("nav.menu")}
              className="-ml-1 size-9"
            />
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
        </div>
        <main
          className="flex-1 pb-24 outline-none md:pb-4"
          id="main"
          tabIndex={-1}
        >
          {online ? (
            children
          ) : (
            <div className="px-4 py-6 md:px-8">
              <Notice
                icon={WifiOff}
                title={t("portal.noConnection")}
                tone="warning"
              >
                {t("portal.noConnectionHint")}
              </Notice>
            </div>
          )}
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
      <BottomBar items={bottomBarOf(places, raising)} />
    </SidebarProvider>
  );
};
