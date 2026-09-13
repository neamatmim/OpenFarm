import { SidebarTrigger } from "@OpenFarm/ui/components/sidebar";

import LanguageToggle from "@/components/language-toggle";
import { SyncBanner } from "@/components/sync-banner";
import { ThemeMenu } from "@/components/theme-menu";
import UserMenu from "@/components/user-menu";
import { useT } from "@/i18n/language-provider";

/** The bar over every signed-in page: the menu, what this phone is holding, and the person's own settings. */
export const TopBar = () => {
  const t = useT();
  return (
    <header
      className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-5"
      data-app-chrome
    >
      <SidebarTrigger aria-label={t("nav.menu")} className="-ml-1 size-9" />
      <div className="flex min-w-0 flex-1 items-center">
        <SyncBanner />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <LanguageToggle />
        <ThemeMenu />
        <UserMenu />
      </div>
    </header>
  );
};
