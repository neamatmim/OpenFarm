import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Loaded, Page, PageHeader } from "@/components/page";
import { TheirPapers } from "@/components/portal/their-papers";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** Every paper of theirs, a place of its own in the portal as investor portals keep their documents. */
const PortalPapersPage = () => {
  const { t } = useLanguage();
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
  return (
    <Page>
      <PageHeader
        description={t("portal.papersHint")}
        title={t("portal.papers")}
      />
      <Loaded
        query={theirs}
        skeleton={<Skeleton className="h-32 rounded-xl" />}
      >
        {theirs.data ? (
          <TheirPapers agreements={theirs.data.agreements} />
        ) : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/papers")({
  component: PortalPapersPage,
});
