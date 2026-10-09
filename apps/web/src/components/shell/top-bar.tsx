import { SidebarTrigger } from "@OpenFarm/ui/components/sidebar";
import { cn } from "@OpenFarm/ui/lib/utils";

import LanguageToggle from "@/components/language-toggle";
import { PAGE_LINE } from "@/components/page";
import { GoToAnimal } from "@/components/shell/go-to-animal";
import { SyncBanner } from "@/components/sync-banner";
import { ThemeMenu } from "@/components/theme-menu";
import UserMenu from "@/components/user-menu";
import { useT } from "@/i18n/language-provider";

/** The menu button at the bar's start, its icon drawn back onto the page's line, as a Back link's chevron is. */
export const BAR_START = "-ms-2.5 size-9";

/** The bar's last controls, drawn out by a ghost button's own padding, so the account menu's chevron ends on the
 *  page's line. */
export const BAR_END = "-me-2";

/** The bar over every signed-in page: the menu, what this phone is holding, the way to any animal by her Tag Number,
 *  and the person's own settings. */
export const TopBar = () => {
  const t = useT();
  return (
    <header
      className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 h-14 shrink-0 border-b backdrop-blur"
      data-app-chrome
    >
      <div className={cn("flex h-full items-center gap-2", PAGE_LINE)}>
        <SidebarTrigger aria-label={t("nav.menu")} className={BAR_START} />
        <div className="flex min-w-0 flex-1 items-center">
          <SyncBanner />
        </div>
        <div className={cn("flex shrink-0 items-center gap-1", BAR_END)}>
          <GoToAnimal />
          {/* On a phone the bar is the sync status's, and a language one tap away on a shared Shed Phone was pressed by
            mistake: both are in the account menu there. */}
          <div className="hidden items-center gap-1 md:flex">
            <LanguageToggle />
            <ThemeMenu />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
};
