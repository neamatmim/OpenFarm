import type { DiagnosisRow } from "@OpenFarm/api/registers/disease-history";
import type { DeathRow } from "@OpenFarm/api/registers/mortality";
import type { RegisterName } from "@OpenFarm/api/registers/register";
import type { RowsAnswer } from "@OpenFarm/api/registers/rows";
import { rowsOfRegister } from "@OpenFarm/api/registers/rows";
import type { TreatmentRow } from "@OpenFarm/api/registers/treatment";
import type { VaccinationRow } from "@OpenFarm/api/registers/vaccination";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, Printer, X } from "lucide-react";
import type { ReactNode } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Notice, PeriodFilter, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { causeWord, disposalWord } from "@/lib/mortality-words";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

/** A period as the registers are asked for it: a day left empty is the register's own look-back. */
export interface AskedPeriod {
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
  count,
  printing,
  onPrint,
  saving,
  onCsv,
  children,
}: {
  title: MessageKey;
  period: { from: string; to: string } | undefined;
  empty: MessageKey;
  /** How many rows it holds: none, and it says so rather than drawing an empty table. */
  count: number;
  printing: boolean;
  onPrint: () => void;
  saving?: boolean;
  onCsv?: () => void;
  children: ReactNode;
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
            <Printer aria-hidden data-icon="inline-start" />
            {t("common.print")}
          </Button>
          {onCsv ? (
            <Button
              disabled={saving}
              onClick={onCsv}
              size="sm"
              variant="outline"
            >
              <FileSpreadsheet aria-hidden data-icon="inline-start" />
              {t("inspector.csv")}
            </Button>
          ) : null}
        </>
      }
      description={period ? `${period.from} — ${period.to}` : undefined}
      title={t(title)}
    >
      {count === 0 ? (
        <EmptyState bare icon={ClipboardList} title={t(empty)} />
      ) : (
        children
      )}
    </Section>
  );
};

/** What each register's section is handed besides its rows: the period they came back for, and its Print and CSV. */
interface RegisterControls {
  printing: boolean;
  onPrint: () => void;
  saving?: boolean;
  onCsv?: () => void;
}

/** A day a register was read for, kept on one line so a column of them reads down. */
const ONE_LINE = { className: "whitespace-nowrap" };

const TagCell = ({ row }: { row: { original: { tagNumber: string } } }) => (
  <span className="font-mono font-semibold tabular-nums">
    {row.original.tagNumber}
  </span>
);

/** A dash for what a register has no word for. */
const orDash = (value: string | null): string => value ?? "—";

// Vaccinations (R3)

const VaccinationLine = ({ row }: { row: VaccinationRow }) => {
  const { t } = useLanguage();
  return (
    <div className="text-sm">
      {row.givenOn} · {row.tagNumber} · {row.vaccine}
      <span className="text-muted-foreground block text-xs">
        {t("inspector.lotNumber", { lotNumber: row.lotNumber ?? "—" })} ·{" "}
        {t("inspector.vaccinatedBy", { giver: row.givenBy ?? "—" })}
      </span>
    </div>
  );
};

const vaccinationCard = (row: VaccinationRow) => <VaccinationLine row={row} />;

const vaccination = createListColumns<VaccinationRow>();
const vaccinationColumns = vaccination.columns([
  vaccination.accessor("givenOn", {
    header: listHeader("money.col.date"),
    meta: ONE_LINE,
  }),
  vaccination.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  vaccination.accessor("vaccine", { header: listHeader("drugs.vaccine") }),
  vaccination.accessor((row) => orDash(row.lotNumber), {
    id: "lotNumber",
    header: listHeader("inspector.col.lotNumber"),
  }),
  vaccination.accessor((row) => orDash(row.givenBy), {
    id: "givenBy",
    header: listHeader("animals.col.givenBy"),
  }),
]);

