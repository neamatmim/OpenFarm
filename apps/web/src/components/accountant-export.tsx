import type { PaperDocument } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useState } from "react";

import { ExportList, ExportRow } from "@/components/exports";
import { Section } from "@/components/page";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/**
 * The accountant's export for the dates the page is showing: the summary laid out on the letterhead, to read in
 * Bangla or English and print, and every Money Event as a CSV. Each is an Export on the trail.
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
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const summary = useMutation(
    orpc.reports.accountantExport.mutationOptions({
      onSuccess: ({ document }) => setPaper(document ?? null),
      onError,
    })
  );
  const sheet = useMutation(
    orpc.reports.accountantExport.mutationOptions({
      onSuccess: ({ csv, fileName }) =>
        saveCsv(fileName ?? `money-${from}-${to}.csv`, csv ?? ""),
      onError,
    })
  );
  return (
    <>
      {/* The tab already names it; the part says only the period it reads. */}
      <Section>
        <p className="text-muted-foreground text-sm">{t("accountant.hint")}</p>
        <ExportList>
          <ExportRow
            description={t("accountant.summaryHint")}
            icon={FileText}
            title={t("accountant.summary")}
          >
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
              {t("common.print")}
            </Button>
          </ExportRow>
          <ExportRow
            description={t("accountant.csvHint")}
            icon={FileSpreadsheet}
            title={t("accountant.csv")}
          >
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
              {t("exports.csv")}
            </Button>
          </ExportRow>
        </ExportList>
      </Section>
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={t("accountant.summary")}
        wording={null}
      />
    </>
  );
};
