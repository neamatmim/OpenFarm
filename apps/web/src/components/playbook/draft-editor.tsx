import { findPublishBlockers } from "@OpenFarm/domain";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { useSopDraft } from "@/components/playbook/sop-draft-keeping";
import {
  LeaveDraftDialog,
  LetGoDialog,
} from "@/components/playbook/sop-draft-keeping";
import { SopEditor } from "@/components/playbook/sop-editor";
import { ReasonDialog } from "@/components/sign-off/reason-dialog";
import { useLanguage } from "@/i18n/language-provider";
import type { SopDraft } from "@/lib/kept-sop-draft";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * A procedure being written, in the Playbook's own place: the Owner publishes it, anybody else proposes it with why.
 * Published or sent, the draft kept on this device is let go; the way back asks first when anything was changed.
 */
export const DraftEditor = ({
  draft,
  keeping,
  isOwner,
  pens,
  products,
  onError,
}: {
  draft: SopDraft;
  keeping: ReturnType<typeof useSopDraft>;
  isOwner: boolean;
  pens: { id: string; name: string }[];
  products: { id: string; name: string; vaccine: boolean }[];
  onError: (error: unknown) => void;
}) => {
  const { t } = useLanguage();
  // A Manager's change waits on why they propose it.
  const [proposing, setProposing] = useState(false);
  const [lettingGo, setLettingGo] = useState(false);
  const onPublished = (result: { number: number }) => {
    toast.success(t("sop.published", { number: result.number }));
    keeping.handleLetGo();
  };
  const create = useMutation(
    orpc.sops.create.mutationOptions({ onSuccess: onPublished, onError })
  );
  const publish = useMutation(
    orpc.sops.publish.mutationOptions({ onSuccess: onPublished, onError })
  );
  const propose = useMutation(
    orpc.sops.proposals.create.mutationOptions({
      onSuccess: () => {
        toast.success(t("sop.proposed"));
        setProposing(false);
        keeping.handleLetGo();
      },
      onError,
    })
  );
  const { definitionId } = draft;
  const save = () => {
    if (!isOwner) {
      if (definitionId) {
        setProposing(true);
      }
      return;
    }
    if (definitionId) {
      publish.mutate({
        definitionId,
        content: draft.content,
        basedOnVersionId: draft.basedOnVersionId,
      });
    } else {
      create.mutate({
        content: draft.content,
        ...(draft.standardKey ? { standardKey: draft.standardKey } : {}),
      });
    }
  };
  return (
    <>
      <SopEditor
        blockers={findPublishBlockers(draft.content)}
        canPublish={isOwner}
        content={draft.content}
        isNew={definitionId === null}
        onCancel={() => {
          if (keeping.changed) {
            setLettingGo(true);
          } else {
            keeping.handleLetGo();
          }
        }}
        onChange={keeping.handleChange}
        onSave={save}
        pending={create.isPending || publish.isPending || propose.isPending}
        pens={pens}
        products={products}
        startedFrom={draft.startedFrom}
      />
      <ReasonDialog
        description={t("sop.proposeWhy.description")}
        handleSubmit={(note) => {
          if (definitionId) {
            propose.mutate({
              definitionId,
              content: draft.content,
              note,
              basedOnVersionId: draft.basedOnVersionId,
            });
          }
        }}
        label={t("sop.proposeWhy.label")}
        onOpenChange={setProposing}
        open={proposing}
        pending={propose.isPending}
        submitLabel={t("sop.propose")}
        title={t("sop.proposeWhy.title")}
      />
      <LetGoDialog
        onLetGo={() => {
          setLettingGo(false);
          keeping.handleLetGo();
        }}
        onOpenChange={setLettingGo}
        open={lettingGo}
      />
      <LeaveDraftDialog leaving={keeping.leaving} />
    </>
  );
};
