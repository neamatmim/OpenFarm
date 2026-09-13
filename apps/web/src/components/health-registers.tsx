import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/** The health registers an inspector reads. */
export type HealthRegister = "treatment_register" | "disease_history";

/** A window as the registers are asked for it: a day left empty is the register's own look-back. */
interface Asked {
  from?: string;
  to?: string;
}

const OUTCOME_WORD = {
  on_the_farm: "inspector.onTheFarm",
  sold: "state.sold",
  died: "state.died",
  culled: "state.culled",
} as const satisfies Record<string, MessageKey>;

/**
 * The treatment register (R4) and the disease history (R5) on the Inspector View: every dose in the window
 * with what was behind it, every diagnosis with the notifiable ones marked — each printed, and the treatment
 * register also given as a CSV. Thirty days and six months back unless a window is set.
 */
export const HealthRegisters = ({
  onPrint,
  printing,
}: {
  onPrint: (report: HealthRegister, asked: Asked) => void;
  printing: boolean;
}) => {
  const { t } = useLanguage();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const asked: Asked = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const treatments = useQuery(
    orpc.inspector.treatments.queryOptions({ input: asked })
  );
  const diseases = useQuery(
    orpc.inspector.diseases.queryOptions({ input: asked })
  );
  const sheet = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ csv }) =>
        saveCsv(
          `treatment-register-${treatments.data?.from}-${treatments.data?.to}.csv`,
          csv ?? ""
        ),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t("dispatch.from")}
          className="w-40"
          onChange={(event) => setFrom(event.target.value)}
          type="date"
          value={from}
        />
        <Input
          aria-label={t("dispatch.to")}
          className="w-40"
          onChange={(event) => setTo(event.target.value)}
          type="date"
          value={to}
        />
      </div>
      {treatments.error ? (
        <p className="text-destructive text-sm">
          {wordedRefusal(treatments.error, t) ?? t("common.error")}
        </p>
      ) : null}

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            {t("inspector.treatments")}
            {treatments.data
              ? ` · ${treatments.data.from} — ${treatments.data.to}`
              : ""}
          </h2>
          <div className="flex gap-2">
            <Button
              disabled={printing}
              onClick={() => onPrint("treatment_register", asked)}
              size="sm"
              variant="outline"
            >
              {t("common.print")}
            </Button>
            <Button
              disabled={sheet.isPending}
              onClick={() =>
                sheet.mutate({
                  report: "treatment_register",
                  format: "csv",
                  ...asked,
                })
              }
              size="sm"
              variant="outline"
            >
              CSV
            </Button>
          </div>
        </div>
        {treatments.data?.rows.length ? (
          <ul className="space-y-1">
            {treatments.data.rows.map((row, index) => (
              <li
                className="rounded border p-2"
                key={`${row.givenOn}-${row.tagNumber}-${index}`}
              >
                {row.givenOn} · {row.tagNumber} · {row.drug}
                {row.diagnosis ? ` · ${row.diagnosis}` : ""}
                {row.dose ? ` · ${row.dose}` : ""}
                {row.course ? ` · ${row.course}` : ""}
                <span className="text-muted-foreground block text-xs">
                  {t("inspector.clear", {
                    milk: row.milkClearOn ?? "—",
                    meat: row.meatClearOn ?? "—",
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("inspector.noTreatments")}</p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            {t("inspector.diseases")}
            {diseases.data
              ? ` · ${diseases.data.from} — ${diseases.data.to}`
              : ""}
          </h2>
          <Button
            disabled={printing}
            onClick={() => onPrint("disease_history", asked)}
            size="sm"
            variant="outline"
          >
            {t("common.print")}
          </Button>
        </div>
        {diseases.data?.rows.length ? (
          <ul className="space-y-1">
            {diseases.data.rows.map((row, index) => (
              <li
                className="rounded border p-2"
                key={`${row.diagnosedOn}-${row.tagNumber}-${index}`}
              >
                {row.diagnosedOn} · {row.tagNumber} · {row.disease}
                {row.notifiable ? (
                  <span className="ml-1 text-amber-400">
                    {t("inspector.notifiable", {
                      reference: row.reportReference ?? "—",
                    })}
                  </span>
                ) : null}
                <span className="text-muted-foreground block text-xs">
                  {t(OUTCOME_WORD[row.outcome.kind])}
                  {row.outcome.on ? ` ${row.outcome.on}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{t("inspector.noDiseases")}</p>
        )}
      </section>
    </>
  );
};
