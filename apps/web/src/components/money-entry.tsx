import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import {
  currencySign,
  formatDate,
  formatDigits,
  formatNumber,
} from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { categoryName } from "@/components/money";
import { SideField } from "@/components/money/side-field";
import type { SideChoice } from "@/components/money/side-field";
import { WageDrawsNote } from "@/components/money/wage-draws";
import {
  ConfirmDialog,
  FormField,
  FormSheet,
  NativeSelect,
  WorkedOut,
} from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { PhotoField } from "@/components/photo-field";
import { WhoseHandField } from "@/components/whose-hand";
import { useLanguage } from "@/i18n/language-provider";
import { amount, note, voiding } from "@/lib/correcting";
import { useMoney } from "@/lib/money";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** Takes a receipt photo, shrunk on the phone before it goes. */
const ReceiptField = ({
  id,
  onChange,
}: {
  id: string;
  onChange: (receipt: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  const [chosen, setChosen] = useState(false);
  return (
    <FormField id={id} label={t("byHand.receipt")}>
      <PhotoField
        chosen={chosen}
        id={id}
        onPhoto={(photo) => {
          setChosen(photo !== null);
          onChange(photo);
        }}
        takeLabel="byHand.receiptTake"
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
  const entered = Number(typedAmount);
  if (!(entered > 0)) {
    return null;
  }
  return (
    <WorkedOut>
      {t(direction === "in" ? "byHand.in" : "byHand.out")} · {currencySign()}
      {formatNumber(entered, language)}
    </WorkedOut>
  );
};

/** The years a wage may be written for: this one and the two before, newest first. */
const WAGE_YEARS = 3;

/**
 * The month a wage pays for, as a month and a year chosen from lists. A browser's own month field draws dashes where a
 * month should be and speaks no Bangla; the Manager picks the month by its name instead. Stored as YYYY-MM.
 */
const WageMonth = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const { t, language } = useLanguage();
  const thisYear = Number(farmDayOf(new Date()).slice(0, 4));
  const [chosenYear = "", month = ""] = value.split("-");
  // The year is kept while no month is chosen yet, so picking the year first is not undone by picking the month.
  const [year, setYear] = useState(chosenYear || String(thisYear));
  const years = Array.from(
    { length: WAGE_YEARS },
    (_, back) => thisYear - back
  );
  const monthName = new Intl.DateTimeFormat(
    language === "bn" ? "bn-BD" : "en-GB",
    { month: "long", timeZone: "UTC" }
  );
  const pick = (nextYear: string, nextMonth: string) =>
    onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}` : "");
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">
        {t("byHand.wageMonth")}
      </legend>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <NativeSelect
          aria-label={t("byHand.wageMonthName")}
          onChange={(event) => pick(year, event.target.value)}
          required
          value={month}
        >
          <option value="">{t("byHand.pickMonth")}</option>
          {Array.from({ length: 12 }, (_, index) => {
            const number = String(index + 1).padStart(2, "0");
            return (
              <option key={number} value={number}>
                {monthName.format(new Date(Date.UTC(2000, index, 1)))}
              </option>
            );
          })}
        </NativeSelect>
        <NativeSelect
          aria-label={t("byHand.wageYear")}
          onChange={(event) => {
            setYear(event.target.value);
            pick(event.target.value, month);
          }}
          value={year}
        >
          {years.map((one) => (
            <option key={one} value={String(one)}>
              {formatDigits(one, language)}
            </option>
          ))}
        </NativeSelect>
      </div>
    </fieldset>
  );
};

/** What the sheet may open with already filled: the Category, who, and a wage's month. */
export type EnterMoneyStart = Partial<
  Pick<typeof NOTHING_TYPED, "categoryId" | "counterparty" | "wageMonth">
>;

/** The entry the farm says this one looks like a second of, as it said it. */
interface LooksLike {
  name: string | null;
  amountMoney: number;
  day: string;
  categoryBn: string | null;
  categoryEn: string | null;
  recordedByName: string | null;
}

/** What the farm refused with, when it was that this looks entered already; nothing for any other refusal. */
const looksLike = (error: unknown): LooksLike | null => {
  const data = (
    error as { data?: { refusal?: unknown; match?: LooksLike } } | null
  )?.data;
  return data?.refusal === "looks_entered_already" && data.match
    ? data.match
    : null;
};

/**
 * Money that looks entered already, asked about before it is kept: the earlier entry, who wrote it, and whether this
 * really is a second — which the Owner hears of, when anybody else saves it again.
 */
const LooksEnteredDialog = ({
  twin,
  pending,
  onOpenChange,
  onSaveAgain,
}: {
  twin: LooksLike | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAgain: () => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const me = useQuery(orpc.people.me.queryOptions());
  const theOwnerIsTold = !(me.data?.roles.includes("owner") ?? false);
  const category =
    language === "en"
      ? (twin?.categoryEn ?? twin?.categoryBn)
      : twin?.categoryBn;
  return (
    <ConfirmDialog
      confirmLabel={t("byHand.saveAgain")}
      description={
        twin ? (
          <>
            {t("byHand.looksEnteredSaid", {
              by: twin.recordedByName ?? t("byHand.somebody"),
              amount: asMoney(twin.amountMoney),
              name: twin.name ?? "",
              day: formatDate(new Date(twin.day), language, "date"),
              category: category ?? "",
            })}{" "}
            {theOwnerIsTold
              ? t("byHand.looksEnteredTold")
              : t("byHand.looksEnteredAsk")}
          </>
        ) : null
      }
      onConfirm={onSaveAgain}
      onOpenChange={onOpenChange}
      open={twin !== null}
      pending={pending}
      title={t("byHand.looksEntered")}
    />
  );
};

/**
 * Money no record catches, entered by hand by the Manager in a sheet beside the register: how much, the day, the
 * Category, who with, how it was paid, a note, and a photo of the receipt. A wage names the month it pays for. What is
 * typed stays when the sheet is closed without entering it; a receipt photo is taken again.
 *
 * Opened from something that says what is missing — a Monthly Cost not entered, a wage — it starts with that filled.
 */
export const EnterMoneySheet = ({
  open,
  onOpenChange,
  startWith,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startWith?: EnterMoneyStart;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const categories = useQuery(orpc.money.categories.list.queryOptions());
  const [typed, setTyped] = useState(() => ({
    ...NOTHING_TYPED,
    ...startWith,
  }));
  const [occurredOn, setOccurredOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const [receipt, setReceipt] = useState<Photo | null>(null);
  const [side, setSide] = useState<SideChoice>("");
  // Whose hand the cash is in, where the Owner writes up somebody else's: hers where nothing is chosen.
  const [heldBy, setHeldBy] = useState("");
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
  const [twin, setTwin] = useState<LooksLike | null>(null);
  const enter = useMutation(
    orpc.money.enter.mutationOptions({
      onSuccess: () => {
        // The next entry is another one: its Side, how it was paid, the account and its transaction ID and its day are
        // its own to say, never the last one's carried over — only the Category is kept, for a run of the same kind.
        setTyped({ ...NOTHING_TYPED, categoryId: typed.categoryId });
        setOccurredOn(farmDayOf(new Date()));
        setPaymentMethod("cash");
        setAccount(NO_ACCOUNT);
        setSide("");
        setHeldBy("");
        setTwin(null);
        toast.success(t("byHand.entered"));
        handleOpenChange(false);
      },
      onError: (error) => {
        const earlier = looksLike(error);
        if (earlier) {
          setTwin(earlier);
          return;
        }
        onError(error);
      },
    })
  );
  const entry = (sameAgain: boolean) =>
    chosen
      ? {
          categoryId: chosen.id,
          amountMoney: Number(typed.amount),
          occurredOn,
          counterparty: { name: typed.counterparty.trim() },
          paymentMethod,
          ...accountSent(paymentMethod, account),
          ...(paymentMethod === "cash" && heldBy ? { heldBy } : {}),
          note: typed.note.trim() || undefined,
          wageMonth: isWage ? typed.wageMonth : undefined,
          side: side || undefined,
          receipt: receipt ?? undefined,
          ...(sameAgain ? { sameAgain } : {}),
        }
      : null;
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
        const sending = entry(false);
        if (sending) {
          enter.mutate(sending);
        }
      }}
      open={open}
      pending={enter.isPending}
      ready={complete}
      submitLabel={t("byHand.save")}
      title={t("byHand.title")}
      wide
    >
      {chosen ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
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

          <div className="grid gap-4 sm:grid-cols-3">
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
              <WageMonth onChange={set("wageMonth")} value={typed.wageMonth} />
            ) : null}
            <SideField id="entry-side" onChange={setSide} value={side} />
          </div>
          {isWage ? (
            <WageDrawsNote
              name={typed.counterparty}
              wageMoney={Number(typed.amount)}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <PaymentMethodField
              account={{ typed: account, onChange: setAccount }}
              id="entry-paid-by"
              onChange={setPaymentMethod}
              row
              value={paymentMethod}
            />
          </div>
          {paymentMethod === "cash" ? (
            <WhoseHandField
              id="entry-whose-hand"
              onChange={setHeldBy}
              value={heldBy}
            />
          ) : null}

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
      {categories.data ? null : <Skeleton className="h-64 rounded-xl" />}
      <LooksEnteredDialog
        onOpenChange={(opening) => {
          if (!opening) {
            setTwin(null);
          }
        }}
        onSaveAgain={() => {
          const sending = entry(true);
          if (sending) {
            enter.mutate(sending);
          }
        }}
        pending={enter.isPending}
        twin={twin}
      />
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
            <DialogTitle>{t("byHand.receipt")}</DialogTitle>
          </DialogHeader>
          {receipt.data ? (
            <img
              alt={t("byHand.receipt")}
              className="max-h-[70vh] w-full rounded-lg object-contain"
              src={`data:${receipt.data.contentType};base64,${receipt.data.data}`}
            />
          ) : (
            <Skeleton className="h-72 rounded-xl" />
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
  entered: { id: string; amountMoney: number; note: string | null };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    voided: voiding(),
    amountMoney: amount(entered.amountMoney),
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
      }}
      ready={correcting.changed || receipt !== null}
      title={t("byHand.correct")}
      trigger={t("byHand.correct")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("byHand.amount")}
        onChange={(value) => correcting.set("amountMoney", value)}
        type="number"
        value={correcting.typed.amountMoney ?? ""}
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
      <CorrectionChoice
        label={t("correct.voidWhy")}
        onChange={(value) => correcting.set("voided", value)}
        options={[{ value: "void", label: t("correct.voidIt") }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.voided ?? ""}
      />
    </CorrectionDialog>
  );
};
