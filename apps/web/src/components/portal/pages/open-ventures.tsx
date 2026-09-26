import { Sprout } from "lucide-react";

import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import { OpenVentureCards } from "@/components/portal/open-ventures";
import { CardsSkeleton } from "@/components/portal/portal-skeletons";
import {
  useLookedAtOffers,
  useTheirOpenVentures,
} from "@/components/portal/portal-source";
import { useLanguage } from "@/i18n/language-provider";

/** Every Venture the farm is raising capital for and has shown in the portal (ADR 0008). */
export const OpenVenturesPage = () => {
  const { t } = useLanguage();
  const offered = useTheirOpenVentures();
  useLookedAtOffers(offered.data);
  return (
    <Page>
      <PageHeader
        description={t("portal.open.hint")}
        title={t("portal.open.title")}
      />
      <Loaded query={offered} skeleton={<CardsSkeleton />}>
        {offered.data && offered.data.length > 0 ? (
          <OpenVentureCards ventures={offered.data} />
        ) : (
          <EmptyState icon={Sprout} title={t("portal.open.none")} />
        )}
      </Loaded>
    </Page>
  );
};
