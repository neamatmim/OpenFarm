import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Milk, Printer, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionDialog,
  CorrectionField,
  useCorrecting,
} from "@/components/correction-dialog";
import { MilkMismatches } from "@/components/milk-mismatches";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  PeriodFilter,
  RecordList,
  RecordRow,
  Section,
  StatTile,
} from "@/components/page";
import { Paper } from "@/components/paper";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { figure, note, person } from "@/lib/correcting";
import { wordedRefusal } from "@/lib/correction-refusal";
import { onlyFor } from "@/lib/guard";
import { saveCsv } from "@/lib/save-csv";
import { orpc } from "@/utils/orpc";

const NOTHING_TYPED = {
  dispatchedAt: "",
  litres: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  challan: "",
  price: "",
  fat: "",
  snf: "",
  note: "",
};

const DISPATCH_FIELDS = [
  ["dispatchedAt", "dispatch.when", "datetime-local"],
  ["litres", "dispatch.litresField", "number"],
  ["buyerName", "dispatch.buyer", "text"],
  ["buyerPhone", "dispatch.buyerPhone", "tel"],
  ["buyerAddress", "dispatch.buyerAddress", "text"],
  ["challan", "dispatch.challan", "text"],
  ["price", "dispatch.price", "number"],
  ["fat", "dispatch.fat", "number"],
  ["snf", "dispatch.snf", "number"],
  ["note", "dispatch.note", "text"],
] as const;

/** The boxes that read better across the whole form than in half of it. */
const WIDE_FIELDS = new Set(["buyerAddress", "note"]);

/** The Manager puts a Dispatch right — litres, price, buyer or challan — with the reason. */
const DispatchCorrection = ({
  dispatch,
}: {
  dispatch: {
    id: string;
    litres: number;
    pricePerLitreBdt: number;
    buyerName: string;
    challan: string | null;
  };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    litres: figure(dispatch.litres),
    pricePerLitreBdt: figure(dispatch.pricePerLitreBdt),
    buyer: person(dispatch.buyerName),
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
        <CorrectionField
          inputMode="decimal"
          label={t("dispatch.litresField")}
          onChange={(value) => correcting.set("litres", value)}
          type="number"
          value={correcting.typed.litres ?? ""}
        />
        <CorrectionField
          inputMode="decimal"
          label={t("dispatch.price")}
          onChange={(value) => correcting.set("pricePerLitreBdt", value)}
          type="number"
          value={correcting.typed.pricePerLitreBdt ?? ""}
        />
      </div>
      <CorrectionField
        label={t("dispatch.buyer")}
        onChange={(value) => correcting.set("buyer", value)}
        value={correcting.typed.buyer ?? ""}
      />
      <CorrectionField
        label={t("dispatch.challan")}
        onChange={(value) => correcting.set("challan", value)}
        value={correcting.typed.challan ?? ""}
      />
    </CorrectionDialog>
  );
};

/** Words typed into a box, or nothing when the box was left empty. */
const written = (value: string): string | undefined =>
  value.trim() || undefined;

/** A figure typed into a box, or nothing when the box was left empty. */
const typed = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/**
 * The milk leaving the farm: one day's tank beside what was handed over, the Dispatch as the Manager
 * records it at the gate, and the two reports that come from them — the dispatch record a processor or
 * BFSA asks for, and the production figures the Owner reads.
 */
const MilkPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const [form, setForm] = useState(NOTHING_TYPED);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [from, setFrom] = useState(() => farmDayOf(new Date()));
  const [to, setTo] = useState(() => farmDayOf(new Date()));
  const [paper, setPaper] = useState<string | null>(null);
  const today = useQuery(orpc.milk.day.queryOptions({ input: { day } }));
  const mayRecord = me.data?.roles.includes("manager") ?? false;
  // The Owner puts a Dispatch right as well, at any age; recording one stays the Manager's.
  const mayCorrect = mayRecord || (me.data?.roles.includes("owner") ?? false);
  const onError = (error: Error) =>
    toast.error(
      wordedRefusal(error, t) ?? (error.message || t("common.error"))
    );

  const record = useMutation(
    orpc.milk.dispatch.mutationOptions({
      onSuccess: async () => {
        setForm(NOTHING_TYPED);
        toast.success(t("dispatch.recorded"));
        await queryClient.invalidateQueries({ queryKey: orpc.milk.key() });
      },
      onError,
    })
  );
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
  const set = (key: keyof typeof NOTHING_TYPED) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  // A figure the farm has not given yet: a placeholder while it is asked, a dash once asking has failed.
  const notYet = today.isError ? "—" : <Skeleton className="h-9 w-32" />;
  const complete =
    Number(form.litres) > 0 &&
    Number(form.price) > 0 &&
    form.buyerName.trim() !== "";

  return (
    <Page>
      <PageHeader
        actions={
          <label
            className="flex flex-col gap-1.5 text-sm font-medium"
            htmlFor="milk-day"
          >
            {t("dispatch.day")}
            <Input
              className="w-44"
              id="milk-day"
              onChange={(event) => setDay(event.target.value)}
              type="date"
              value={day}
            />
          </label>
        }
        description={t("dispatch.subtitle")}
        title={t("dispatch.title")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={Milk}
          label={t("dispatch.intoTank")}
          value={
            today.data
              ? `${formatNumber(today.data.toBulkLitres, language)} ${t("dispatch.litres")}`
              : notYet
          }
        />
        <StatTile
          icon={Truck}
          label={t("dispatch.handedOver")}
          value={
            today.data
              ? `${formatNumber(today.data.dispatchedLitres, language)} ${t("dispatch.litres")}`
              : notYet
          }
        />
      </div>

      <MilkMismatches />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Section title={t("dispatch.thatDay")}>
          <Loaded query={today}>
            {today.data?.dispatches.length ? (
              <RecordList>
                {today.data.dispatches.map((one) => (
                  <RecordRow
                    key={one.id}
                    meta={
                      <>
                        <span>
                          {formatDate(one.dispatchedAt, language, "dateTime")}
                        </span>
                        {one.challan ? <span>{one.challan}</span> : null}
                      </>
                    }
                    title={one.buyerName}
                    trailing={
                      <span className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {formatNumber(one.litres, language)}{" "}
                          {t("dispatch.litres")}
                        </span>
                        {mayCorrect ? (
                          <DispatchCorrection dispatch={one} />
                        ) : null}
                      </span>
                    }
                  />
                ))}
              </RecordList>
            ) : (
              <EmptyState bare icon={Truck} title={t("dispatch.noneThatDay")} />
            )}
          </Loaded>
        </Section>

        {mayRecord ? (
          <Section title={t("dispatch.record")}>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                record.mutate({
                  // Left empty, the milk is leaving now.
                  dispatchedAt: form.dispatchedAt
                    ? new Date(form.dispatchedAt)
                    : new Date(),
                  litres: Number(form.litres),
                  buyer: {
                    name: form.buyerName,
                    address: written(form.buyerAddress),
                    phone: written(form.buyerPhone),
                  },
                  challan: written(form.challan),
                  pricePerLitreBdt: Number(form.price),
                  fatPercent: typed(form.fat),
                  snfPercent: typed(form.snf),
                  note: written(form.note),
                  paymentMethod,
                });
              }}
            >
              {DISPATCH_FIELDS.map(([key, label, type]) => (
                <div
                  className={
                    WIDE_FIELDS.has(key)
                      ? "space-y-1 sm:col-span-2"
                      : "space-y-1"
                  }
                  key={key}
                >
                  <Label htmlFor={`dispatch-${key}`}>{t(label)}</Label>
                  <Input
                    id={`dispatch-${key}`}
                    inputMode={type === "number" ? "decimal" : undefined}
                    onChange={(event) => set(key)(event.target.value)}
                    step={type === "number" ? "0.01" : undefined}
                    type={type}
                    value={form[key]}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <PaymentMethodField
                  id="dispatch-paid-by"
                  onChange={setPaymentMethod}
                  value={paymentMethod}
                />
              </div>
              <Button
                className="w-full sm:col-span-2 sm:w-auto sm:justify-self-start"
                disabled={!complete || record.isPending}
                type="submit"
              >
                {t("dispatch.save")}
              </Button>
            </form>
          </Section>
        ) : null}
      </div>

      <Section title={t("dispatch.reports")}>
        <PeriodFilter
          from={from}
          fromLabel={t("dispatch.from")}
          label={t("dispatch.reports")}
          onFrom={setFrom}
          onTo={setTo}
          to={to}
          toLabel={t("dispatch.to")}
        >
          <Button
            disabled={dispatchRecord.isPending}
            onClick={() => dispatchRecord.mutate({ from, to, format: "paper" })}
            variant="outline"
          >
            <Printer aria-hidden />
            {t("dispatch.recordPaper")}
          </Button>
          <Button
            disabled={dispatchCsv.isPending}
            onClick={() => dispatchCsv.mutate({ from, to, format: "csv" })}
            variant="outline"
          >
            <FileDown aria-hidden />
            {t("dispatch.recordCsv")}
          </Button>
          <Button
            disabled={production.isPending}
            onClick={() => production.mutate({ from, to })}
            variant="outline"
          >
            <FileDown aria-hidden />
            {t("dispatch.productionCsv")}
          </Button>
        </PeriodFilter>
        {paper ? <Paper id="milk-dispatch-record" text={paper} /> : null}
      </Section>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/milk")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: MilkPage,
});
