import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useRefusalToast } from "@/components/money";
import { Paper } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/**
 * The accountant's export for the dates the page is showing: the summary to print, and every Money Event
 * as a CSV. Each is an Export on the trail.
 */
export const AccountantExport = ({
  from,
  to,
}: {
  from: string;
  to: string;
}) => {
  const { t } = useLanguage();
  const onError = useRefusalToast();
  const [paper, setPaper] = useState<string | null>(null);
  const summary = useMutation(
    orpc.reports.accountantExport.mutationOptions({
      onSuccess: ({ text }) => setPaper(text ?? null),
      onError,
    })
  );
  const sheet = useMutation(
    orpc.reports.accountantExport.mutationOptions({
      onSuccess: ({ csv }) => saveCsv(`money-${from}-${to}.csv`, csv ?? ""),
      onError,
    })
  );
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t("accountant.title")}</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={summary.isPending}
          onClick={() => summary.mutate({ from, to, format: "paper" })}
          size="sm"
          variant="outline"
        >
          {t("accountant.summary")}
        </Button>
        <Button
          disabled={sheet.isPending}
          onClick={() => sheet.mutate({ from, to, format: "csv" })}
          size="sm"
          variant="outline"
        >
          {t("accountant.csv")}
        </Button>
      </div>
      {paper ? <Paper id="accountant-summary" text={paper} /> : null}
    </section>
  );
};
