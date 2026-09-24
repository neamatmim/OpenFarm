import type { ReactNode } from "react";

import { PublicHeader } from "@/components/public-header";
import { useLanguage } from "@/i18n/language-provider";

/**
 * What the portal is, said on every page of it: an Investor's own Agreements with the farm and nothing more — not an
 * offer, and no money moves through it (ADR 0007). Said because a lawyer has still to answer whether a portal makes
 * the farm a platform, and a page that could read as one should say plainly that it is not.
 */
export const PortalNotice = ({ children }: { children?: ReactNode }) => {
  const { t } = useLanguage();
  return (
    <footer className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-center text-xs md:px-8">
      <p>{t("portal.notice")}</p>
      {children}
    </footer>
  );
};

/** The Investor portal's door: the bar across the top, one card in the middle of the page, and what the portal is. */
export const PortalDoor = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-svh flex-col">
    <PublicHeader />
    <main className="flex flex-1 items-start justify-center px-4 py-10 md:items-center">
      <div className="w-full max-w-md">{children}</div>
    </main>
    <PortalNotice />
  </div>
);
