import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileDown, Milk, Printer, Truck } from "lucide-react";
import { useState } from "react";

import { ExportList, ExportRow } from "@/components/exports";
import { Section } from "@/components/page";
import { PeriodFilter } from "@/components/page-kit";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/**
 * The papers milk leaves behind, for any run of days: the dispatch record a processor or BFSA asks for, to print or
 * as a CSV, and the production figures the Owner reads. Each is an Export on the trail.
 */
export const MilkRecordsTab = () => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [from, setFrom] = useState(() => farmDayOf(new Date()));
  const [to, setTo] = useState(() => farmDayOf(new Date()));
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const onError = refused;
  const dispatchRecord = useMutation(
    orpc.reports.milkDispatchRecord.mutationOptions({
      onSuccess: ({ document }) => setPaper(document ?? null),
      onError,
    })
  );
  const dispatchCsv = useMutation(
    orpc.reports.milkDispatchRecord.mutationOptions({
      onSuccess: ({ csv, fileName }) =>
        saveCsv(fileName ?? `milk-dispatch-${from}-${to}.csv`, csv ?? ""),
      onError,
    })
  );
  const production = useMutation(
    orpc.reports.milkProduction.mutationOptions({
      onSuccess: ({ csv, fileName }) =>
        saveCsv(fileName ?? `milk-production-${from}-${to}.csv`, csv),
      onError,
    })
  );

  return (
    <div className="flex flex-col gap-4">
      {/* The tab already names it; the part says only how its dates work. */}
      <Section>
        <p className="text-muted-foreground text-sm">
          {t("dispatch.reportsHint")}
        </p>
        <PeriodFilter
          from={from}
          fromLabel={t("dispatch.from")}
          label={t("money.period")}
          onFrom={setFrom}
          onTo={setTo}
          to={to}
          toLabel={t("dispatch.to")}
        />
        <div className="border-t pt-4">
          <ExportList>
            <ExportRow
              description={t("dispatch.recordHint")}
              icon={Truck}
              title={t("dispatch.recordPaper")}
            >
              <Button
                disabled={dispatchRecord.isPending}
                onClick={() =>
                  dispatchRecord.mutate({ from, to, format: "paper" })
                }
                type="button"
                variant="outline"
              >
                {dispatchRecord.isPending ? (
                  <Spinner />
                ) : (
                  <Printer aria-hidden data-icon="inline-start" />
                )}
                {t("common.print")}
              </Button>
              <Button
                disabled={dispatchCsv.isPending}
                onClick={() => dispatchCsv.mutate({ from, to, format: "csv" })}
                type="button"
                variant="outline"
              >
                {dispatchCsv.isPending ? (
                  <Spinner />
                ) : (
                  <FileDown aria-hidden data-icon="inline-start" />
                )}
                {t("exports.csv")}
              </Button>
            </ExportRow>
            <ExportRow
              description={t("dispatch.productionHint")}
              icon={Milk}
              title={t("dispatch.production")}
            >
              <Button
                disabled={production.isPending}
                onClick={() => production.mutate({ from, to })}
                type="button"
                variant="outline"
              >
                {production.isPending ? (
                  <Spinner />
                ) : (
                  <FileDown aria-hidden data-icon="inline-start" />
                )}
                {t("exports.csv")}
              </Button>
            </ExportRow>
          </ExportList>
        </div>
      </Section>
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={t("dispatch.recordPaper")}
        wording={null}
      />
    </div>
  );
};
