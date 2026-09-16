import { rowsOfRegister } from "@OpenFarm/api/registers/all";
import type { RegisterName } from "@OpenFarm/api/registers/register";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { causeWord, disposalWord } from "@/lib/mortality-words";
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
    <Section
      action={
        <>
          <Button
            disabled={printing}
            onClick={onPrint}
            size="sm"
            variant="outline"
          >
            <Printer data-icon="inline-start" />
            {t("common.print")}
          </Button>
          {onCsv ? (
            <Button
              disabled={saving}
              onClick={onCsv}
              size="sm"
              variant="outline"
            >
              <FileSpreadsheet data-icon="inline-start" />
              {t("inspector.csv")}
            </Button>
          ) : null}
        </>
      }
      description={period ? `${period.from} — ${period.to}` : undefined}
      title={t(title)}
    >
      {children?.length ? (
        <ul className="divide-border flex flex-col divide-y">{children}</ul>
      ) : (
        <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-4 text-center text-sm">
          {t(empty)}
        </p>
      )}
    </Section>
  );
};

/**
 * The health registers on the Inspector View — vaccinations (R3), treatments (R4), the disease history (R5) and
 * deaths (R6) — each printed, all but the disease history also given as a CSV; and the movement log (R11), a CSV
 * alone. A year of vaccinations, deaths and movements, thirty days of treatments and six months of diagnoses back
 * unless a period is set.
 */
export const HealthRegisters = ({
  onPrint,
  printing,
}: {
  onPrint: (register: RegisterName, asked: AskedPeriod) => void;
  printing: boolean;
}) => {
  const { t } = useLanguage();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const asked: AskedPeriod = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  /** What to ask for one register's rows over the period on the screen. */
  const listing = (register: RegisterName) => ({
    input: { register, ...asked },
  });
  const vaccinations = useQuery(
    orpc.inspector.rows.queryOptions(listing("vaccination_register"))
  );
  const treatments = useQuery(
    orpc.inspector.rows.queryOptions(listing("treatment_register"))
  );
  const diseases = useQuery(
    orpc.inspector.rows.queryOptions(listing("disease_history"))
  );
  const mortalities = useQuery(
    orpc.inspector.rows.queryOptions(listing("mortality_register"))
  );
  const sheet = useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ csv, period }, { register }) =>
        saveCsv(
          `${register.replaceAll("_", "-")}-${period?.from}-${period?.to}.csv`,
          csv ?? ""
        ),
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const printed = (register: RegisterName) => ({
    printing,
    onPrint: () => onPrint(register, asked),
  });
  const saved = (register: RegisterName) => ({
    saving: sheet.isPending,
    onCsv: () => sheet.mutate({ register, format: "csv", ...asked }),
  });

  return (
    <>
      <div className="bg-card flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("inspector.period")}</span>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t("dispatch.from")}
              className="w-44"
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
            <Input
              aria-label={t("dispatch.to")}
              className="w-44"
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </div>
        </div>
        <Button
          className="ml-auto"
          disabled={sheet.isPending}
          onClick={() =>
            sheet.mutate({ register: "movement_log", format: "csv", ...asked })
          }
          variant="outline"
        >
          <FileSpreadsheet data-icon="inline-start" />
          {t("inspector.movementLog")}
        </Button>
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
        {rowsOfRegister(vaccinations.data, "vaccination_register").map(
          (row) => (
            <li className="py-3 text-sm" key={row.id}>
              {row.givenOn} · {row.tagNumber} · {row.vaccine}
              <span className="text-muted-foreground block text-xs">
                {t("inspector.lotNumber", {
                  lotNumber: row.lotNumber ?? "—",
                })}{" "}
                · {t("inspector.vaccinatedBy", { giver: row.givenBy ?? "—" })}
              </span>
            </li>
          )
        )}
      </RegisterSection>

      <RegisterSection
        empty="inspector.noTreatments"
        period={treatments.data}
        title="inspector.treatments"
        {...printed("treatment_register")}
        {...saved("treatment_register")}
      >
        {rowsOfRegister(treatments.data, "treatment_register").map((row) => (
          <li className="py-3 text-sm" key={row.id}>
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
        {rowsOfRegister(diseases.data, "disease_history").map((row) => (
          <li className="py-3 text-sm" key={row.id}>
            {row.diagnosedOn} · {row.tagNumber} · {row.disease}
            {row.notifiable ? (
              <span className="text-warning ml-1">
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

      <RegisterSection
        empty="inspector.noMortalities"
        period={mortalities.data}
        title="inspector.mortalities"
        {...printed("mortality_register")}
        {...saved("mortality_register")}
      >
        {rowsOfRegister(mortalities.data, "mortality_register").map((row) => (
          <li className="py-3 text-sm" key={row.id}>
            {row.diedOn} · {row.tagNumber} · {t(`mortality.${row.kind}`)} ·{" "}
            {causeWord(row.cause, t)}
            <span
              className={`block text-xs ${row.disposal ? "text-muted-foreground" : "text-warning"}`}
            >
              {disposalWord(row.disposal, t)}
              {row.disposalNote ? ` · ${row.disposalNote}` : ""}
              {row.reportReference
                ? ` · ${t("inspector.notifiable", { reference: row.reportReference })}`
                : ""}
            </span>
          </li>
        ))}
      </RegisterSection>
    </>
  );
};
