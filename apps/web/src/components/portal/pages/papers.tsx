import { Loaded, Page, PageHeader } from "@/components/page";
import { ListSkeleton } from "@/components/portal/portal-skeletons";
import { useTheirPortfolio } from "@/components/portal/portal-source";
import { TheirPapers } from "@/components/portal/their-papers";
import { useLanguage } from "@/i18n/language-provider";

/** Every paper of theirs, a place of its own in the portal as investor portals keep their documents. */
export const PortalPapersPage = () => {
  const { t } = useLanguage();
  const theirs = useTheirPortfolio();
  return (
    <Page>
      <PageHeader
        description={t("portal.papersHint")}
        title={t("portal.papers")}
      />
      <Loaded query={theirs} skeleton={<ListSkeleton />}>
        {theirs.data ? (
          <TheirPapers agreements={theirs.data.agreements} />
        ) : null}
      </Loaded>
    </Page>
  );
};
