import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Sprout } from "lucide-react";

import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import { OpenVentureCards } from "@/components/portal/open-ventures";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Every Venture the farm is raising capital for and has shown in the portal (ADR 0008). */
const OpenVenturesPage = () => {
  const { t } = useLanguage();
  const offered = useQuery(orpc.portal.openVentures.queryOptions());
  return (
    <Page>
      <PageHeader
        description={t("portal.open.hint")}
        title={t("portal.open.title")}
      />
      <Loaded
        query={offered}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {offered.data && offered.data.length > 0 ? (
          <OpenVentureCards ventures={offered.data} />
        ) : (
          <EmptyState icon={Sprout} title={t("portal.open.none")} />
        )}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/open/")({
  component: OpenVenturesPage,
});
