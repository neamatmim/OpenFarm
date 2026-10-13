import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, ListChecks } from "lucide-react";
import { useState } from "react";

import { Notice } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The words for each refusal of a register row, as the server names it; one it does not know is said in its English. */
const ROW_REFUSED: Partial<Record<string, MessageKey>> = {
  register_date_unread: "herd.row.registerDateUnread",
  register_value_unread: "herd.row.registerValueUnread",
  register_unknown_pen: "herd.row.registerUnknownPen",
  register_unknown_breed: "herd.row.registerUnknownBreed",
  register_state_not_of_side: "herd.row.registerStateNotOfSide",
  expected_calving_needed: "herd.row.expectedCalvingNeeded",
  tag_taken: "herd.row.tagTaken",
  tag_of_the_other_side: "herd.row.tagOfTheOtherSide",
  not_a_tag_number: "herd.row.notATagNumber",
  register_not_taken: "herd.row.registerNotTaken",
  pen_in_two_sheds: "herd.row.penInTwoSheds",
  register_already_on_the_farm: "herd.row.registerAlreadyOnTheFarm",
  register_lactation_not_of_state: "herd.row.registerLactationNotOfState",
};

/** A row refused. `refusal` is missing from an answer kept from before the register named its refusals. */
interface RowFailed {
  line: number;
  reason: string;
  refusal?: string;
  column?: string;
  value?: string;
}

/** Why a row was refused, in the reader's language where the farm has the words. */
const RowRefusal = ({ row }: { row: RowFailed }) => {
  const { t } = useLanguage();
  const key = row.refusal ? ROW_REFUSED[row.refusal] : undefined;
  return key
    ? t(key, { column: row.column ?? "", value: row.value ?? "" })
    : row.reason;
};

/** The animals taken without something the farm needs, a line each: what to put right on her page. */
const Warned = ({
  rows,
}: {
  rows: { line: number; tagNumber: string; warning: string }[];
}) => {
  const { t, language } = useLanguage();
  if (rows.length === 0) {
    return null;
  }
  return (
    <Notice
      title={t("herd.warnedRows", {
        count: formatNumber(rows.length, language),
      })}
      tone="info"
    >
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.line}>
            {t("herd.line", { line: formatNumber(row.line, language) })}:{" "}
            {t("herd.row.registerNoCalvingDate", { tag: row.tagNumber })}
          </li>
        ))}
      </ul>
    </Notice>
  );
};

/** What the last import — or the last check — came to: how many were added (or would be), every animal added without
 *  something the farm needs, and every row the farm would not take, with its line. */
const ImportResult = ({
  result,
}: {
  result: {
    imported: { line: number }[];
    failed: RowFailed[];
    /** Missing from an answer kept from before the register warned of anything. */
    warned?: { line: number; tagNumber: string; warning: string }[];
    /** Missing from an answer kept from before the register could be checked. */
    checked?: boolean;
    leftOver?: string;
  };
}) => {
  const { t, language } = useLanguage();
  const count = formatNumber(result.imported.length, language);
  return (
    <div className="flex flex-col gap-3">
      {result.checked ? (
        <Notice title={t("herd.checked", { count })} tone="info" />
      ) : null}
      {!result.checked && result.imported.length > 0 ? (
        <Notice title={t("herd.imported", { count })} tone="success">
          {result.leftOver ? t("herd.leftOverHint") : null}
        </Notice>
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
                <RowRefusal row={row} />
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <Warned rows={result.warned ?? []} />
    </div>
  );
};

/**
 * The opening register, in a sheet of its own: the animals already on the farm, one CSV row each, pasted or read from
 * a file, or checked first with nothing taken in. What the farm took and every row it would not are said in the sheet,
 * and only the rows it would not are left in the box, so a failed row can be put right and sent again without taking
 * anybody twice; when every row went in, the sheet closes. A blank template with the farm's Pens and breeds is a
 * download away.
 */
export const ImportRegisterSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [csv, setCsv] = useState("");
  const importRegister = useMutation(
    orpc.animals.importRegister.mutationOptions({
      onSuccess: (result) => {
        // A check takes nobody in: the rows stay in the box to be put right, or imported as they are.
        if (result.checked) {
          return;
        }
        toast.success(
          t("herd.imported", {
            count: formatNumber(result.imported.length, language),
          })
        );
        // Only the rows refused are left, under the header, so sending the box again cannot take anybody twice.
        setCsv(result.leftOver ?? "");
        if (result.failed.length === 0 && (result.warned ?? []).length === 0) {
          onOpenChange(false);
        }
      },
      onError: refused,
    })
  );
  const template = useMutation(
    orpc.animals.registerTemplate.mutationOptions({
      onError: refused,
      onSuccess: ({ csv: blank, fileName }) => saveCsv(fileName, blank),
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

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={template.isPending}
          onClick={() => template.mutate()}
          type="button"
          variant="outline"
        >
          <FileSpreadsheet aria-hidden data-icon="inline-start" />
          {t("herd.templateDownload")}
        </Button>
        <Button
          disabled={csv.trim() === "" || importRegister.isPending}
          onClick={() => importRegister.mutate({ csv, check: true })}
          type="button"
          variant="outline"
        >
          <ListChecks aria-hidden data-icon="inline-start" />
          {t("herd.importCheck")}
        </Button>
      </div>

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
