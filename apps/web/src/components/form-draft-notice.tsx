import { Button } from "@OpenFarm/ui/components/button";
import { useState } from "react";

import { Notice } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

export const FormDraftNotice = ({
  restored,
  failed,
  onDiscard,
}: {
  restored: boolean;
  failed: boolean;
  onDiscard: () => void;
}) => {
  const { t } = useLanguage();
  const [discarding, setDiscarding] = useState(false);
  if (failed) {
    return <Notice title={t("form.draftFailed")} tone="warning" />;
  }
  return restored ? (
    <>
      <Notice
        title={t("form.draftRestored")}
        tone="info"
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDiscarding(true)}
          >
            {t("form.discardDraft")}
          </Button>
        }
      />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t("form.discardDraft")}
        description={t("form.discardDraftWhy")}
        confirmLabel={t("form.discardDraft")}
        onConfirm={() => {
          onDiscard();
          setDiscarding(false);
        }}
      />
    </>
  ) : null;
};
