import type { PaymentMethod } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

import { worthOf } from "./milk-types";

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

type Typed = typeof NOTHING_TYPED;

/** Words typed into a box, or nothing when the box was left empty. */
const written = (value: string): string | undefined =>
  value.trim() || undefined;

/** A figure typed into a box, or nothing when the box was left empty. */
const typed = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/** One box of the Dispatch, labelled, holding what was typed into it. */
const DispatchInput = ({
  name,
  label,
  draft,
  onType,
  ...props
}: {
  name: keyof Typed;
  label: string;
  draft: Typed;
  onType: (name: keyof Typed, value: string) => void;
} & Omit<
  ComponentProps<typeof Input>,
  "id" | "name" | "onChange" | "value"
>) => (
  <FormField id={`dispatch-${name}`} label={label}>
    <Input
      id={`dispatch-${name}`}
      onChange={(event) => onType(name, event.target.value)}
      value={draft[name]}
      {...props}
    />
  </FormField>
);

/** A figure box: decimals, on the phone's number pad. */
const FIGURE = { inputMode: "decimal", step: "0.01", type: "number" } as const;

/** What the milk comes to at the price typed, worked out as it is typed, as the collector's slip would say it. */
const Worth = ({ form }: { form: Typed }) => {
  const { t } = useLanguage();
  const litres = Number(form.litres);
  const price = Number(form.price);
  if (!(litres > 0 && price > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {t("dispatch.worth", {
        litres,
        price,
        taka: worthOf(litres, price),
      })}
    </p>
  );
};

/**
 * Milk handed over at the gate, in a sheet beside the page: how much and at what price first, then the buyer as the
 * Safe Food Act wants them written, the challan and how it was paid, and what the collector measured. What is typed
 * stays when the sheet is closed without recording, so a buyer's phone looked up is not typed twice.
 */
export const DispatchSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const [form, setForm] = useState(NOTHING_TYPED);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const record = useMutation(
    orpc.milk.dispatch.mutationOptions({
      onSuccess: () => {
        setForm(NOTHING_TYPED);
        toast.success(t("dispatch.recorded"));
        onOpenChange(false);
      },
      onError: (error: Error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const handleType = (name: keyof Typed, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));
  const complete =
    Number(form.litres) > 0 &&
    Number(form.price) > 0 &&
    form.buyerName.trim() !== "";
  const box = { draft: form, onType: handleType };

  return (
    <FormSheet
      description={t("dispatch.sheetDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
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
        })
      }
      open={open}
      pending={record.isPending}
      ready={complete}
      submitLabel={t("dispatch.save")}
      title={t("dispatch.recordAction")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput
          {...box}
          {...FIGURE}
          label={t("dispatch.litresField")}
          min={0}
          name="litres"
          required
        />
        <DispatchInput
          {...box}
          {...FIGURE}
          label={t("dispatch.price")}
          min={0}
          name="price"
          required
        />
      </div>
      <Worth form={form} />

      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput
          {...box}
          autoComplete="off"
          label={t("dispatch.buyer")}
          name="buyerName"
          required
        />
        <DispatchInput
          {...box}
          label={t("dispatch.buyerPhone")}
          name="buyerPhone"
          type="tel"
        />
      </div>
      <DispatchInput
        {...box}
        label={t("dispatch.buyerAddress")}
        name="buyerAddress"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput {...box} label={t("dispatch.challan")} name="challan" />
        <PaymentMethodField
          id="dispatch-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput
          {...box}
          {...FIGURE}
          label={t("dispatch.fat")}
          name="fat"
        />
        <DispatchInput
          {...box}
          {...FIGURE}
          label={t("dispatch.snf")}
          name="snf"
        />
      </div>

      <DispatchInput
        {...box}
        label={t("dispatch.when")}
        name="dispatchedAt"
        type="datetime-local"
      />
      <DispatchInput {...box} label={t("dispatch.note")} name="note" />
    </FormSheet>
  );
};
