import type { PaymentMethod } from "@OpenFarm/domain";
import { underMeatWithdrawal } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { fitOnFrom } from "@/components/fattening/fattening-types";
import { Notice } from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { usePenNames } from "@/lib/pen-names";
import { orpc } from "@/utils/orpc";

/** What is typed into the sheet, before it is a Sale. */
export interface SaleAnswers {
  tagNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  priceBdt: string;
  weightKg: string;
  destination: string;
  vehicle: string;
  driver: string;
  note: string;
  paymentMethod: PaymentMethod;
}

export const NOTHING_TYPED: SaleAnswers = {
  tagNumber: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  priceBdt: "",
  weightKg: "",
  destination: "",
  vehicle: "",
  driver: "",
  note: "",
  paymentMethod: "cash",
};

/** A part of the sheet with a name, and — for the buyer — the button that fills it in from the last sale. */
const SheetPart = ({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold" id={id}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
};

/** The last buyer and lorry of the day, one button away. Nothing at all on a day the farm has
 *  sold nothing: yesterday's buyer is a different market. */
const LastBuyerOfTheDay = ({
  onUse,
}: {
  onUse: (patch: Partial<SaleAnswers>) => void;
}) => {
  const { t } = useLanguage();
  const last = useQuery(orpc.sale.lastToday.queryOptions());
  const sale = last.data ?? null;
  if (!sale) {
    return null;
  }
  return (
    <Button
      onClick={() =>
        onUse({
          buyerName: sale.buyerName,
          buyerAddress: sale.buyerAddress ?? "",
          buyerPhone: sale.buyerPhone ?? "",
          destination: sale.destination,
          vehicle: sale.vehicle,
          driver: sale.driver,
        })
      }
      size="sm"
      type="button"
      variant="outline"
    >
      <History aria-hidden data-icon="inline-start" />
      {t("sale.again")}
    </Button>
  );
};

/**
 * Which animal: one of those confirmed Ready and clear of her days, from the list — or, for a dairy cow going to a
 * butcher, who is never Ready for Sale, chosen from the rest of the herd the farm would sell today.
 */
const AnimalPart = ({
  answers,
  onEdit,
}: {
  answers: SaleAnswers;
  onEdit: (patch: Partial<SaleAnswers>) => void;
}) => {
  const { t } = useLanguage();
  const [byTag, setByTag] = useState(false);
  // Asked of the farm, not filtered here: the phone cannot see a withdrawal, and a beast
  // confirmed Ready last week and treated on Thursday would sit in this list looking sellable.
  const sellable = useQuery(orpc.sale.sellable.queryOptions());
  const ready = sellable.data ?? [];
  const listed = ready.some((row) => row.tagNumber === answers.tagNumber);
  const typing =
    byTag || ready.length === 0 || (answers.tagNumber !== "" && !listed);
  // Any other animal the farm would sell today: still here, and out of her meat withdrawal — chosen from the herd,
  // not typed, so a cull going to the butcher is picked by her Pen and her State rather than a tag from memory.
  const herd = useQuery({
    ...orpc.animals.list.queryOptions({ input: {} }),
    enabled: typing,
  });
  const penNames = usePenNames(typing);
  const now = new Date();
  const others = (herd.data ?? [])
    .filter((her) => !underMeatWithdrawal(her, now))
    .map((her) => ({
      value: her.tagNumber,
      label: her.tagNumber,
      detail: [
        her.penId ? penNames.get(her.penId) : undefined,
        t(`state.${her.state}` as MessageKey),
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  return (
    <SheetPart title={t("sale.groupAnimal")}>
      {ready.length === 0 ? (
        <Notice title={t("sale.noneReady")} tone="info" />
      ) : null}
      <FormField id="sale-animal" label={t("sale.animal")}>
        {typing ? (
          <SearchablePicker
            empty={t("sale.noneToSell")}
            id="sale-animal"
            loading={herd.isPending}
            onChange={(tagNumber) => onEdit({ tagNumber })}
            options={others}
            placeholder={t("picker.findAnimal")}
            value={answers.tagNumber}
          />
        ) : (
          <NativeSelect
            id="sale-animal"
            onChange={(event) => onEdit({ tagNumber: event.target.value })}
            required
            value={answers.tagNumber}
          >
            <option value="">—</option>
            {ready.map((row) => (
              <option key={row.id} value={row.tagNumber}>
                {row.tagNumber} · {row.penName}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {ready.length === 0 ? null : (
        <Button
          className="w-fit px-0"
          onClick={() => {
            setByTag(!typing);
            onEdit({ tagNumber: "" });
          }}
          type="button"
          variant="link"
        >
          {t(typing ? "sale.fromList" : "sale.otherAnimal")}
        </Button>
      )}
    </SheetPart>
  );
};

/** What a kilo fetched, worked out as the price and weight are typed. */
const PerKg = ({ answers }: { answers: SaleAnswers }) => {
  const { t, language } = useLanguage();
  const price = Number(answers.priceBdt);
  const weight = Number(answers.weightKg);
  if (!(price > 0 && weight > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {t("intake.perKg", {
        taka: formatNumber(Math.round((price / weight) * 100) / 100, language),
      })}
    </p>
  );
};

/** One text box of the sheet, labelled. */
const TextField = ({
  id,
  label,
  value,
  onChange,
  maxLength,
  required = false,
  hint,
  inputMode,
  type,
  step,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  required?: boolean;
  hint?: ReactNode;
  inputMode?: "decimal" | "numeric" | "tel";
  type?: "number";
  step?: string;
}) => (
  <FormField hint={hint} id={id} label={label}>
    <Input
      autoComplete="off"
      id={id}
      inputMode={inputMode}
      maxLength={maxLength}
      min={type === "number" ? 0 : undefined}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      step={step}
      type={type}
      value={value}
    />
  </FormField>
);

/**
 * Whether everything a Sale needs has been given.
 *
 * Not whether anything is Ready: a cull off the dairy side goes to the butcher by her tag whether or not a
 * fattening bull is Ready that day, and the farm takes her — it asks only that she is here and out of her
 * withdrawal. Asking the list here held Save shut on exactly the day the typed tag was offered for.
 */
const isReady = (answers: SaleAnswers) =>
  answers.tagNumber.trim() !== "" &&
  answers.buyerName.trim() !== "" &&
  Number(answers.priceBdt) > 0 &&
  Number(answers.weightKg) > 0 &&
  answers.destination.trim() !== "" &&
  answers.vehicle.trim() !== "" &&
  answers.driver.trim() !== "";

/**
 * Selling an animal, on Eid morning, on a phone, in a sheet beside the day's sales.
 *
 * The answers belong to the page rather than the sheet: once a sale is recorded the sheet closes, but the buyer and
 * the lorry stay typed — the next beast is usually his too — and the last buyer and lorry of the day are one button
 * away besides. At Eid several beasts go to one man in one morning, and asking for his name, his address, his lorry
 * and his driver five times is how a farm ends up with five spellings of one man.
 */
export const SaleSheet = ({
  open,
  onOpenChange,
  answers,
  onAnswers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answers: SaleAnswers;
  onAnswers: (answers: SaleAnswers) => void;
}) => {
  const { t, language } = useLanguage();
  const sellable = useQuery(orpc.sale.sellable.queryOptions());
  const edit = (patch: Partial<SaleAnswers>) =>
    onAnswers({ ...answers, ...patch });
  // What the chosen animal last weighed, beside the box for what she weighs today: a figure to check the scale
  // against, never typed in for it — the price is struck on the day's weight.
  const chosen = sellable.data?.find(
    (row) => row.tagNumber === answers.tagNumber
  );
  const lastWeighed =
    chosen && chosen.latestKg !== null
      ? t("sale.lastWeighed", { kg: formatNumber(chosen.latestKg, language) })
      : undefined;

  const record = useMutation(
    orpc.sale.record.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("sale.done", { tag: tagNumber }));
        // The buyer and the lorry stay typed: the next beast is usually his too.
        onAnswers({ ...answers, tagNumber: "", weightKg: "", priceBdt: "" });
        onOpenChange(false);
      },
      onError: (error) => {
        const fitOn = fitOnFrom(error);
        toast.error(
          fitOn
            ? t("ready.underWithdrawal", {
                when: formatDate(new Date(fitOn), language, "date"),
              })
            : (error.message ?? t("common.error"))
        );
      },
    })
  );

  return (
    <FormSheet
      description={t("sale.sheetDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          tagNumber: answers.tagNumber,
          buyer: {
            name: answers.buyerName,
            address: answers.buyerAddress || undefined,
            phone: answers.buyerPhone || undefined,
          },
          priceBdt: Number(answers.priceBdt),
          weightKg: Number(answers.weightKg),
          destination: answers.destination,
          vehicle: answers.vehicle,
          driver: answers.driver,
          note: answers.note || undefined,
          paymentMethod: answers.paymentMethod,
        })
      }
      open={open}
      pending={record.isPending}
      ready={isReady(answers)}
      submitLabel={t("sale.record")}
      title={t("sale.title")}
    >
      <AnimalPart answers={answers} onEdit={edit} />

      <SheetPart
        action={<LastBuyerOfTheDay onUse={edit} />}
        title={t("sale.groupBuyer")}
      >
        <TextField
          id="sale-buyer"
          label={t("sale.buyerName")}
          maxLength={120}
          onChange={(buyerName) => edit({ buyerName })}
          required
          value={answers.buyerName}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sale-address"
            label={t("sale.buyerAddress")}
            maxLength={200}
            onChange={(buyerAddress) => edit({ buyerAddress })}
            value={answers.buyerAddress}
          />
          <TextField
            id="sale-phone"
            inputMode="tel"
            label={t("sale.buyerPhone")}
            maxLength={20}
            onChange={(buyerPhone) => edit({ buyerPhone })}
            value={answers.buyerPhone}
          />
        </div>
      </SheetPart>

      <SheetPart title={t("sale.groupPrice")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sale-price"
            inputMode="numeric"
            label={t("sale.price")}
            onChange={(priceBdt) => edit({ priceBdt })}
            required
            type="number"
            value={answers.priceBdt}
          />
          <TextField
            hint={lastWeighed}
            id="sale-weight"
            inputMode="decimal"
            label={t("sale.weight")}
            onChange={(weightKg) => edit({ weightKg })}
            required
            step="0.1"
            type="number"
            value={answers.weightKg}
          />
        </div>
        <PerKg answers={answers} />
        <PaymentMethodField
          id="sale-paid-by"
          onChange={(paymentMethod) => edit({ paymentMethod })}
          value={answers.paymentMethod}
        />
      </SheetPart>

      <SheetPart title={t("sale.groupTransport")}>
        <TextField
          id="sale-destination"
          label={t("sale.destination")}
          maxLength={200}
          onChange={(destination) => edit({ destination })}
          required
          value={answers.destination}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="sale-vehicle"
            label={t("sale.vehicle")}
            maxLength={60}
            onChange={(vehicle) => edit({ vehicle })}
            required
            value={answers.vehicle}
          />
          <TextField
            id="sale-driver"
            label={t("sale.driver")}
            maxLength={120}
            onChange={(driver) => edit({ driver })}
            required
            value={answers.driver}
          />
        </div>
        <TextField
          hint={t("sale.noteWhy")}
          id="sale-note"
          label={t("sale.note")}
          maxLength={300}
          onChange={(note) => edit({ note })}
          value={answers.note}
        />
      </SheetPart>
    </FormSheet>
  );
};
