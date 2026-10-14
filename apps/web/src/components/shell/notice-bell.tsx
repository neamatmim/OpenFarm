import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Bell, BellOff } from "lucide-react";
import { useState } from "react";

import { NoticeRows, useNotices } from "@/components/alert-list";
import { EmptyState } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * What the farm is telling this person, from every page: a bell in the top bar with how many notices wait, red when any
 * is loud, opening the whole list beside the page. The banner on the work list says the same; the Owner lands on the
 * overview and the Manager on the farm's day, and a backup gone quiet or a bloated cow told only on a list neither
 * opens was told to nobody.
 */
export const NoticeBell = () => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const { notices, urgent } = useNotices();
  const count = notices.length;
  return (
    <>
      <Button
        aria-label={
          count > 0 ? t("alerts.bell", { count }) : t("alerts.bellNone")
        }
        className="relative size-9"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Bell aria-hidden />
        {count > 0 ? (
          <span
            aria-hidden
            className={cn(
              "text-background absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold",
              urgent ? "bg-danger" : "bg-warning"
            )}
          >
            {formatNumber(count, language)}
          </span>
        ) : null}
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
          closeLabel={t("common.close")}
        >
          <SheetHeader className="border-b">
            <SheetTitle>{t("alerts.title")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {count === 0 ? (
              <EmptyState bare icon={BellOff} title={t("alerts.none")} />
            ) : (
              <NoticeRows notices={notices} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
