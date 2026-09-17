import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionDialog,
  CorrectionAnswer,
  useCorrecting,
} from "@/components/correction-dialog";
import { categoryName, useRefusalToast } from "@/components/money";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
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
    <FormField id={id} label={t("byHand.side")}>
      <NativeSelect
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
      </NativeSelect>
    </FormField>
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
    <FormField id={id} label={t("byHand.receipt")}>
      <Input
        accept="image/*"
        capture="environment"
        className="cursor-pointer"
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
    </FormField>
  );
};

const NOTHING_TYPED = {
  categoryId: "",
  amount: "",
  counterparty: "",
  wageMonth: "",
  note: "",
};

/** The entry as it will read in the register, worked out as it is typed: which way, and the taka grouped. */
const EntrySummary = ({
  direction,
  typedAmount,
}: {
  direction: "in" | "out";
  typedAmount: string;
}) => {
  const { t, language } = useLanguage();
  const taka = Number(typedAmount);
  if (!(taka > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {t(direction === "in" ? "byHand.in" : "byHand.out")} · ৳
      {formatNumber(taka, language)}
    </p>
  );
};

/**
 * Money no record catches, entered by hand by the Manager in a sheet beside the register: how much, the day, the
 * Category, who with, how it was paid, a note, and a photo of the receipt. A wage names the month it pays for. What is
 * typed stays when the sheet is closed without entering it; a receipt photo is taken again.
 */
export const EnterMoneySheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
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
  const handleOpenChange = (opening: boolean) => {
    if (!opening) {
      // The file box is drawn afresh next time, so the photo it held goes with it.
      setReceipt(null);
    }
    onOpenChange(opening);
  };
  const enter = useMutation(
    orpc.money.enter.mutationOptions({
      onSuccess: async () => {
        setTyped({ ...NOTHING_TYPED, categoryId: typed.categoryId });
        toast.success(t("byHand.entered"));
        handleOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
      },
      onError,
    })
  );
  const set = (key: keyof typeof NOTHING_TYPED) => (value: string) =>
    setTyped((current) => ({ ...current, [key]: value }));
  const complete =
    chosen !== undefined &&
    Number(typed.amount) > 0 &&
    typed.counterparty.trim() !== "" &&
    (!isWage || typed.wageMonth !== "");

  return (
    <FormSheet
      description={t("byHand.hint")}
      onOpenChange={handleOpenChange}
      onSubmit={() => {
        if (!chosen) {
          return;
        }
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
      open={open}
      pending={enter.isPending}
      ready={complete}
      submitLabel={t("byHand.save")}
      title={t("byHand.title")}
    >
      {chosen ? (
        <>
          <FormField id="entry-category" label={t("byHand.category")}>
            <NativeSelect
              id="entry-category"
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
            </NativeSelect>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="entry-amount" label={t("byHand.amount")}>
              <Input
                id="entry-amount"
                inputMode="numeric"
                min={0}
                onChange={(event) => set("amount")(event.target.value)}
                required
                type="number"
                value={typed.amount}
              />
            </FormField>
            <FormField id="entry-on" label={t("byHand.on")}>
              <Input
                id="entry-on"
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                type="date"
                value={occurredOn}
              />
            </FormField>
          </div>
          <EntrySummary
            direction={chosen.direction === "in" ? "in" : "out"}
            typedAmount={typed.amount}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              className={isWage ? undefined : "sm:col-span-2"}
              id="entry-who"
              label={t(isWage ? "byHand.wagePerson" : "byHand.counterparty")}
            >
              <Input
                autoComplete="off"
                id="entry-who"
                onChange={(event) => set("counterparty")(event.target.value)}
                required
                value={typed.counterparty}
              />
            </FormField>
            {isWage ? (
              <FormField id="entry-month" label={t("byHand.wageMonth")}>
                <Input
                  id="entry-month"
                  onChange={(event) => set("wageMonth")(event.target.value)}
                  required
                  type="month"
                  value={typed.wageMonth}
                />
              </FormField>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PaymentMethodField
              id="entry-paid-by"
              onChange={setPaymentMethod}
              value={paymentMethod}
            />
            <SideField id="entry-side" onChange={setSide} value={side} />
          </div>

          <FormField id="entry-note" label={t("byHand.note")}>
            <Input
              id="entry-note"
              maxLength={300}
              onChange={(event) => set("note")(event.target.value)}
              value={typed.note}
            />
          </FormField>
          <ReceiptField id="entry-receipt" onChange={setReceipt} />
        </>
      ) : null}
      {categories.data ? null : <Skeleton className="h-64 rounded-lg" />}
    </FormSheet>
  );
};

/** Shows the photo of a Money Event's receipt over the page, fetched only when somebody asks to see it. */
export const ReceiptLink = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const receipt = useQuery({
    ...orpc.money.receipt.queryOptions({ input: { id } }),
    enabled: open,
  });
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ReceiptText aria-hidden data-icon="inline-start" />
        {t("byHand.showReceipt")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-xl" closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {t("byHand.receipt")}
            </DialogTitle>
          </DialogHeader>
          {receipt.data ? (
            <img
              alt={t("byHand.receipt")}
              className="max-h-[70vh] w-full rounded-lg object-contain"
              src={`data:${receipt.data.contentType};base64,${receipt.data.data}`}
            />
          ) : (
            <Skeleton className="h-72 rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </>
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
