import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionDialog,
  CorrectionAnswer,
  useCorrecting,
} from "@/components/correction-dialog";
import { categoryName, useRefusalToast } from "@/components/money";
import { Section } from "@/components/page";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { amount, note } from "@/lib/correcting";
import type { Photo } from "@/lib/photo";
import { shrink } from "@/lib/photo";
import { orpc } from "@/utils/orpc";

const SIDE_WORD = {
  "": "byHand.wholeFarm",
  dairy: "animals.side.dairy",
  fattening: "animals.side.fattening",
} as const satisfies Record<string, MessageKey>;

type SideChoice = keyof typeof SIDE_WORD;

/** Which Side money entered by hand belongs to, or the whole farm. */
const SideField = ({
  id,
  onChange,
  value,
}: {
  id: string;
  onChange: (side: SideChoice) => void;
  value: SideChoice;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("byHand.side")}</Label>
      <select
        className="bg-card h-9 w-full rounded-md border px-3 text-sm"
        id={id}
        onChange={(event) =>
          onChange(
            (Object.keys(SIDE_WORD) as SideChoice[]).find(
              (side) => side === event.target.value
            ) ?? ""
          )
        }
        value={value}
      >
        {(Object.keys(SIDE_WORD) as SideChoice[]).map((side) => (
          <option key={side} value={side}>
            {t(SIDE_WORD[side])}
          </option>
        ))}
      </select>
    </div>
  );
};

/** Takes a receipt photo, shrunk on the phone before it goes. */
const ReceiptField = ({
  id,
  onChange,
}: {
  id: string;
  onChange: (receipt: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("byHand.receipt")}</Label>
      <input
        accept="image/*"
        capture="environment"
        className="text-sm"
        id={id}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          try {
            onChange(file ? await shrink(file) : null);
          } catch {
            toast.error(t("common.error"));
          }
        }}
        type="file"
      />
    </div>
  );
};

const NOTHING_TYPED = {
  categoryId: "",
  amount: "",
  counterparty: "",
  wageMonth: "",
  note: "",
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
  const [side, setSide] = useState<SideChoice>("");
  const usable = (categories.data ?? []).filter(
    (one) => one.enterable && !one.retiredAt
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
        toast.success(t("byHand.entered"));
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
    <Section description={t("byHand.hint")} title={t("byHand.title")}>
      <form
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 [&>*]:min-w-0"
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
            side: side || undefined,
            receipt: receipt ?? undefined,
          });
        }}
      >
        <select
          aria-label={t("byHand.category")}
          className="bg-card h-10 w-full rounded-md border px-3 text-sm sm:col-span-2 xl:col-span-1"
          onChange={(event) => set("categoryId")(event.target.value)}
          value={chosen.id}
        >
          {usable.map((one) => (
            <option key={one.id} value={one.id}>
              {categoryName(
                { categoryBn: one.nameBn, categoryEn: one.nameEn },
                language
              )}{" "}
              ({t(one.direction === "in" ? "byHand.in" : "byHand.out")})
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-amount">{t("byHand.amount")}</Label>
          <Input
            id="entry-amount"
            min={0}
            onChange={(event) => set("amount")(event.target.value)}
            type="number"
            value={typed.amount}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-on">{t("byHand.on")}</Label>
          <Input
            id="entry-on"
            onChange={(event) => setOccurredOn(event.target.value)}
            type="date"
            value={occurredOn}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-who">
            {t(isWage ? "byHand.wagePerson" : "byHand.counterparty")}
          </Label>
          <Input
            id="entry-who"
            onChange={(event) => set("counterparty")(event.target.value)}
            value={typed.counterparty}
          />
        </div>
        {isWage ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-month">{t("byHand.wageMonth")}</Label>
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-note">{t("byHand.note")}</Label>
          <Input
            id="entry-note"
            maxLength={300}
            onChange={(event) => set("note")(event.target.value)}
            value={typed.note}
          />
        </div>
        <SideField id="entry-side" onChange={setSide} value={side} />
        <ReceiptField id="entry-receipt" onChange={setReceipt} />
        <Button
          className="h-10 sm:col-span-2 xl:col-span-1"
          disabled={!complete || enter.isPending}
          type="submit"
        >
          {t("byHand.save")}
        </Button>
      </form>
    </Section>
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
      <h2 className="text-lg font-semibold">{t("byHand.categories")}</h2>
      <ul className="space-y-1 text-sm">
        {(categories.data ?? []).map((one) => (
          <li
            className="bg-card flex items-center justify-between gap-2 rounded-lg border p-3"
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
              ({t(one.direction === "in" ? "byHand.in" : "byHand.out")})
            </span>
            {one.retiredAt || !one.retirable ? null : (
              <Button
                disabled={retire.isPending}
                onClick={() => retire.mutate({ id: one.id })}
                size="sm"
                variant="outline"
              >
                {t("byHand.retire")}
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
          <Label htmlFor="category-name">{t("byHand.newCategory")}</Label>
          <Input
            id="category-name"
            onChange={(event) => setNameBn(event.target.value)}
            value={nameBn}
          />
        </div>
        <select
          aria-label={t("byHand.direction")}
          className="bg-card border-input h-11 rounded-md border px-3 text-base md:h-9 md:text-sm"
          onChange={(event) =>
            setDirection(event.target.value === "in" ? "in" : "out")
          }
          value={direction}
        >
          <option value="out">{t("byHand.out")}</option>
          <option value="in">{t("byHand.in")}</option>
        </select>
        <Button disabled={add.isPending} type="submit" variant="outline">
          {t("byHand.addCategory")}
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
        {t("byHand.showReceipt")}
      </button>
      {open && receipt.data ? (
        <img
          alt={t("byHand.receipt")}
          className="mt-2 max-h-96 rounded-lg"
          src={`data:${receipt.data.contentType};base64,${receipt.data.data}`}
        />
      ) : null}
    </span>
  );
};

/**
 * Puts right money entered by hand: the amount, the note, a receipt that came later — with the reason, as
 * any Correction. What it went to or came from, and its Category, stay; entering it again says that.
 */
export const CorrectEntered = ({
  entered,
}: {
  entered: { id: string; amountBdt: number; note: string | null };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    amountBdt: amount(entered.amountBdt),
    note: note(entered.note),
  });
  // A receipt that came later changes no figure, and is a Correction all the same.
  const [receipt, setReceipt] = useState<Photo | null>(null);
  const correct = useMutation(orpc.money.correctEntered.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={() => {
        correcting.handleOpen();
        setReceipt(null);
      }}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: entered.id,
          changes: correcting.changes(),
          receipt: receipt ?? undefined,
          reason,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
      }}
      ready={correcting.changed || receipt !== null}
      title={t("byHand.correct")}
      trigger={t("byHand.correct")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("byHand.amount")}
        onChange={(value) => correcting.set("amountBdt", value)}
        type="number"
        value={correcting.typed.amountBdt ?? ""}
      />
      <CorrectionAnswer
        label={t("byHand.note")}
        onChange={(value) => correcting.set("note", value)}
        value={correcting.typed.note ?? ""}
      />
      <ReceiptField
        id={`correct-receipt-${entered.id}`}
        onChange={setReceipt}
      />
    </CorrectionDialog>
  );
};
