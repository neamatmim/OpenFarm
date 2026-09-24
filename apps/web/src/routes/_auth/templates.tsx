import type {
  PaperDocument,
  TemplateContent,
  TemplateKind,
} from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Eye,
  FileClock,
  Hourglass,
  Pencil,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { TemplateEditor } from "@/components/templates/template-editor";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { useRefused } from "@/lib/refused";
import type { TemplateDraft } from "@/lib/template-draft";
import { fromDraft, toDraft } from "@/lib/template-draft";
import { orpc } from "@/utils/orpc";

type Listed = Awaited<ReturnType<typeof orpc.templates.list.call>>[number];
type Version = Listed["versions"][number];

/** Why the farm would not take a change to its wording, in the reader's words. */
const REFUSALS: Record<string, MessageKey> = {
  template_problems: "templates.cannotPublish",
  already_reviewed: "templates.refused.alreadyReviewed",
  reviewed_in_the_future: "templates.refused.reviewedInTheFuture",
};

/** The two kinds of paper that wait on the lawyer's answer before anybody signs one. */
const WAITING_ON_THE_LAWYER: ReadonlySet<TemplateKind> = new Set([
  "master_agreement",
  "venture_schedule",
]);

/** A farm day as the reader writes a date. */
const useDay = () => {
  const { language } = useLanguage();
  return (farmDay: string) =>
    formatDate(new Date(`${farmDay}T00:00:00Z`), language, "date");
};

