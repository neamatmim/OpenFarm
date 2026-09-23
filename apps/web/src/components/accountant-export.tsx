import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";
import { useState } from "react";

import { Paper } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
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
  const onError = useRefused();
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
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <p className="text-muted-foreground text-sm">{t("accountant.hint")}</p>
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
          <Button
            disabled={summary.isPending}
            onClick={() => summary.mutate({ from, to, format: "paper" })}
            type="button"
            variant="outline"
          >
            {summary.isPending ? (
              <Spinner />
            ) : (
              <Printer aria-hidden data-icon="inline-start" />
            )}
            {t("accountant.summary")}
          </Button>
          <Button
            disabled={sheet.isPending}
            onClick={() => sheet.mutate({ from, to, format: "csv" })}
            type="button"
            variant="outline"
          >
            {sheet.isPending ? (
              <Spinner />
            ) : (
              <FileDown aria-hidden data-icon="inline-start" />
            )}
            {t("accountant.csv")}
          </Button>
        </div>
      </div>
      {paper ? <Paper id="accountant-summary" text={paper} /> : null}
    </div>
  );
};
