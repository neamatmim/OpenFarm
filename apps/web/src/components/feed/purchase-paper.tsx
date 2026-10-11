import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useState } from "react";

import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

export const PurchasePrintButton = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const refused = useRefused();
  const generate = useMutation(
    orpc.feedPurchasing.paper.mutationOptions({
      onSuccess: ({ document }) => setPaper(document),
      onError: refused,
    })
  );
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={generate.isPending}
        onClick={() => generate.mutate({ id })}
      >
        <Printer aria-hidden data-icon="inline-start" />
        {t("suppliers.printOrder")}
      </Button>
      <PaperDialog
        paper={paper}
        wording={null}
        title={t("suppliers.printOrder")}
        onClose={() => setPaper(null)}
      />
    </>
  );
};

export const SupplierPaperButton = ({
  supplierId,
  paymentId,
}: {
  supplierId: string;
  paymentId?: string;
}) => {
  const { t } = useLanguage();
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const refused = useRefused();
  const generate = useMutation(
    orpc.suppliers.paper.mutationOptions({
      onSuccess: ({ document }) => setPaper(document),
      onError: refused,
    })
  );
  const title = t(paymentId ? "suppliers.voucher" : "suppliers.statement");
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={generate.isPending}
        onClick={() => generate.mutate({ supplierId, paymentId })}
      >
        <Printer aria-hidden data-icon="inline-start" />
        {title}
      </Button>
      <PaperDialog
        paper={paper}
        wording={null}
        title={title}
        onClose={() => setPaper(null)}
      />
    </>
  );
};
