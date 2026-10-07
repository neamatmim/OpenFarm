import { Button } from "@OpenFarm/ui/components/button";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Notice } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { SopDraft } from "@/lib/kept-sop-draft";
import {
  draftChanged,
  draftOf,
  keepDraft,
  keptDraftText,
  subscribeKeptDraft,
} from "@/lib/kept-sop-draft";

/**
 * The procedure being written, kept on this device as it is written, and the one left here last time offered to carry
 * on with. Leaving the page with a change unpublished asks first; the draft is kept either way, so leaving is never a
 * loss — only letting it go is.
 */
export const useSopDraft = (userId: string | undefined) => {
  const [draft, setDraft] = useState<SopDraft | null>(null);
  // What this person left here last time, once they are known: a draft is theirs, not the device's. Nothing on the
  // server's page, which knows no device.
  const keptText = useSyncExternalStore(
    subscribeKeptDraft,
    () => (userId ? keptDraftText(userId) : null),
    () => null
  );
  const kept = draft ? null : draftOf(keptText);
  useEffect(() => {
    if (userId && draft) {
      keepDraft(userId, draft);
    }
  }, [userId, draft]);
  const changed = draftChanged(draft);
  const leaving = useBlocker({
    // Staying on the Playbook's own address is the editor's own way back, which asks for itself.
    shouldBlockFn: ({ current, next }) =>
      changed && current.pathname !== next.pathname,
    enableBeforeUnload: () => changed,
    withResolver: true,
  });
  return {
    draft,
    kept,
    changed,
    leaving,
    open: (next: SopDraft) => setDraft(next),
    handleChange: (content: SopDraft["content"]) =>
      setDraft((current) => (current ? { ...current, content } : current)),
    /** Published, sent or given up: kept nowhere any more. */
    handleLetGo: () => {
      if (userId) {
        keepDraft(userId, null);
      }
      setDraft(null);
    },
  };
};

/** The draft left on this device last time, offered back above the Playbook. */
export const KeptDraftNotice = ({
  kept,
  onCarryOn,
  onLetGo,
}: {
  kept: SopDraft;
  onCarryOn: () => void;
  onLetGo: () => void;
}) => {
  const { t } = useLanguage();
  const name = kept.content.name.bn || t("sop.new");
  return (
    <Notice title={t("sop.draftKept", { name })} tone="info">
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={onCarryOn} size="sm" type="button">
          {t("sop.draftCarryOn")}
        </Button>
        <Button onClick={onLetGo} size="sm" type="button" variant="outline">
          {t("sop.draftLetGo")}
        </Button>
      </div>
    </Notice>
  );
};

/** Asked when somebody leaves the editor with a change unpublished: to another page, which keeps it on this device. */
export const LeaveDraftDialog = ({
  leaving,
}: {
  leaving: ReturnType<typeof useSopDraft>["leaving"];
}) => {
  const { t } = useLanguage();
  return (
    <ConfirmDialog
      cancelLabel={t("sop.draftStay")}
      confirmLabel={t("sop.draftLeave")}
      description={t("sop.draftLeaveWhy")}
      onConfirm={() => leaving.proceed?.()}
      onOpenChange={(open) => {
        if (!open) {
          leaving.reset?.();
        }
      }}
      open={leaving.status === "blocked"}
      takesAway={false}
      title={t("sop.draftLeaveTitle")}
    />
  );
};

/** Asked when the editor's own way back is taken with a change unpublished: that lets the draft go. */
export const LetGoDialog = ({
  open,
  onOpenChange,
  onLetGo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLetGo: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <ConfirmDialog
      cancelLabel={t("sop.draftStay")}
      confirmLabel={t("sop.draftLetGo")}
      description={t("sop.draftLetGoWhy")}
      onConfirm={onLetGo}
      onOpenChange={onOpenChange}
      open={open}
      title={t("sop.draftLetGoTitle")}
    />
  );
};
