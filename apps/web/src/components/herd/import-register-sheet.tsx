import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** What the last import came to: how many were added, and every row the farm would not take, with its line. */
const ImportResult = ({
  result,
}: {
  result: {
    imported: { line: number }[];
    failed: { line: number; reason: string }[];
  };
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      {result.imported.length > 0 ? (
        <Notice
          title={t("herd.imported", {
            count: formatNumber(result.imported.length, language),
          })}
          tone="success"
        />
      ) : null}
      {result.failed.length > 0 ? (
        <Notice
          title={t("herd.failedRows", {
            count: formatNumber(result.failed.length, language),
          })}
          tone="warning"
        >
          <ul className="flex flex-col gap-0.5">
            {result.failed.map((row) => (
              <li key={row.line}>
                {t("herd.line", { line: formatNumber(row.line, language) })}:{" "}
                {row.reason}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
};

/**
 * The opening register, in a sheet of its own: the animals already on the farm, one CSV row each, pasted or read from
 * a file. What the farm took and every row it would not are said in the sheet, so a failed row can be put right and
 * sent again; when every row went in, the sheet closes.
 */
export const ImportRegisterSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const [csv, setCsv] = useState("");
  const importRegister = useMutation(
    orpc.animals.importRegister.mutationOptions({
      onSuccess: (result) => {
        toast.success(t("herd.imported", { count: result.imported.length }));
        setCsv("");
        if (result.failed.length === 0) {
          onOpenChange(false);
        }
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  return (
    <FormSheet
      description={t("herd.importDescription")}
      onOpenChange={(next) => {
        if (!next) {
          importRegister.reset();
        }
        onOpenChange(next);
      }}
      onSubmit={() => importRegister.mutate({ csv })}
      open={open}
      pending={importRegister.isPending}
      ready={csv.trim() !== ""}
      submitLabel={t("herd.importRun")}
      title={t("herd.import")}
    >
      {importRegister.data ? (
        <ImportResult result={importRegister.data} />
      ) : null}

      <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
        {t("herd.importHelp")}
      </p>

      <FormField id="import-file" label={t("herd.importFile")}>
        <Input
          accept=".csv,text/csv,text/plain"
          id="import-file"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              setCsv(await file.text());
            }
          }}
          type="file"
        />
      </FormField>

      <FormField id="import-csv" label={t("herd.importRows")}>
        <Textarea
          className="min-h-48 font-mono text-sm"
          id="import-csv"
          onChange={(event) => setCsv(event.target.value)}
          required
          rows={10}
          value={csv}
        />
      </FormField>
    </FormSheet>
  );
};