/** Every vaccine given in the period: the day, the animal, the vaccine, its vial's Lot Number and who gave it. */
const VaccinationRegister = ({
  answer,
  ...controls
}: RegisterControls & { answer: RowsAnswer | undefined }) => {
  const rows = rowsOfRegister(answer, "vaccination_register");
  const table = useListTable({
    columns: vaccinationColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <RegisterSection
      count={rows.length}
      empty="inspector.noVaccinations"
      period={answer}
      title="inspector.vaccinations"
      {...controls}
    >
      <DataTable card={vaccinationCard} minWidth="40rem" table={table} />
    </RegisterSection>
  );
};

// Treatments (R4)

const TreatmentLine = ({ row }: { row: TreatmentRow }) => {
  const { t } = useLanguage();
  return (
    <div className="text-sm">
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
    </div>
  );
};

const treatmentCard = (row: TreatmentRow) => <TreatmentLine row={row} />;

/** The drug, and under it how it was given: the dose, the route and the course, as far as they were written. */
const DrugCell = ({ row }: { row: { original: TreatmentRow } }) => {
  const { t } = useLanguage();
  const { dose, route, course, drug } = row.original;
  const how = [dose, route ? t(`route.${route}`) : null, course].filter(
    Boolean
  );
  return (
    <div className="flex flex-col gap-0.5">
      <span>{drug}</span>
      {how.length > 0 ? (
        <span className="text-muted-foreground text-xs">{how.join(" · ")}</span>
      ) : null}
    </div>
  );
};

const treatment = createListColumns<TreatmentRow>();
const treatmentColumns = treatment.columns([
  treatment.accessor("givenOn", {
    header: listHeader("money.col.date"),
    meta: ONE_LINE,
  }),
  treatment.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  treatment.accessor((row) => orDash(row.diagnosis), {
    id: "diagnosis",
    header: listHeader("vet.disease"),
  }),
  treatment.accessor("drug", {
    header: listHeader("prescribe.product"),
    cell: DrugCell,
  }),
  treatment.accessor((row) => orDash(row.givenBy), {
    id: "givenBy",
    header: listHeader("animals.col.givenBy"),
  }),
  treatment.accessor((row) => orDash(row.prescribedBy), {
    id: "prescribedBy",
    header: listHeader("inspector.col.prescribedBy"),
  }),
  treatment.accessor((row) => orDash(row.milkClearOn), {
    id: "milkClearOn",
    header: listHeader("inspector.col.milkClear"),
    meta: ONE_LINE,
  }),
  treatment.accessor((row) => orDash(row.meatClearOn), {
    id: "meatClearOn",
    header: listHeader("inspector.col.meatClear"),
    meta: ONE_LINE,
  }),
]);

/** Every dose given in the period, with what it answered, who gave and who prescribed it, and when her milk and meat
 *  come clear of it. */
const TreatmentRegister = ({
  answer,
  ...controls
}: RegisterControls & { answer: RowsAnswer | undefined }) => {
  const rows = rowsOfRegister(answer, "treatment_register");
  const table = useListTable({
    columns: treatmentColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <RegisterSection
      count={rows.length}
      empty="inspector.noTreatments"
      period={answer}
      title="inspector.treatments"
      {...controls}
    >
      <DataTable card={treatmentCard} minWidth="56rem" table={table} />
    </RegisterSection>
  );
};

// Disease history (R5)

/** A notifiable diagnosis and the reference its letter went under — nothing beside one that is not. */
const NotifiableCell = ({ row }: { row: { original: DiagnosisRow } }) => {
  const { t } = useLanguage();
  if (!row.original.notifiable) {
    return null;
  }
  return (
    <span className="text-warning">
      {t("inspector.notifiable", {
        reference: row.original.reportReference ?? "—",
      })}
    </span>
  );
};

/** What became of her since, and when. */
const OutcomeWord = ({ outcome }: { outcome: DiagnosisRow["outcome"] }) => {
  const { t } = useLanguage();
  return (
    <>
      {t(OUTCOME_WORD[outcome.kind])}
      {outcome.on ? ` ${outcome.on}` : ""}
    </>
  );
};

const OutcomeCell = ({ row }: { row: { original: DiagnosisRow } }) => (
  <OutcomeWord outcome={row.original.outcome} />
);

const DiagnosisLine = ({ row }: { row: DiagnosisRow }) => {
  const { t } = useLanguage();
  return (
    <div className="text-sm">
      {row.diagnosedOn} · {row.tagNumber} · {row.disease}
      {row.notifiable ? (
        <span className="text-warning ml-1">
          {t("inspector.notifiable", {
            reference: row.reportReference ?? "—",
          })}
        </span>
      ) : null}
      <span className="text-muted-foreground block text-xs">
        <OutcomeWord outcome={row.outcome} />
      </span>
    </div>
  );
};

const diagnosisCard = (row: DiagnosisRow) => <DiagnosisLine row={row} />;

const diagnosis = createListColumns<DiagnosisRow>();
const diagnosisColumns = diagnosis.columns([
  diagnosis.accessor("diagnosedOn", {
    header: listHeader("money.col.date"),
    meta: ONE_LINE,
  }),
  diagnosis.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  diagnosis.accessor("disease", { header: listHeader("vet.disease") }),
  diagnosis.accessor("notifiable", {
    header: listHeader("inspector.col.notifiable"),
    cell: NotifiableCell,
  }),
  diagnosis.accessor((row) => row.outcome.kind, {
    id: "outcome",
    header: listHeader("inspector.col.outcome"),
    cell: OutcomeCell,
    meta: ONE_LINE,
  }),
]);

/** Every diagnosis in the period, whether the farm's list made it notifiable, and what became of the animal. */
const DiseaseHistory = ({
  answer,
  ...controls
}: RegisterControls & { answer: RowsAnswer | undefined }) => {
  const rows = rowsOfRegister(answer, "disease_history");
  const table = useListTable({
    columns: diagnosisColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <RegisterSection
      count={rows.length}
      empty="inspector.noDiseases"
      period={answer}
      title="inspector.diseases"
      {...controls}
    >
      <DataTable card={diagnosisCard} minWidth="44rem" table={table} />
    </RegisterSection>
  );
};

// Deaths (R6)

const KindCell = ({ row }: { row: { original: DeathRow } }) => {
  const { t } = useLanguage();
  return t(`mortality.${row.original.kind}`);
};

const CauseCell = ({ row }: { row: { original: DeathRow } }) => {
  const { t } = useLanguage();
  return causeWord(row.original.cause, t);
};

/** How the carcass went, or — in the warning colour — that the farm is still to say. */
const DisposalCell = ({ row }: { row: { original: DeathRow } }) => {
  const { t } = useLanguage();
  const { disposal, disposalNote } = row.original;
  return (
    <span className={disposal ? undefined : "text-warning"}>
      {disposalWord(disposal, t)}
      {disposalNote ? ` · ${disposalNote}` : ""}
    </span>
  );
};

const DeathLine = ({ row }: { row: DeathRow }) => {
  const { t } = useLanguage();
  return (
    <div className="text-sm">
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
    </div>
  );
};

const deathCard = (row: DeathRow) => <DeathLine row={row} />;

const death = createListColumns<DeathRow>();
const deathColumns = death.columns([
  death.accessor("diedOn", {
    header: listHeader("money.col.date"),
    meta: ONE_LINE,
  }),
  death.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  death.accessor("kind", {
    header: listHeader("mortality.kind"),
    cell: KindCell,
  }),
  death.accessor("cause", {
    header: listHeader("inspector.col.cause"),
    cell: CauseCell,
  }),
  death.accessor((row) => row.disposal ?? "", {
    id: "disposal",
    header: listHeader("inspector.col.disposal"),
    cell: DisposalCell,
  }),
  death.accessor((row) => orDash(row.reportReference || null), {
    id: "reportReference",
    header: listHeader("inspector.col.dlsReference"),
  }),
]);

/** Every death and cull in the period: the day, the animal, how she went and why, the carcass, and the letter to DLS. */
const MortalityRegister = ({
  answer,
  ...controls
}: RegisterControls & { answer: RowsAnswer | undefined }) => {
  const rows = rowsOfRegister(answer, "mortality_register");
  const table = useListTable({
    columns: deathColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <RegisterSection
      count={rows.length}
      empty="inspector.noMortalities"
      period={answer}
      title="inspector.mortalities"
      {...controls}
    >
      <DataTable card={deathCard} minWidth="48rem" table={table} />
    </RegisterSection>
  );
};

/** The registers read on the screen a period at a time; the movement log is a CSV alone. */
export type HealthRegisterName =
  | "vaccination_register"
  | "treatment_register"
  | "disease_history"
  | "mortality_register";

/** Saving a register as a CSV, named for the register and the period it covers. */
const useCsv = () => {
  const refused = useRefused();
  return useMutation(
    orpc.inspector.print.mutationOptions({
      onSuccess: ({ csv, period }, { register }) =>
        saveCsv(
          `${register.replaceAll("_", "-")}-${period?.from}-${period?.to}.csv`,
          csv ?? ""
        ),
      onError: refused,
    })
  );
};

const REGISTER_OF = {
  vaccination_register: VaccinationRegister,
  treatment_register: TreatmentRegister,
  disease_history: DiseaseHistory,
  mortality_register: MortalityRegister,
} as const;

/**
 * One health register on the Inspector View — vaccinations (R3), treatments (R4), the disease history (R5) or deaths
 * (R6) — over the period asked, printed, and all but the disease history also given as a CSV. A year of vaccinations
 * and deaths, thirty days of treatments and six months of diagnoses back unless a period is set.
 */
export const HealthRegister = ({
  register,
  asked,
  onPrint,
  printing,
}: {
  register: HealthRegisterName;
  asked: AskedPeriod;
  onPrint: (register: RegisterName, asked: AskedPeriod) => void;
  printing: boolean;
}) => {
  const { t } = useLanguage();
  const rows = useQuery(
    orpc.inspector.rows.queryOptions({ input: { register, ...asked } })
  );
  const sheet = useCsv();
  if (rows.data === undefined && rows.error) {
    return (
      <Notice
        title={wordedRefusal(rows.error, t) ?? t("common.error")}
        tone="danger"
      />
    );
  }
  if (rows.data === undefined) {
    return <Skeleton className="h-72 rounded-xl" />;
  }
  const Register = REGISTER_OF[register];
  return (
    <Register
      answer={rows.data}
      onPrint={() => onPrint(register, asked)}
      printing={printing}
      {...(register === "disease_history"
        ? {}
        : {
            saving: sheet.isPending,
            onCsv: () => sheet.mutate({ register, format: "csv", ...asked }),
          })}
    />
  );
};

/** The movement log (R11) — every Move, Intake, Sale and death in the period — taken away as a CSV. */
export const MovementLog = ({ asked }: { asked: AskedPeriod }) => {
  const { t } = useLanguage();
  const sheet = useCsv();
  return (
    <Section
      description={t("inspector.movementHint")}
      title={t("inspector.movementLog")}
    >
      <Button
        className="self-start"
        disabled={sheet.isPending}
        onClick={() =>
          sheet.mutate({ register: "movement_log", format: "csv", ...asked })
        }
        variant="outline"
      >
        {sheet.isPending ? (
          <Spinner />
        ) : (
          <FileSpreadsheet aria-hidden data-icon="inline-start" />
        )}
        {t("inspector.saveMovements")}
      </Button>
    </Section>
  );
};

/** The period the registers are read for: either day left empty is the register's own look-back. */
export const RegisterPeriod = ({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (day: string) => void;
  onTo: (day: string) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <PeriodFilter
        from={from}
        fromLabel={t("dispatch.from")}
        label={t("inspector.period")}
        onFrom={onFrom}
        onTo={onTo}
        to={to}
        toLabel={t("dispatch.to")}
      >
        {from || to ? (
          <Button
            onClick={() => {
              onFrom("");
              onTo("");
            }}
            type="button"
            variant="ghost"
          >
            <X aria-hidden data-icon="inline-start" />
            {t("inspector.clearPeriod")}
          </Button>
        ) : null}
      </PeriodFilter>
      <p className="text-muted-foreground px-1 text-xs">
        {t("inspector.periodHint")}
      </p>
    </div>
  );
};
