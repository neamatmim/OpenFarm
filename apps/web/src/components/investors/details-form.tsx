import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";

import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * The Investor Details Form, «বিনিয়োগকারীর তথ্য ফর্ম»: the blank the Owner prints to fill in with somebody at the
 * first meeting, from their NID and bank papers, and types in from afterwards — the record sheet's boxes, in its
 * order, as lines to write on. Made as it is asked for, an Export each time.
 */
export const DetailsFormAct = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [form, setForm] = useState<PaperDocument | null>(null);
  const making = useMutation(
    orpc.investors.detailsForm.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setForm(document),
    })
  );
  return (
    <>
      <Button
        disabled={making.isPending}
        onClick={() => making.mutate()}
        type="button"
        variant="outline"
      >
        {making.isPending ? (
          <Spinner />
        ) : (
          <FileText aria-hidden data-icon="inline-start" />
        )}
        {t("investors.detailsForm")}
      </Button>
      <PaperDialog
        description={t("investors.detailsFormHint")}
        onClose={() => setForm(null)}
        paper={form}
        title={t("investors.detailsFormTitle")}
        wording={null}
      />
    </>
  );
};
