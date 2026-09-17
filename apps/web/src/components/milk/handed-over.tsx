import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Loaded } from "@/components/page";
import { FilterBar } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { amount, counterparty, note } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

import type { Dispatch, MilkDay } from "./milk-types";
import { shiftDay } from "./milk-types";

/** The Manager puts a Dispatch right — litres, price, buyer or challan — with the reason. */
const DispatchCorrection = ({ dispatch }: { dispatch: Dispatch }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    litres: amount(dispatch.litres),
    pricePerLitreBdt: amount(dispatch.pricePerLitreBdt),
    buyer: counterparty(dispatch.buyerName),
    challan: note(dispatch.challan),
  });
  const correct = useMutation(orpc.milk.correctDispatch.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: dispatch.id,
          reason,
          changes: correcting.changes(),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.milk.key() });
      }}
      ready={correcting.changed}
      title={t("correct.dispatch")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="decimal"
          label={t("dispatch.litresField")}
          onChange={(value) => correcting.set("litres", value)}
          type="number"
          value={correcting.typed.litres ?? ""}
        />
        <CorrectionAnswer
          inputMode="decimal"
          label={t("dispatch.price")}
          onChange={(value) => correcting.set("pricePerLitreBdt", value)}
          type="number"
          value={correcting.typed.pricePerLitreBdt ?? ""}
        />
      </div>
      <CorrectionAnswer
        label={t("dispatch.buyer")}
        onChange={(value) => correcting.set("buyer", value)}
        value={correcting.typed.buyer ?? ""}
      />
      <CorrectionAnswer
        label={t("dispatch.challan")}
        onChange={(value) => correcting.set("challan", value)}
        value={correcting.typed.challan ?? ""}
      />
    </CorrectionDialog>
  );
};

interface DispatchRow extends Dispatch {
  mayCorrect: boolean;
}

/** A percentage the collector may not have measured: a dash when nobody wrote it. */
const Percent = ({ value }: { value: number | null }) => {
  const { language } = useLanguage();
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    formatNumber(value, language)
  );
};

const WhenCell = ({ row }: { row: { original: DispatchRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatDate(row.original.dispatchedAt, language, "dateTime")}
    </span>
  );
};

const BuyerCell = ({ row }: { row: { original: DispatchRow } }) => (
  <span className="font-medium">{row.original.buyerName}</span>
);

const ChallanCell = ({ row }: { row: { original: DispatchRow } }) =>
  row.original.challan ? (
    <span className="whitespace-nowrap">{row.original.challan}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

const LitresCell = ({ row }: { row: { original: DispatchRow } }) => {
  const { t, language } = useLanguage();
  return (
    <span className="font-semibold whitespace-nowrap">
      {formatNumber(row.original.litres, language)} {t("dispatch.litres")}
    </span>
  );
};

const PriceCell = ({ row }: { row: { original: DispatchRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      ৳{formatNumber(row.original.pricePerLitreBdt, language)}
    </span>
  );
};

const FatCell = ({ row }: { row: { original: DispatchRow } }) => (
  <Percent value={row.original.fatPercent} />
);

const SnfCell = ({ row }: { row: { original: DispatchRow } }) => (
  <Percent value={row.original.snfPercent} />
);

const CorrectCell = ({ row }: { row: { original: DispatchRow } }) =>
  row.original.mayCorrect ? (
    <DispatchCorrection dispatch={row.original} />
  ) : null;

const column = createListColumns<DispatchRow>();
const dispatchColumns = column.columns([
  column.accessor((one) => new Date(one.dispatchedAt).getTime(), {
    id: "dispatchedAt",
    header: listHeader("audit.when"),
    cell: WhenCell,
  }),
  column.accessor("buyerName", {
    header: listHeader("dispatch.buyer"),
    cell: BuyerCell,
  }),
  column.accessor((one) => one.challan ?? "", {
    id: "challan",
    header: listHeader("dispatch.challan"),
    cell: ChallanCell,
  }),
  column.accessor("litres", {
    header: listHeader("dispatch.litresField"),
    cell: LitresCell,
    meta: { align: "end" },
  }),
  column.accessor("pricePerLitreBdt", {
    header: listHeader("dispatch.price"),
    cell: PriceCell,
    meta: { align: "end" },
  }),
  column.accessor((one) => one.fatPercent ?? -1, {
    id: "fat",
    header: listHeader("dispatch.fat"),
    cell: FatCell,
    meta: { align: "end" },
  }),
  column.accessor((one) => one.snfPercent ?? -1, {
    id: "snf",
    header: listHeader("dispatch.snf"),
    cell: SnfCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "correct",
    header: ActionsHeader,
    cell: CorrectCell,
    meta: { align: "end" },
  }),
]);

/** A Dispatch on a phone: the buyer on top, the litres large, and when, the challan and the price beneath. */
const DispatchCard = ({ row }: { row: DispatchRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{row.buyerName}</span>
        <span className="font-semibold tabular-nums">
          {formatNumber(row.litres, language)} {t("dispatch.litres")}
          <span className="text-muted-foreground text-xs font-normal">
            {" "}
            · ৳{formatNumber(row.pricePerLitreBdt, language)}
          </span>
        </span>
        <span className="text-muted-foreground text-xs">
          {formatDate(row.dispatchedAt, language, "dateTime")}
          {row.challan ? ` · ${row.challan}` : ""}
        </span>
      </div>
      {row.mayCorrect ? <DispatchCorrection dispatch={row} /> : null}
    </div>
  );
};

const dispatchCard = (row: DispatchRow) => <DispatchCard row={row} />;

/** The day the page reads, typed or stepped a day at a time; never past today, when nothing has left yet. */
const DayPicker = ({
  day,
  onChange,
}: {
  day: string;
  onChange: (day: string) => void;
}) => {
  const { t } = useLanguage();
  const today = farmDayOf(new Date());
  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label={t("dispatch.dayBefore")}
        onClick={() => onChange(shiftDay(day, -1))}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronLeft aria-hidden />
      </Button>
      <Input
        aria-label={t("dispatch.day")}
        className="w-44"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={day}
      />
      <Button
        aria-label={t("dispatch.dayAfter")}
        disabled={day >= today}
        onClick={() => onChange(shiftDay(day, 1))}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
};

/** The day's Dispatches, with the day chosen above them, and the way to record one when there are none. */
export const HandedOverTab = ({
  day,
  onDayChange,
  milkDay,
  mayRecord,
  onRecord,
}: {
  day: string;
  onDayChange: (day: string) => void;
  milkDay: {
    data: MilkDay | undefined;
    isError: boolean;
    refetch: () => unknown;
  };
  mayRecord: boolean;
  onRecord: () => void;
}) => {
  const { t } = useLanguage();
  const dispatches = milkDay.data?.dispatches ?? [];
  const table = useListTable({
    columns: dispatchColumns,
    data: dispatches.map((one) => ({ ...one, mayCorrect: mayRecord })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar className="border-b pb-4">
        <DayPicker day={day} onChange={onDayChange} />
      </FilterBar>
      <Loaded query={milkDay}>
        {dispatches.length === 0 ? (
          <EmptyState
            action={
              mayRecord ? (
                <Button onClick={onRecord} type="button" variant="outline">
                  <Truck aria-hidden data-icon="inline-start" />
                  {t("dispatch.recordAction")}
                </Button>
              ) : null
            }
            bare
            icon={Truck}
            title={t("dispatch.noneThatDay")}
          />
        ) : (
          <DataTable card={dispatchCard} minWidth="56rem" table={table} />
        )}
      </Loaded>
    </div>
  );
};
