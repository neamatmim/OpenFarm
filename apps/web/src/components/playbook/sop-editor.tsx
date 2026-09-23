import type { SopContent } from "@OpenFarm/domain";
import { ROLES } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { ArrowLeft, GitPullRequestArrow, Send } from "lucide-react";

import {
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

import { StepsSection } from "./sop-steps";
import { WhenSection } from "./sop-when";

/** The procedure's names and why it is done: Bangla, and English where somebody wants it. */
const DetailsSection = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (content: SopContent) => void;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("sop.editor.detailsHint")}
      id="sop-details"
      title={t("sop.editor.details")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="name-bn" label={`${t("sop.name")} — ${t("sop.bangla")}`}>
          <Input
            id="name-bn"
            onChange={(e) =>
              onChange({
                ...content,
                name: { ...content.name, bn: e.target.value },
              })
            }
            value={content.name.bn}
          />
        </FormField>
        <FormField
          id="name-en"
          label={`${t("sop.name")} — ${t("sop.english")}`}
        >
          <Input
            id="name-en"
            onChange={(e) =>
              onChange({
                ...content,
                name: { ...content.name, en: e.target.value },
              })
            }
            value={content.name.en ?? ""}
          />
        </FormField>
        <FormField
          className="sm:col-span-2"
          id="purpose-bn"
          label={`${t("sop.purpose")} — ${t("sop.bangla")}`}
        >
          <Input
            id="purpose-bn"
            onChange={(e) =>
              onChange({
                ...content,
                purpose: { ...content.purpose, bn: e.target.value },
              })
            }
            value={content.purpose.bn}
          />
        </FormField>
      </div>
    </Section>
  );
};

/** Who does the work, who signs it off, and how long past due it may run before it is late. */
const WhoSection = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (content: SopContent) => void;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("sop.editor.whoHint")}
      id="sop-who"
      title={t("sop.editor.who")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="assigned" label={t("sop.assignedRole")}>
          <NativeSelect
            id="assigned"
            onChange={(e) =>
              onChange({
                ...content,
                assignedRole: e.target.value as SopContent["assignedRole"],
              })
            }
            value={content.assignedRole}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="checker" label={t("sop.checkerRole")}>
          <NativeSelect
            id="checker"
            onChange={(e) =>
              onChange({
                ...content,
                checkerRole: (e.target.value ||
                  null) as SopContent["checkerRole"],
              })
            }
            value={content.checkerRole ?? ""}
          >
            <option value="">{t("sop.checkerNone")}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="grace" label={t("sop.grace")}>
          <Input
            id="grace"
            min={0}
            onChange={(e) =>
              onChange({ ...content, graceMinutes: Number(e.target.value) })
            }
            type="number"
            value={content.graceMinutes}
          />
        </FormField>
      </div>
    </Section>
  );
};

/** The foot of the editor, held in sight on a wide screen: whether it can go yet, and the act itself. */
const EditorFoot = ({
  blockers,
  canPublish,
  pending,
  onCancel,
}: {
  blockers: string[];
  canPublish: boolean;
  pending: boolean;
  onCancel: () => void;
}) => {
  const { t } = useLanguage();
  const ready = blockers.length === 0;
  return (
    <div className="bg-card/95 supports-[backdrop-filter]:bg-card/85 flex flex-col gap-3 rounded-xl border p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between md:sticky md:bottom-4 md:z-20">
      {ready ? (
        <StatusBadge tone="success">{t("sop.editor.ready")}</StatusBadge>
      ) : (
        <StatusBadge tone="warning">
          {t("sop.editor.blocked", { count: blockers.length })}
        </StatusBadge>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          {t("common.cancel")}
        </Button>
        <Button disabled={!ready || pending} type="submit">
          {pending ? <Spinner /> : null}
          {canPublish ? (
            <Send aria-hidden data-icon="inline-start" />
          ) : (
            <GitPullRequestArrow aria-hidden data-icon="inline-start" />
          )}
          {canPublish ? t("sop.publish") : t("sop.propose")}
        </Button>
      </div>
    </div>
  );
};

/**
 * Writing a procedure, as a page of its own: what it is, when its work comes up, who does it and signs it off, and its
 * Steps in order. The Owner publishes it as a new Version; anybody else proposes it to the Owner. Nothing goes while
 * anything still stops it being published, and what stops it is listed above the act.
 */
export const SopEditor = ({
  content,
  isNew,
  blockers,
  canPublish,
  pending,
  pens,
  products,
  onChange,
  onSave,
  onCancel,
}: {
  content: SopContent;
  isNew: boolean;
  blockers: string[];
  canPublish: boolean;
  pending: boolean;
  pens: { id: string; name: string }[];
  /** What a campaign may give: the Drug List's products whose withdrawal days are known. */
  products: { id: string; name: string; vaccine: boolean }[];
  onChange: (content: SopContent) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const { t } = useLanguage();
  const title = isNew ? t("sop.new") : content.name.bn || t("sop.edit");
  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={onCancel} type="button" variant="ghost">
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t("sop.backToPlaybook")}
          </Button>
        }
        description={
          canPublish ? t("sop.editor.publishHint") : t("sop.editor.proposeHint")
        }
        eyebrow={canPublish ? t("sop.title") : t("sop.propose")}
        title={title}
      />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <DetailsSection content={content} onChange={onChange} />
        <WhenSection content={content} onChange={onChange} />
        <WhoSection content={content} onChange={onChange} />
        <StepsSection
          content={content}
          onChange={onChange}
          pens={pens}
          products={products}
        />

        {blockers.length > 0 ? (
          <Notice title={t("sop.cannotPublish")} tone="warning">
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        <EditorFoot
          blockers={blockers}
          canPublish={canPublish}
          onCancel={onCancel}
          pending={pending}
        />
      </form>
    </Page>
  );
};