/** Whether a lawyer approved a Version, and who and when, or that nobody has yet. */
const ApprovalBadge = ({ version }: { version: Version }) => {
  const { t } = useLanguage();
  const day = useDay();
  if (version.reviewedOn && version.reviewedBy) {
    return (
      <StatusBadge icon={BadgeCheck} tone="success">
        {t("templates.approvedBy", {
          lawyer: version.reviewedBy,
          day: day(version.reviewedOn),
        })}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge icon={ShieldAlert} tone="warning">
      {t("templates.notApproved")}
    </StatusBadge>
  );
};

/** One earlier Version in a kind's history: its number, when and why, its approval, and a way to read it. */
const VersionRow = ({
  version,
  onPreview,
}: {
  version: Version;
  onPreview: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">
          {t("templates.versionOn", {
            number: formatDigits(version.number, language),
            day: formatDate(version.publishedAt, language, "date"),
          })}
        </span>
        {version.note ? (
          <span className="text-muted-foreground text-xs">{version.note}</span>
        ) : null}
        <ApprovalBadge version={version} />
      </div>
      <Button onClick={onPreview} size="sm" type="button" variant="ghost">
        <Eye aria-hidden data-icon="inline-start" />
        {t("templates.read")}
      </Button>
    </li>
  );
};

/** Which wording a Version is, as the paper dialog says it above the page. */
const said = (version: Version): WordingSaid => ({
  number: version.number,
  reviewedBy: version.reviewedBy,
  reviewedOn: version.reviewedOn,
});

/**
 * One kind of paper: what it is for, the Version papers are printed in now and whether a lawyer approved it, and the
 * acts on it — read it, change it, write down the lawyer's approval — with the Versions before it beneath.
 */
const TemplateCard = ({
  template,
  onPreview,
  onEdit,
  onReview,
}: {
  template: Listed;
  onPreview: (content: TemplateContent, wording: WordingSaid) => void;
  onEdit: () => void;
  onReview: () => void;
}) => {
  const { t, language } = useLanguage();
  const [history, setHistory] = useState(false);
  const { current, kind } = template;
  const earlier = template.versions.filter(
    (version) => version.versionId !== current.versionId
  );
  return (
    <article className="surface flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          {t(`templates.kind.${kind}`)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t(`templates.kindHint.${kind}`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge icon={ScrollText} tone="neutral">
          {t("templates.versionOn", {
            number: formatDigits(current.number, language),
            day: formatDate(current.publishedAt, language, "date"),
          })}
        </StatusBadge>
        <ApprovalBadge version={current} />
        {WAITING_ON_THE_LAWYER.has(kind) ? (
          <StatusBadge icon={Hourglass} tone="info">
            {t("templates.waitsOnLawyer")}
          </StatusBadge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onPreview(current.content, said(current))}
          type="button"
          variant="outline"
        >
          <Eye aria-hidden data-icon="inline-start" />
          {t("templates.read")}
        </Button>
        <Button onClick={onEdit} type="button" variant="outline">
          <Pencil aria-hidden data-icon="inline-start" />
          {t("templates.change")}
        </Button>
        {current.reviewedOn ? null : (
          <Button onClick={onReview} type="button" variant="outline">
            <BadgeCheck aria-hidden data-icon="inline-start" />
            {t("templates.recordApproval")}
          </Button>
        )}
        {earlier.length > 0 ? (
          <Button
            aria-expanded={history}
            onClick={() => setHistory(!history)}
            type="button"
            variant="ghost"
          >
            <FileClock aria-hidden data-icon="inline-start" />
            {t("templates.earlier", {
              count: formatDigits(earlier.length, language),
            })}
          </Button>
        ) : null}
      </div>
      {history ? (
        <ul className="divide-border divide-y border-t">
          {earlier.map((version) => (
            <VersionRow
              key={version.versionId}
              onPreview={() => onPreview(version.content, said(version))}
              version={version}
            />
          ))}
        </ul>
      ) : null}
    </article>
  );
};

/** Writing down that a lawyer approved a Version: who, and the day. */
const ReviewDialog = ({
  version,
  onClose,
}: {
  version: { versionId: string; number: number; kind: TemplateKind } | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [lawyer, setLawyer] = useState("");
  const [on, setOn] = useState("");
  const recording = useMutation(
    orpc.templates.recordReview.mutationOptions({
      onSuccess: () => {
        toast.success(t("templates.approvalRecorded"));
        setLawyer("");
        setOn("");
        onClose();
      },
      onError: refused,
    })
  );
  const today = farmDayOf(new Date());
  return (
    <FormDialog
      description={
        version
          ? t("templates.recordApprovalHint", {
              kind: t(`templates.kind.${version.kind}`),
              number: formatDigits(version.number, language),
            })
          : null
      }
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (version) {
          recording.mutate({
            versionId: version.versionId,
            reviewedBy: lawyer.trim(),
            reviewedOn: on,
          });
        }
      }}
      open={version !== null}
      pending={recording.isPending}
      ready={lawyer.trim() !== "" && on !== "" && on <= today}
      submitLabel={t("templates.recordApproval")}
      title={t("templates.recordApproval")}
    >
      <FormField id="review-lawyer" label={t("templates.lawyer")}>
        <Input
          id="review-lawyer"
          onChange={(event) => setLawyer(event.target.value)}
          value={lawyer}
        />
      </FormField>
      <FormField id="review-on" label={t("templates.approvedOn")}>
        <Input
          id="review-on"
          max={today}
          onChange={(event) => setOn(event.target.value)}
          type="date"
          value={on}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * The wording of the papers an Investor signs: the Investment Agreement, the Master Agreement and its Venture
 * Schedule, and the Amendment. Each starts as OpenFarm's standard wording; the Owner reads it, changes it one
 * Version at a time, and writes down the lawyer's approval of a Version on it. What a man signed stays in the wording
 * he signed.
 */
const TemplatesPage = () => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const templates = useQuery(orpc.templates.list.queryOptions());
  const [editing, setEditing] = useState<{
    kind: TemplateKind;
    draft: TemplateDraft;
  } | null>(null);
  const [shown, setShown] = useState<{
    paper: PaperDocument;
    wording: WordingSaid | null;
  } | null>(null);
  const [reviewing, setReviewing] = useState<{
    versionId: string;
    number: number;
    kind: TemplateKind;
  } | null>(null);
  const previewing = useMutation(
    orpc.templates.preview.mutationOptions({ onError: refused })
  );
  const publishing = useMutation(
    orpc.templates.publish.mutationOptions({
      onSuccess: ({ number }) => {
        toast.success(t("templates.published", { number }));
        setEditing(null);
      },
      onError: refused,
    })
  );
  const preview = (
    kind: TemplateKind,
    content: TemplateContent,
    wording: WordingSaid | null
  ) =>
    previewing.mutate(
      { kind, content },
      { onSuccess: ({ document }) => setShown({ paper: document, wording }) }
    );
  const paperDialog = (
    <PaperDialog
      description={t("templates.previewHint")}
      onClose={() => setShown(null)}
      paper={shown?.paper ?? null}
      title={t("templates.preview")}
      wording={shown?.wording ?? null}
    />
  );

  if (editing) {
    return (
      <>
        <TemplateEditor
          initial={editing.draft}
          kind={editing.kind}
          onCancel={() => setEditing(null)}
          onPreview={(draft) => preview(editing.kind, fromDraft(draft), null)}
          onPublish={(draft, note) =>
            publishing.mutate({
              kind: editing.kind,
              content: fromDraft(draft),
              note: note || undefined,
            })
          }
          pending={publishing.isPending}
        />
        {paperDialog}
      </>
    );
  }

  return (
    <Page>
      <PageHeader
        description={t("templates.pageHint")}
        title={t("templates.pageTitle")}
      />
      <Loaded
        query={templates}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
      >
        {templates.data?.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("templates.none")} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(templates.data ?? []).map((template) => (
              <TemplateCard
                key={template.kind}
                onEdit={() =>
                  setEditing({
                    kind: template.kind,
                    draft: toDraft(template.current.content),
                  })
                }
                onPreview={(content, wording) =>
                  preview(template.kind, content, wording)
                }
                onReview={() =>
                  setReviewing({
                    versionId: template.current.versionId,
                    number: template.current.number,
                    kind: template.kind,
                  })
                }
                template={template}
              />
            ))}
          </div>
        )}
      </Loaded>
      {paperDialog}
      <ReviewDialog onClose={() => setReviewing(null)} version={reviewing} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/templates")({
  component: TemplatesPage,
  beforeLoad: onlyFor("owner"),
});
