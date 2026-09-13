import type { HealthRegister } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/** A period as the registers are asked for it: a day left empty is the register's own look-back. */
interface AskedPeriod {
  from?: string;
  to?: string;
}

const OUTCOME_WORD = {
  on_the_farm: "inspector.onTheFarm",
  sold: "state.sold",
  died: "state.died",
  culled: "state.culled",
} as const satisfies Record<string, MessageKey>;

/** One register on the screen: its name and the period it covers, Print — and CSV when it is given as one — and
 *  its rows, or the words for having none. */
const RegisterSection = ({
  title,
  period,
  empty,
  printing,
  onPrint,
  saving,
  onCsv,
  children,
}: {
  title: MessageKey;
  period: { from: string; to: string } | undefined;
  empty: MessageKey;
  printing: boolean;
  onPrint: () => void;
  saving?: boolean;
  onCsv?: () => void;
  children: ReactNode[] | undefined;
}) => {
  const { t } = useLanguage();
  return (
    <section className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {t(title)}
          {period ? ` · ${period.from} — ${period.to}` : ""}
        </h2>
        <div className="flex gap-2">
          <Button
            disabled={printing}
            onClick={onPrint}
            size="sm"
            variant="outline"
          >
            {t("common.print")}
          </Button>
          {onCsv ? (
            <Button
              disabled={saving}
              onClick={onCsv}
              size="sm"
              variant="outline"
            >
              {t("inspector.csv")}
            </Button>
          ) : null}
        </div>
      </div>
      {children?.length ? (
        <ul className="space-y-1">{children}</ul>
      ) : (
        <p className="text-muted-foreground">{t(empty)}</p>
      )}
    </section>
  );
};

/**
 * The vaccination register (R3), the treatment register (R4) and the disease history (R5) on the Inspector View:
 * every vaccination with its Lot Number, every dose with what was behind it, every diagnosis with the notifiable
 * ones marked — each printed, and the two dose registers also given as a CSV. A year, thirty days and six months
 * back unless a period is set.
 */
export const HealthRegisters = ({
  onPrint,
  printing,
}: {
  onPrint: (report: HealthRegister, asked: AskedPeriod) => void;
  printing: boolean;
}) => {
  const { t } = useLanguage();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const asked: AskedPeriod = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const vaccinations = useQuery(
    orpc.inspector.vaccinations.queryOptions({ input: asked })
  );
  const treatments = useQuery(
    orpc.inspector.treatments.queryOptions({ input: asked })
  );
  const diseases = useQuery(
    orpc.inspector.diseases.queryOptions({ input: asked })
  );
  const sheet = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ csv, period }, { report }) =>
        saveCsv(
          `${report.replaceAll("_", "-")}-${period?.from}-${period?.to}.csv`,
          csv ?? ""
        ),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const printed = (report: HealthRegister) => ({
    printing,
    onPrint: () => onPrint(report, asked),
  });
  const saved = (report: HealthRegister) => ({
    saving: sheet.isPending,
    onCsv: () => sheet.mutate({ report, format: "csv", ...asked }),
  });

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

      <RegisterSection
        empty="inspector.noVaccinations"
        period={vaccinations.data}
        title="inspector.vaccinations"
        {...printed("vaccination_register")}
        {...saved("vaccination_register")}
      >
        {vaccinations.data?.rows.map((row) => (
          <li className="rounded border p-2" key={row.id}>
            {row.givenOn} · {row.tagNumber} · {row.vaccine}
            <span className="text-muted-foreground block text-xs">
              {t("inspector.lotNumber", {
                lotNumber: row.lotNumber ?? "—",
              })} ·{" "}
              {t("inspector.vaccinatedBy", { giver: row.givenBy ?? "—" })}
            </span>
          </li>
        ))}
      </RegisterSection>

      <RegisterSection
        empty="inspector.noTreatments"
        period={treatments.data}
        title="inspector.treatments"
        {...printed("treatment_register")}
        {...saved("treatment_register")}
      >
        {treatments.data?.rows.map((row) => (
          <li className="rounded border p-2" key={row.id}>
            {row.givenOn} · {row.tagNumber}
            {row.diagnosis ? ` · ${row.diagnosis}` : ""} · {row.drug}
            {row.dose ? ` · ${row.dose}` : ""}
            {row.route ? ` · ${t(`route.${row.route}`)}` : ""}
            {row.course ? ` · ${row.course}` : ""}
            <span className="text-muted-foreground block text-xs">
              {t("inspector.givenBy", {
                giver: row.givenBy ?? "—",
                vet: row.prescribedBy ?? "—",
              })}
            </span>
            <span className="text-muted-foreground block text-xs">
              {t("inspector.clear", {
                milk: row.milkClearOn ?? "—",
                meat: row.meatClearOn ?? "—",
              })}
            </span>
          </li>
        ))}
      </RegisterSection>

      <RegisterSection
        empty="inspector.noDiseases"
        period={diseases.data}
        title="inspector.diseases"
        {...printed("disease_history")}
      >
        {diseases.data?.rows.map((row) => (
          <li className="rounded border p-2" key={row.id}>
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
      </RegisterSection>
    </>
  );
};
