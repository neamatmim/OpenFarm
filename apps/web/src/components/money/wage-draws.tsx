import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS, farmDayOf } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { EmptyState } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import {
  PAYMENT_METHOD_WORD,
  PaymentMethodField,
} from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import type { Answers } from "@/lib/correcting";
import {
  choice,
  counterparty,
  day as farmDayAnswer,
  figure,
  note as noteAnswer,
} from "@/lib/correcting";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** Money a person takes ahead of payday, written down: who, how much, the day, and how it was paid. */
const DrawDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const drawWage = useMutation(
    orpc.money.drawWage.mutationOptions({
      onSuccess: () => {
        toast.success(t("wageDraw.recorded"));
        setName("");
        setAmount("");
        setNote("");
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("wageDraw.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        drawWage.mutate({
          counterparty: { name: name.trim() },
          amountBdt: Number(amount),
          drawnOn: day,
          paymentMethod,
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
      open={open}
      pending={drawWage.isPending}
      ready={name.trim() !== "" && Number(amount) > 0}
      submitLabel={t("wageDraw.record")}
      title={t("wageDraw.record")}
    >
      <FormField id="draw-who" label={t("byHand.wagePerson")}>
        <Input
          autoComplete="off"
          id="draw-who"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="draw-amount" label={t("cash.amount")}>
          <Input
            id="draw-amount"
            inputMode="numeric"
            min={0}
            onChange={(event) => setAmount(event.target.value)}
            required
            type="number"
            value={amount}
          />
        </FormField>
        <FormField id="draw-day" label={t("wageDraw.day")}>
          <Input
            id="draw-day"
            onChange={(event) => setDay(event.target.value)}
            required
            type="date"
            value={day}
          />
        </FormField>
      </div>
      <PaymentMethodField
        id="draw-paid-by"
        onChange={setPaymentMethod}
        value={paymentMethod}
      />
      <FormField id="draw-note" label={t("cash.note")}>
        <Input
          id="draw-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * A Wage Draw put right: how much, who drew it, the day, how it was paid — and the note, where the screen knows it. Put
 * to nothing, a draw that never happened is taken back; what a payday has taken off it stays taken.
 */
export const DrawCorrection = ({
  draw,
}: {
  draw: {
    id: string;
    amountBdt: number;
    name: string;
    drawnAt: Date | string;
    paymentMethod: PaymentMethod;
    /** Left out where the screen does not hold the draw's own note: the money register does not. */
    note?: string | null;
  };
}) => {
  const { t } = useLanguage();
  const answers: Answers = {
    // Nothing is a real answer: it takes the draw back.
    amountBdt: figure(draw.amountBdt),
    counterparty: counterparty(draw.name),
    drawnOn: farmDayAnswer(draw.drawnAt),
    paymentMethod: choice(draw.paymentMethod),
    ...(draw.note === undefined ? {} : { note: noteAnswer(draw.note) }),
  };
  const correcting = useCorrecting(answers);
  const correct = useMutation(orpc.money.correctDraw.mutationOptions({}));
  return (
    <CorrectionDialog
      description={t("wageDraw.correctHint")}
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: draw.id,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("wageDraw.correct")}
      trigger={t("wageDraw.correct")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("cash.amount")}
        onChange={(value) => correcting.set("amountBdt", value)}
        type="number"
        value={correcting.typed.amountBdt ?? ""}
      />
      <CorrectionAnswer
        label={t("byHand.wagePerson")}
        onChange={(value) => correcting.set("counterparty", value)}
        value={correcting.typed.counterparty ?? ""}
      />
      <CorrectionAnswer
        label={t("wageDraw.day")}
        onChange={(value) => correcting.set("drawnOn", value)}
        type="date"
        value={correcting.typed.drawnOn ?? ""}
      />
      <CorrectionChoice
        label={t("money.paidBy")}
        onChange={(value) => correcting.set("paymentMethod", value)}
        options={PAYMENT_METHODS.map((method) => ({
          value: method,
          label: t(PAYMENT_METHOD_WORD[method]),
        }))}
        value={correcting.typed.paymentMethod ?? draw.paymentMethod}
      />
      {draw.note === undefined ? null : (
        <CorrectionAnswer
          label={t("cash.note")}
          onChange={(value) => correcting.set("note", value)}
          value={correcting.typed.note ?? ""}
        />
      )}
    </CorrectionDialog>
  );
};

/**
 * Each person's Wage Draws still owed, the most owed first, and the button to write another down. Payday takes them off
 * the month's wage; this is where the Manager sees who has drawn ahead.
 */
export const WageDrawsTab = () => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const [drawing, setDrawing] = useState(false);
  const open = useQuery(orpc.money.openDraws.queryOptions());
  const people = open.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDrawing(true)} type="button">
          <Plus aria-hidden data-icon="inline-start" />
          {t("wageDraw.record")}
        </Button>
      </div>
      {people.length === 0 ? (
        <EmptyState icon={HandCoins} title={t("wageDraw.none")} />
      ) : (
        <section className="surface flex flex-col p-4 md:p-5">
          <p className="text-muted-foreground pb-2 text-xs">
            {t("wageDraw.listHint")}
          </p>
          <ul className="divide-y">
            {people.map((person) => (
              <li
                className="flex flex-col gap-1 py-3"
                key={person.counterpartyId}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{person.name}</span>
                  <span className="font-semibold tabular-nums">
                    {taka(person.openBdt)}
                  </span>
                </span>
                <ul className="flex flex-col gap-1">
                  {person.draws.map((one) => (
                    <li
                      className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
                      key={one.id}
                    >
                      <span>
                        {`${formatDate(new Date(one.drawnAt), language, "date")} · ${taka(one.openBdt)}`}
                        {one.note ? ` · ${one.note}` : ""}
                      </span>
                      <DrawCorrection draw={{ ...one, name: person.name }} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      <DrawDialog onOpenChange={setDrawing} open={drawing} />
    </div>
  );
};

/**
 * On a wage being entered: what the person has drawn ahead and still owes, how much of it this wage takes off, and so
 * what is paid now — and what carries over, where the draws come to more than the wage. Nothing for a person owing none.
 */
export const WageDrawsNote = ({
  name,
  wageBdt,
}: {
  name: string;
  wageBdt: number;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const open = useQuery(orpc.money.openDraws.queryOptions());
  const person = (open.data ?? []).find((one) => one.name === name.trim());
  if (!person) {
    return null;
  }
  const taken = Math.min(person.openBdt, Math.max(0, wageBdt));
  const carried = person.openBdt - taken;
  const carriesOver = carried > 0;
  return (
    <p className="bg-muted rounded-md px-3 py-2 text-sm tabular-nums">
      {t("wageDraw.atPayday", {
        owed: taka(person.openBdt),
        taken: taka(taken),
        paid: taka(Math.max(0, wageBdt - taken)),
      })}
      {carriesOver ? ` ${t("wageDraw.carried", { bdt: taka(carried) })}` : ""}
    </p>
  );
};
