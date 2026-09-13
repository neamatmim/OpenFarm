import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { categoryName } from "@/components/money";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import type { Photo } from "@/lib/photo";
import { shrink } from "@/lib/photo";
import { orpc } from "@/utils/orpc";

const NOTHING_TYPED = {
  categoryId: "",
  amount: "",
  counterparty: "",
  wageMonth: "",
  note: "",
};

/** The error a refused write shows, in the reader's words where the farm has them. */
const useRefusalToast = () => {
  const { t } = useLanguage();
  return (error: Error) =>
    toast.error(
      wordedRefusal(error, t) ?? (error.message || t("common.error"))
    );
};

/**
 * Money no record catches, entered by hand by the Manager: how much, the day, the Category, who with,
 * how it was paid, a note, and a photo of the receipt. A wage names the month it pays for.
 */
export const EnterMoney = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const onError = useRefusalToast();
  const categories = useQuery(orpc.money.categories.queryOptions());
  const [typed, setTyped] = useState(NOTHING_TYPED);
  const [occurredOn, setOccurredOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receipt, setReceipt] = useState<Photo | null>(null);
  const usable = (categories.data ?? []).filter(
    (one) => !(one.retiredAt || one.keptByRecords)
  );
  const chosen = usable.find(
    (one) => one.id === (typed.categoryId || usable[0]?.id)
  );
  const isWage = chosen?.key === "wages";
  const enter = useMutation(
    orpc.money.enter.mutationOptions({
      onSuccess: async () => {
        setTyped({ ...NOTHING_TYPED, categoryId: typed.categoryId });
        setReceipt(null);
        toast.success(t("entry.entered"));
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
      },
      onError,
    })
  );
  if (!chosen) {
    return null;
  }
  const set = (key: keyof typeof NOTHING_TYPED) => (value: string) =>
    setTyped((current) => ({ ...current, [key]: value }));
  const complete =
    Number(typed.amount) > 0 &&
    typed.counterparty.trim() !== "" &&
    (!isWage || typed.wageMonth !== "");

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("entry.title")}</h2>
      <form
        className="space-y-2 rounded-lg border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          enter.mutate({
            categoryId: chosen.id,
            amountBdt: Number(typed.amount),
            occurredOn,
            counterparty: { name: typed.counterparty.trim() },
            paymentMethod,
            note: typed.note.trim() || undefined,
            wageMonth: isWage ? typed.wageMonth : undefined,
            receipt: receipt ?? undefined,
          });
        }}
      >
        <select
          aria-label={t("entry.category")}
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          onChange={(event) => set("categoryId")(event.target.value)}
          value={chosen.id}
        >
          {usable.map((one) => (
            <option key={one.id} value={one.id}>
              {categoryName(
                { categoryBn: one.nameBn, categoryEn: one.nameEn },
                language
              )}{" "}
              ({t(one.direction === "in" ? "entry.in" : "entry.out")})
            </option>
          ))}
        </select>
        <div className="space-y-1">
          <Label htmlFor="entry-amount">{t("entry.amount")}</Label>
          <Input
            id="entry-amount"
            min={0}
            onChange={(event) => set("amount")(event.target.value)}
            type="number"
            value={typed.amount}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="entry-on">{t("entry.on")}</Label>
          <Input
            id="entry-on"
            onChange={(event) => setOccurredOn(event.target.value)}
            type="date"
            value={occurredOn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="entry-who">
            {t(isWage ? "entry.worker" : "entry.counterparty")}
          </Label>
          <Input
            id="entry-who"
            onChange={(event) => set("counterparty")(event.target.value)}
            value={typed.counterparty}
          />
        </div>
        {isWage ? (
          <div className="space-y-1">
            <Label htmlFor="entry-month">{t("entry.wageMonth")}</Label>
            <Input
              id="entry-month"
              onChange={(event) => set("wageMonth")(event.target.value)}
              type="month"
              value={typed.wageMonth}
            />
          </div>
        ) : null}
        <PaymentMethodField
          id="entry-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
        <div className="space-y-1">
          <Label htmlFor="entry-note">{t("entry.note")}</Label>
          <Input
            id="entry-note"
            maxLength={300}
            onChange={(event) => set("note")(event.target.value)}
            value={typed.note}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="entry-receipt">{t("entry.receipt")}</Label>
          <input
            accept="image/*"
            capture="environment"
            className="text-sm"
            id="entry-receipt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              try {
                setReceipt(file ? await shrink(file) : null);
              } catch {
                toast.error(t("common.error"));
              }
            }}
            type="file"
          />
        </div>
        <Button
          disabled={!complete || enter.isPending}
          type="submit"
          variant="outline"
        >
          {t("entry.save")}
        </Button>
      </form>
    </section>
  );
};

/** The farm's Categories: the standard ones, the farm's own, and the retired — kept by the Owner and the
 *  Manager. */
export const Categories = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const onError = useRefusalToast();
  const categories = useQuery(orpc.money.categories.queryOptions());
  const [nameBn, setNameBn] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.money.key() });
  const add = useMutation(
    orpc.money.addCategory.mutationOptions({
      onSuccess: async () => {
        setNameBn("");
        await refresh();
      },
      onError,
    })
  );
  const retire = useMutation(
    orpc.money.retireCategory.mutationOptions({ onSuccess: refresh, onError })
  );

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("entry.categories")}</h2>
      <ul className="space-y-1 text-sm">
        {(categories.data ?? []).map((one) => (
          <li
            className="flex items-center justify-between gap-2 rounded-lg border p-2"
            key={one.id}
          >
            <span
              className={
                one.retiredAt ? "text-muted-foreground line-through" : ""
              }
            >
              {categoryName(
                { categoryBn: one.nameBn, categoryEn: one.nameEn },
                language
              )}{" "}
              ({t(one.direction === "in" ? "entry.in" : "entry.out")})
            </span>
            {one.retiredAt || one.keptByRecords ? null : (
              <Button
                disabled={retire.isPending}
                onClick={() => retire.mutate({ id: one.id })}
                size="sm"
                variant="outline"
              >
                {t("entry.retire")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (nameBn.trim()) {
            add.mutate({ nameBn: nameBn.trim(), direction });
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="category-name">{t("entry.newCategory")}</Label>
          <Input
            id="category-name"
            onChange={(event) => setNameBn(event.target.value)}
            value={nameBn}
          />
        </div>
        <select
          aria-label={t("entry.direction")}
          className="bg-background h-9 rounded-md border px-2 text-sm"
          onChange={(event) =>
            setDirection(event.target.value === "in" ? "in" : "out")
          }
          value={direction}
        >
          <option value="out">{t("entry.out")}</option>
          <option value="in">{t("entry.in")}</option>
        </select>
        <Button disabled={add.isPending} type="submit" variant="outline">
          {t("entry.addCategory")}
        </Button>
      </form>
    </section>
  );
};

/** Shows the photo of a Money Event's receipt, fetched only when somebody asks to see it. */
export const ReceiptLink = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const receipt = useQuery({
    ...orpc.money.receipt.queryOptions({ input: { id } }),
    enabled: open,
  });
  return (
    <span>
      <button
        className="underline"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        {t("entry.showReceipt")}
      </button>
      {open && receipt.data ? (
        <img
          alt={t("entry.receipt")}
          className="mt-2 max-h-96 rounded-lg"
          src={`data:${receipt.data.contentType};base64,${receipt.data.data}`}
        />
      ) : null}
    </span>
  );
};
