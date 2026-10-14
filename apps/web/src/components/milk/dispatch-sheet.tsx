import type { PaymentMethod } from "@OpenFarm/domain";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { useState } from "react";

import {
  ChoiceCard,
  FormField,
  FormSheet,
  WorkedOut,
} from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { ReceivableFields, BuyerOwes } from "@/components/receivable-fields";
import { useLanguage } from "@/i18n/language-provider";
import { dispatchMoneySent, dispatchProblem } from "@/lib/dispatch-validation";
import type { BuyerTyping } from "@/lib/milk-buyer-terms";
import { afterNaming, mayFollow, NOBODY_PICKED } from "@/lib/milk-buyer-terms";
import { somethingPaid } from "@/lib/receivable";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import { worthOf } from "./milk-types";

const NOTHING_TYPED = {
  dispatchedAt: "",
  liters: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  deliveryNote: "",
  price: "",
  fat: "",
  snf: "",
  note: "",
};

type Typed = typeof NOTHING_TYPED;

/** The sheet as it opens: nothing typed, nothing said of the money, nobody's terms in the boxes. */
const SHEET_OPENS: BuyerTyping<Typed> = {
  ...NOBODY_PICKED,
  form: NOTHING_TYPED,
};

/** Words typed into a box, or nothing when the box was left empty. */
const written = (value: string): string | undefined =>
  value.trim() || undefined;

/** A figure typed into a box, or nothing when the box was left empty. */
const typed = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/** One box of the Dispatch, labeled, holding what was typed into it. */
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
  const liters = Number(form.liters);
  const price = Number(form.price);
  if (!(liters > 0 && price > 0)) {
    return null;
  }
  return (
    <WorkedOut>
      {t("dispatch.worth", {
        liters,
        price,
        amount: worthOf(liters, price),
      })}
    </WorkedOut>
  );
};

/**
 * Milk handed over at the gate, in a sheet beside the page: how much and at what price first, then the buyer as the
 * Safe Food Act wants them written, the delivery note and how it was paid, and what the collector measured. What is typed
 * stays when the sheet is closed without recording, so a buyer's phone looked up is not typed twice. A buyer the farm
 * has handed milk to before is offered as his name is typed, and once named whole his last price, address and phone, and
 * whether he takes his milk on credit, go into the boxes still free — a collection center that pays on its round is then
 * on credit, not booked as paid. Named otherwise, his terms go back out.
 */
export const DispatchSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  // What is typed, what is said of the money, and whose terms are in the boxes: one state, so naming a buyer changes
  // all three together.
  const [typing, setTyping] = useState(SHEET_OPENS);
  const { form, receivable, filledFrom, priceToFollow } = typing;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const buyers = useQuery({
    ...orpc.milk.buyers.queryOptions(),
    enabled: open,
  });
  const known = buyers.data;
  // A name typed before the farm's buyers had answered, or still typed from the last time the sheet was open, is
  // asked again once they do: the answer seen last is kept, and a new one names the buyer as it is drawn.
  const [buyersSeen, setBuyersSeen] = useState(known);
  if (known !== buyersSeen) {
    setBuyersSeen(known);
    if (known) {
      setTyping((current) =>
        afterNaming(current, current.form.buyerName, known)
      );
    }
  }
  const record = useMutation(
    orpc.milk.dispatch.mutationOptions({
      onSuccess: () => {
        setTyping(SHEET_OPENS);
        toast.success(t("dispatch.recorded"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const handleType = (name: keyof Typed, value: string) =>
    setTyping((current) =>
      name === "buyerName"
        ? afterNaming(current, value, known ?? [])
        : { ...current, form: { ...current.form, [name]: value } }
    );
  const worthMoney = worthOf(Number(form.liters), Number(form.price));
  const problem = dispatchProblem(form, receivable, worthMoney, priceToFollow);
  const box = { draft: form, onType: handleType };

  return (
    <FormSheet
      wide
      description={t("dispatch.sheetDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          // Left empty, the milk is leaving now.
          dispatchedAt: form.dispatchedAt
            ? new Date(form.dispatchedAt)
            : new Date(),
          liters: Number(form.liters),
          buyer: {
            name: form.buyerName,
            address: written(form.buyerAddress),
            phone: written(form.buyerPhone),
          },
          deliveryNote: written(form.deliveryNote),
          fatPercent: typed(form.fat),
          snfPercent: typed(form.snf),
          note: written(form.note),
          paymentMethod,
          ...(priceToFollow ? {} : accountSent(paymentMethod, account)),
          ...dispatchMoneySent({
            price: form.price,
            priceToFollow,
            receivable,
          }),
        })
      }
      open={open}
      pending={record.isPending}
      ready={problem === null}
      missing={problem ? { at: problem.at, said: t(problem.message) } : null}
      submitLabel={t("dispatch.save")}
      title={t("dispatch.recordAction")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput
          {...box}
          {...FIGURE}
          label={t("dispatch.litersField")}
          min={0.01}
          name="liters"
          required
        />
        {priceToFollow ? null : (
          <DispatchInput
            {...box}
            {...FIGURE}
            label={t("dispatch.price")}
            min={0.01}
            name="price"
            required
          />
        )}
      </div>
      {mayFollow(filledFrom) ? (
        <ChoiceCard htmlFor="dispatch-price-to-follow">
          <Checkbox
            checked={priceToFollow}
            id="dispatch-price-to-follow"
            onCheckedChange={(checked) =>
              setTyping((current) => ({
                ...current,
                priceToFollow: checked === true,
              }))
            }
          />
          <span className="flex flex-col gap-0.5">
            {t("dispatch.priceToFollow")}
            <span className="text-muted-foreground text-xs">
              {t("dispatch.priceToFollowHint")}
            </span>
          </span>
        </ChoiceCard>
      ) : null}
      {priceToFollow ? null : <Worth form={form} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <DispatchInput
            {...box}
            autoComplete="off"
            label={t("dispatch.buyer")}
            list="dispatch-buyers"
            name="buyerName"
            required
          />
          <datalist id="dispatch-buyers">
            {(buyers.data ?? []).map((one) => (
              <option key={one.name} value={one.name}>
                {one.name}
              </option>
            ))}
          </datalist>
          {filledFrom ? (
            <WorkedOut>
              {t(
                filledFrom.paysLater === true
                  ? "dispatch.filledFromOnCredit"
                  : "dispatch.filledFrom",
                { name: filledFrom.name }
              )}
            </WorkedOut>
          ) : null}
        </div>
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
      <BuyerOwes name={form.buyerName} />

      {priceToFollow ? null : (
        <ReceivableFields
          idPrefix="dispatch-receivable"
          onType={(patch) =>
            setTyping((current) => ({
              ...current,
              receivable: { ...current.receivable, ...patch },
            }))
          }
          promiseRequired={false}
          typed={receivable}
          worthMoney={worthMoney}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DispatchInput
          {...box}
          label={t("dispatch.deliveryNote")}
          name="deliveryNote"
        />
        {!priceToFollow && somethingPaid(receivable) ? (
          <PaymentMethodField
            account={{ typed: account, onChange: setAccount }}
            id="dispatch-paid-by"
            onChange={setPaymentMethod}
            value={paymentMethod}
          />
        ) : null}
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
