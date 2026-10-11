import type { SavedDocument } from "@OpenFarm/api/portal-documents";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { Download, Eye, FileText, Printer } from "lucide-react";
import { useRef, useState } from "react";

import { EmptyState, Loaded, Section } from "@/components/page";
import { ListSkeleton } from "@/components/portal/portal-skeletons";
import {
  useTheirDocument,
  useTheirDocuments,
} from "@/components/portal/portal-source";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { printAlone } from "@/lib/print-alone";
import { useRefused } from "@/lib/refused";
import type { client } from "@/utils/orpc";

const TITLES = {
  agreement: "portal.documents.agreement",
  amendment: "portal.documents.amendment",
  nomination: "portal.documents.nomination",
} as const;

const REFUSALS = {
  no_saved_document: "portal.documents.missing",
  saved_document_changed: "portal.documents.changed",
} as const;

type OpenedDocument = Awaited<ReturnType<typeof client.portal.document>>;

const DocumentViewer = ({
  opened,
  onClose,
}: {
  opened: OpenedDocument;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const photoPage = useRef<HTMLDivElement>(null);
  const title = t(TITLES[opened.meta.kind]);
  const description = `${opened.meta.ventureName ?? title} · ${formatDate(new Date(`${opened.meta.signedOn}T00:00:00Z`), language, "date")}`;
  if (opened.format === "document") {
    return (
      <PaperDialog
        paper={opened.document}
        wording={null}
        title={title}
        description={description}
        onClose={onClose}
        notice={
          <div className="text-muted-foreground space-y-1 text-sm">
            <p>{t("portal.documents.originalInApp")}</p>
            {opened.agreedAt ? (
              <p>
                {t("portal.documents.agreedAt", {
                  at: formatDate(
                    new Date(opened.agreedAt),
                    language,
                    "dateTime"
                  ),
                })}
              </p>
            ) : null}
            {opened.approvedAt ? (
              <p>
                {t("portal.documents.approvedAt", {
                  at: formatDate(
                    new Date(opened.approvedAt),
                    language,
                    "dateTime"
                  ),
                })}
              </p>
            ) : null}
            <p>{t("portal.documents.pdfHint")}</p>
          </div>
        }
      />
    );
  }
  const source = `data:${opened.contentType};base64,${opened.data}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <a
            className={buttonVariants({ variant: "outline" })}
            download={`${opened.meta.kind}-${opened.meta.signedOn}.${opened.contentType.split("/")[1] ?? "jpg"}`}
            href={source}
          >
            <Download aria-hidden data-icon="inline-start" />
            {t("statements.download")}
          </a>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (photoPage.current) {
                void printAlone(photoPage.current);
              }
            }}
          >
            <Printer aria-hidden data-icon="inline-start" />
            {t("portal.documents.printPdf")}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("portal.documents.pdfHint")}
        </p>
        <div ref={photoPage}>
          <img alt={title} className="h-auto w-full" src={source} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DocumentList = ({ documents }: { documents: SavedDocument[] }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const opening = useTheirDocument(refused);
  const [opened, setOpened] = useState<OpenedDocument | null>(null);
  return (
    <>
      <ul className="divide-y">
        {documents.map((one) => {
          const title = t(TITLES[one.kind]);
          const day = formatDate(
            new Date(`${one.signedOn}T00:00:00Z`),
            language,
            "date"
          );
          const busy =
            opening.isPending &&
            opening.variables?.kind === one.kind &&
            opening.variables.id === one.id;
          return (
            <li
              className="flex flex-wrap items-start gap-3 py-4 first:pt-0 last:pb-0"
              key={`${one.kind}-${one.id}`}
            >
              <span
                aria-hidden
                className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-md"
              >
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{title}</h3>
                  {one.current === null ? null : (
                    <Badge variant={one.current ? "success" : "secondary"}>
                      {t(
                        one.current
                          ? "portal.documents.current"
                          : "portal.documents.previous"
                      )}
                    </Badge>
                  )}
                </div>
                {one.ventureName ? (
                  <p className="text-sm break-words">{one.ventureName}</p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {t(
                    one.carriedOver
                      ? "portal.documents.recordedOn"
                      : "portal.documents.signedOn",
                    { day }
                  )}
                </p>
                {one.source ? (
                  <p className="text-muted-foreground text-xs">
                    {t(
                      one.source === "in_app"
                        ? "portal.documents.inApp"
                        : "portal.documents.photo"
                    )}
                  </p>
                ) : null}
                {one.nominees.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {one.nominees.map((nominee, index) => (
                      <li className="break-words" key={`${one.id}-${index}`}>
                        {nominee.name} ·{" "}
                        {formatNumber(nominee.sharePercent, language)}%
                      </li>
                    ))}
                  </ul>
                ) : null}
                {one.kind === "nomination" && one.ventureName ? (
                  <p className="text-muted-foreground text-xs">
                    {t("portal.documents.inAgreement")}
                  </p>
                ) : null}
                {one.source ? null : (
                  <p className="text-muted-foreground text-xs">
                    {t(
                      one.carriedOver
                        ? "portal.documents.carriedOver"
                        : "portal.documents.missing"
                    )}
                  </p>
                )}
              </div>
              {one.source ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={opening.isPending}
                  aria-label={`${t("portal.paper.open")}: ${title}, ${one.ventureName ?? ""}, ${day}`}
                  onClick={() =>
                    opening.mutate(
                      { kind: one.kind, id: one.id },
                      { onSuccess: setOpened }
                    )
                  }
                >
                  {busy ? (
                    <Spinner />
                  ) : (
                    <Eye aria-hidden data-icon="inline-start" />
                  )}
                  {t("portal.paper.open")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {opened ? (
        <DocumentViewer
          key={`${opened.meta.kind}-${opened.meta.id}`}
          opened={opened}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
};

/** Signed originals and every nomination remain available after their Venture ends or nominees change. */
export const SignedDocuments = () => {
  const { t } = useLanguage();
  const documents = useTheirDocuments();
  const agreements =
    documents.data?.filter((one) => one.kind !== "nomination") ?? [];
  const nominations =
    documents.data?.filter((one) => one.kind === "nomination") ?? [];
  return (
    <Loaded query={documents} skeleton={<ListSkeleton />}>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t("portal.documents.agreements")}>
          {agreements.length > 0 ? (
            <DocumentList documents={agreements} />
          ) : (
            <EmptyState
              icon={FileText}
              title={t("portal.documents.emptyAgreements")}
              description={t("portal.documents.emptyHint")}
            />
          )}
        </Section>
        <Section title={t("portal.documents.nominations")}>
          {nominations.length > 0 ? (
            <DocumentList documents={nominations} />
          ) : (
            <EmptyState
              icon={FileText}
              title={t("portal.documents.emptyNominations")}
              description={t("portal.documents.emptyHint")}
            />
          )}
        </Section>
      </div>
    </Loaded>
  );
};
