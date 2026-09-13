import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Paper } from "@/components/paper";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
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

/** Words typed into a box, or nothing when the box was left empty. */
const written = (value: string): string | undefined =>
  value.trim() || undefined;

/** A figure typed into a box, or nothing when the box was left empty. */
const typed = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/** Hands a CSV to the person's own computer, named for what it is and the period it covers. */
const saveCsv = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after the click has returned; let go of the file a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
  const complete =
    Number(form.litres) > 0 &&
    Number(form.price) > 0 &&
    form.buyerName.trim() !== "";

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("dispatch.title")}</h1>

      <section className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="milk-day">{t("dispatch.day")}</Label>
          <Input
            id="milk-day"
            onChange={(event) => setDay(event.target.value)}
            type="date"
            value={day}
          />
        </div>
        {today.data ? (
          <div className="space-y-1 text-sm">
            <p>
              {t("dispatch.toBulk", {
                litres: formatNumber(today.data.toBulkLitres, language),
              })}{" "}
              ·{" "}
              {t("dispatch.dispatched", {
                litres: formatNumber(today.data.dispatchedLitres, language),
              })}
            </p>
            <ul className="space-y-1">
              {today.data.dispatches.map((one) => (
                <li className="rounded-lg border p-2" key={one.id}>
                  {formatDate(one.dispatchedAt, language, "dateTime")} ·{" "}
                  {formatNumber(one.litres, language)} {t("dispatch.litres")} ·{" "}
                  {one.buyerName}
                  {one.challan ? ` · ${one.challan}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {mayRecord ? (
        <form
          className="space-y-2 rounded-lg border p-3"
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
          <h2 className="font-medium">{t("dispatch.record")}</h2>
          {(
            [
              ["dispatchedAt", "dispatch.when", "datetime-local"],
              ["litres", "dispatch.litresField", "number"],
              ["buyerName", "dispatch.buyer", "text"],
              ["buyerAddress", "dispatch.buyerAddress", "text"],
              ["buyerPhone", "dispatch.buyerPhone", "tel"],
              ["challan", "dispatch.challan", "text"],
              ["price", "dispatch.price", "number"],
              ["fat", "dispatch.fat", "number"],
              ["snf", "dispatch.snf", "number"],
              ["note", "dispatch.note", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <div className="space-y-1" key={key}>
              <Label htmlFor={`dispatch-${key}`}>{t(label)}</Label>
              <Input
                id={`dispatch-${key}`}
                onChange={(event) => set(key)(event.target.value)}
                step={type === "number" ? "0.01" : undefined}
                type={type}
                value={form[key]}
              />
            </div>
          ))}
          <PaymentMethodField
            id="dispatch-paid-by"
            onChange={setPaymentMethod}
            value={paymentMethod}
          />
          <Button
            disabled={!complete || record.isPending}
            type="submit"
            variant="outline"
          >
            {t("dispatch.save")}
          </Button>
        </form>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">{t("dispatch.reports")}</h2>
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
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={dispatchRecord.isPending}
            onClick={() => dispatchRecord.mutate({ from, to, format: "paper" })}
            size="sm"
            variant="outline"
          >
            {t("dispatch.recordPaper")}
          </Button>
          <Button
            disabled={dispatchCsv.isPending}
            onClick={() => dispatchCsv.mutate({ from, to, format: "csv" })}
            size="sm"
            variant="outline"
          >
            {t("dispatch.recordCsv")}
          </Button>
          <Button
            disabled={production.isPending}
            onClick={() => production.mutate({ from, to })}
            size="sm"
            variant="outline"
          >
            {t("dispatch.productionCsv")}
          </Button>
        </div>
        {paper ? <Paper id="milk-dispatch-record" text={paper} /> : null}
      </section>
    </div>
  );
};

export const Route = createFileRoute("/_auth/milk")({
  component: MilkPage,
});
