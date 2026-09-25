import { Button } from "@OpenFarm/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";

import { useT } from "@/i18n/language-provider";

/**
 * Over every page of the Portal Preview, and never dismissed: whose portal this is, that they cannot see the Owner
 * reading it, and that nothing done here reaches them — with the way back to their page.
 */
export const PreviewBand = ({
  investorId,
  name,
}: {
  investorId: string;
  name: string;
}) => {
  const t = useT();
  return (
    <aside
      aria-label={t("portal.preview.seeAsTheyDo")}
      className="bg-primary text-primary-foreground sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm md:px-5"
      data-app-chrome
    >
      <Eye aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {t("portal.preview.band", { name })}
        </span>{" "}
        {t("portal.preview.bandHint")}
      </p>
      <Button
        render={<Link params={{ investorId }} to="/investors/$investorId" />}
        size="sm"
        variant="secondary"
      >
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t("portal.preview.back", { name })}
      </Button>
    </aside>
  );
};
