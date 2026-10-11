import { Loaded, Page, PageHeader, SECTION_TITLE } from "@/components/page";
import { ListSkeleton } from "@/components/portal/portal-skeletons";
import { useTheirPortfolio } from "@/components/portal/portal-source";
import { SignedDocuments } from "@/components/portal/signed-documents";
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
      <SignedDocuments />
      <section className="flex flex-col gap-4">
        <h2 className={SECTION_TITLE}>{t("portal.documents.statements")}</h2>
        <Loaded query={theirs} skeleton={<ListSkeleton />}>
          {theirs.data ? (
            <TheirPapers agreements={theirs.data.agreements} />
          ) : null}
        </Loaded>
      </section>
    </Page>
  );
};
