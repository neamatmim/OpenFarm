import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, FileText, Sprout, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { DoorScreen } from "@/components/door-screen";
import LanguageToggle from "@/components/language-toggle";
import { usePortalPlaces } from "@/components/portal/portal-source";
import { ThemeMenu } from "@/components/theme-menu";
import { Wordmark } from "@/components/wordmark";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The way to «আপনার তথ্য», wherever the portal is drawn: the Investor's own, or the Owner's Preview of it. */
export const YourDataLink = () => {
  const { t } = useLanguage();
  const { yourData } = usePortalPlaces();
  return (
    <Link
      className="text-primary underline underline-offset-4"
      params={yourData.link.params}
      to={yourData.link.to}
    >
      {t("portal.yourData.link")}
    </Link>
  );
};

/**
 * What the portal is, said on every page of it: an Investor's own Agreements with the farm and nothing more — not an
 * offer, and no money moves through it (ADR 0007). Said because a lawyer has still to answer whether a portal makes
 * the farm a platform, and a page that could read as one should say plainly that it is not.
 */
export const PortalNotice = ({ children }: { children?: ReactNode }) => {
  const { t } = useLanguage();
  return (
    <footer className="text-muted-foreground mx-auto flex w-full max-w-xl flex-col gap-1 px-4 py-6 text-center text-xs text-balance">
      <p>{t("portal.notice")}</p>
      <p>
        <YourDataLink />
      </p>
      {children}
    </footer>
  );
};

/**
 * The bar over the portal's door, as the portal's own sidebar is after it: the farm an Investor deals with under the
 * name of the app, or "Investor portal" before the farm has said — and the reader's language and theme. It leads to the
 * portal, never to the farm's own front door, which is the staff's.
 */
const PortalHeader = ({
  brandOnPhoneOnly = false,
}: {
  /** Where a wider screen already names the farm on the dark side beside it, so it is never said twice. */
  brandOnPhoneOnly?: boolean;
}) => {
  const { t } = useLanguage();
  const door = useQuery(orpc.portal.door.queryOptions());
  return (
    <header
      className="flex h-16 items-center justify-between px-4 md:px-8"
      data-app-chrome
    >
      <Link
        className={cn(
          "focus-visible:ring-ring flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2",
          brandOnPhoneOnly && "lg:hidden"
        )}
        to="/portal"
      >
        <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg">
          <Sprout aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <Wordmark className="truncate" />
          <span className="text-muted-foreground truncate text-xs">
            {door.data?.farmName ?? t("portal.title")}
          </span>
        </span>
      </Link>
      <div className="ms-auto flex items-center gap-1">
        <LanguageToggle />
        <ThemeMenu />
      </div>
    </header>
  );
};

/**
 * The Investor portal's door, the same shape as the farm's own sign-in: on the dark side the farm an Investor deals
 * with and what the portal holds for them — never what they might make, since the portal offers nothing — and the form
 * on the other, with what the portal is under it. A page read rather than filled in — the notice — takes the width of a
 * page instead, under the bar alone.
 */
export const PortalDoor = ({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) => {
  const { t } = useLanguage();
  const door = useQuery(orpc.portal.door.queryOptions());
  if (wide) {
    return (
      <div className="flex min-h-svh flex-col">
        <PortalHeader />
        <main className="flex flex-1 items-start justify-center px-4 py-10">
          <div className="flex w-full max-w-3xl flex-col gap-4">{children}</div>
        </main>
        <PortalNotice />
      </div>
    );
  }
  return (
    <DoorScreen
      footer={<PortalNotice />}
      header={<PortalHeader brandOnPhoneOnly />}
      home="/portal"
      promise={{
        title: t("portal.promise.title"),
        points: [
          { icon: Activity, text: t("portal.promise.progress") },
          { icon: FileText, text: t("portal.promise.papers") },
          { icon: Wallet, text: t("portal.promise.money") },
        ],
        foot: t("portal.promise.foot"),
      }}
      subtitle={door.data?.farmName ?? t("portal.title")}
    >
      {children}
    </DoorScreen>
  );
};
