import { farmDayOf } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";
import { useState } from "react";

import { FilterBar, FormField } from "@/components/page-kit";
import { Paper } from "@/components/paper";
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
  const [paper, setPaper] = useState<string | null>(null);
  const onError = refused;
  const dispatchRecord = useMutation(
    orpc.reports.milkDispatchRecord.mutationOptions({
      onSuccess: ({ text }) => setPaper(text ?? null),
      onError,
    })
  );
  const dispatchCsv = useMutation(
    orpc.reports.milkDispatchRecord.mutationOptions({
      onSuccess: ({ csv }) =>
        saveCsv(`milk-dispatch-${from}-${to}.csv`, csv ?? ""),
      onError,
    })
  );
  const production = useMutation(
    orpc.reports.milkProduction.mutationOptions({
      onSuccess: ({ csv }) => saveCsv(`milk-production-${from}-${to}.csv`, csv),
      onError,
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="surface flex flex-col gap-4 p-4 md:p-5">
        <p className="text-muted-foreground text-sm">
          {t("dispatch.reportsHint")}
        </p>
        <FilterBar className="border-y py-4 sm:items-end">
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <FormField id="milk-records-from" label={t("dispatch.from")}>
              <Input
                className="sm:w-44"
                id="milk-records-from"
                onChange={(event) => setFrom(event.target.value)}
                type="date"
                value={from}
              />
            </FormField>
            <FormField id="milk-records-to" label={t("dispatch.to")}>
              <Input
                className="sm:w-44"
                id="milk-records-to"
                onChange={(event) => setTo(event.target.value)}
                type="date"
                value={to}
              />
            </FormField>
          </div>
        </FilterBar>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            disabled={dispatchRecord.isPending}
            onClick={() => dispatchRecord.mutate({ from, to, format: "paper" })}
            type="button"
            variant="outline"
          >
            {dispatchRecord.isPending ? (
              <Spinner />
            ) : (
              <Printer aria-hidden data-icon="inline-start" />
            )}
            {t("dispatch.recordPaper")}
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
            {t("dispatch.recordCsv")}
          </Button>
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
            {t("dispatch.productionCsv")}
          </Button>
        </div>
      </div>
      {paper ? <Paper id="milk-dispatch-record" text={paper} /> : null}
    </div>
  );
};
