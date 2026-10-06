import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS, farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { SideField } from "@/components/money/side-field";
import type { SideChoice } from "@/components/money/side-field";
import { EmptyState } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  FarmAccountField,
  NO_ACCOUNT,
  PAYMENT_METHOD_WORD,
  PaymentMethodField,
} from "@/components/payment-method";
import { WhoseHandField } from "@/components/whose-hand";
import { useLanguage } from "@/i18n/language-provider";
import type { Answers } from "@/lib/correcting";
import {
  choice,
  counterparty,
  day as farmDayAnswer,
  figure,
  note as noteAnswer,
} from "@/lib/correcting";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
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
  const [account, setAccount] = useState<AccountTyped>(NO_ACCOUNT);
  const [note, setNote] = useState("");
  // Whose hand it came out of, where the Owner writes up somebody else's draw: hers where nothing is chosen.
  const [heldBy, setHeldBy] = useState("");
  // The Side the person works on, as their wage will say it: a draw is part of the wage.
  const [side, setSide] = useState<SideChoice>("");
  const drawWage = useMutation(
    orpc.money.drawWage.mutationOptions({
      onSuccess: () => {
        toast.success(t("wageDraw.recorded"));
        setName("");
        setAmount("");
        setNote("");
        setHeldBy("");
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
          amountMoney: Number(amount),
          drawnOn: day,
          paymentMethod,
          ...accountSent(paymentMethod, account),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(paymentMethod === "cash" && heldBy ? { heldBy } : {}),
          ...(side ? { side } : {}),
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
      <SideField id="draw-side" onChange={setSide} value={side} />
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
        account={{ typed: account, onChange: setAccount }}
        id="draw-paid-by"
        onChange={setPaymentMethod}
        value={paymentMethod}
      />
      {paymentMethod === "cash" ? (
        <WhoseHandField
          id="draw-whose-hand"
          onChange={setHeldBy}
          value={heldBy}
        />
      ) : null}
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
 * A Wage Draw put right: how much, who drew it, the day, how it was paid — with the Farm Account and its transaction ID
 * where it was by mobile money or the bank — and the note, where the screen knows it. Put to nothing, a draw that never
 * happened is taken back; what a payday has taken off it stays taken.
 */
export const DrawCorrection = ({
  draw,
}: {
  draw: {
    id: string;
    amountMoney: number;
    name: string;
    drawnAt: Date | string;
    paymentMethod: PaymentMethod;
    /** The Farm Account and transaction ID it named, where the screen holds them; nothing for cash. */
    farmAccountId?: string | null;
    reference?: string | null;
    /** Left out where the screen does not hold the draw's own note: the money register does not. */
    note?: string | null;
  };
}) => {
  const { t } = useLanguage();
  // The account and its transaction ID it names: what a farm listing its accounts asks of money not paid in cash.
  const namedNow: AccountTyped = {
    farmAccountId: draw.farmAccountId ?? "",
    reference: draw.reference ?? "",
  };
  const [account, setAccount] = useState<AccountTyped>(namedNow);
  const answers: Answers = {
    // Nothing is a real answer: it takes the draw back.
    amountMoney: figure(draw.amountMoney),
    counterparty: counterparty(draw.name),
    drawnOn: farmDayAnswer(draw.drawnAt),
    paymentMethod: choice(draw.paymentMethod),
    ...(draw.note === undefined ? {} : { note: noteAnswer(draw.note) }),
  };
  const correcting = useCorrecting(answers);
  const correct = useMutation(orpc.money.correctDraw.mutationOptions({}));
  const paidBy = (correcting.typed.paymentMethod ||
    draw.paymentMethod) as PaymentMethod;
  const reference = account.reference.trim();
  // Named afresh: another account, or another transaction ID, on money not paid in cash.
  const accountChanged =
    paidBy !== "cash" &&
    account.farmAccountId !== "" &&
    reference !== "" &&
    (account.farmAccountId !== namedNow.farmAccountId ||
      reference !== namedNow.reference);
  return (
    <CorrectionDialog
      description={t("wageDraw.correctHint")}
      onOpen={() => {
        correcting.handleOpen();
        setAccount(namedNow);
      }}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: draw.id,
          changes: {
            ...correcting.changes(),
            ...(accountChanged
              ? {
                  farmAccount: {
                    from: {
                      farmAccountId: draw.farmAccountId ?? null,
                      reference: draw.reference ?? null,
                    },
                    to: { farmAccountId: account.farmAccountId, reference },
                  },
                }
              : {}),
          },
          reason,
        });
      }}
      ready={correcting.changed || accountChanged}
      title={t("wageDraw.correct")}
      trigger={t("wageDraw.correct")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("cash.amount")}
        onChange={(value) => correcting.set("amountMoney", value)}
        type="number"
        value={correcting.typed.amountMoney ?? ""}
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
      {paidBy === "cash" ? null : (
        <>
          <FarmAccountField
            id={`draw-account-${draw.id}`}
            kind={paidBy === "mobile_money" ? "mobile_money" : "bank"}
            onChange={(farmAccountId) =>
              setAccount({ ...account, farmAccountId })
            }
            value={account.farmAccountId}
          />
          <CorrectionAnswer
            label={t("money.reference")}
            onChange={(typed) => setAccount({ ...account, reference: typed })}
            value={account.reference}
          />
        </>
      )}
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

type Person = Awaited<ReturnType<typeof orpc.money.openDraws.call>>[number];

interface PersonCell {
  row: { original: Person };
}

/** The day of a person's oldest draw still owed: the one their next wage takes off first. */
const oldestOf = (person: Person) => {
  // By the clock: a draw's day comes as a Date, which a plain sort would order by its words ("Fri Oct 02" first).
  const times = person.draws.map((one) => new Date(one.drawnAt).getTime());
  return times.length === 0 ? undefined : Math.min(...times);
};

const PersonNameCell = ({ row }: PersonCell) => (
  <span className="font-medium">{row.original.name}</span>
);
const DrawCountCell = ({ row }: PersonCell) => {
  const { language } = useLanguage();
  return <span>{formatNumber(row.original.draws.length, language)}</span>;
};
const OldestCell = ({ row }: PersonCell) => {
  const { language } = useLanguage();
  const oldest = oldestOf(row.original);
  return oldest === undefined ? null : (
    <span>{formatDate(new Date(oldest), language, "date")}</span>
  );
};
const OwedCell = ({ row }: PersonCell) => {
  const asMoney = useMoney();
  return <span className="font-medium">{asMoney(row.original.openMoney)}</span>;
};

const personColumn = createListColumns<Person>();
const personColumns = personColumn.columns([
  personColumn.accessor("name", {
    header: listHeader("byHand.wagePerson"),
    cell: PersonNameCell,
  }),
  personColumn.accessor(oldestOf, {
    id: "oldest",
    header: listHeader("wageDraw.col.oldest"),
    cell: OldestCell,
  }),
  personColumn.accessor((person) => person.draws.length, {
    id: "draws",
    header: listHeader("wageDraw.col.draws"),
    cell: DrawCountCell,
    meta: { align: "end" },
  }),
  personColumn.accessor("openMoney", {
    header: listHeader("wageDraw.col.owed"),
    cell: OwedCell,
    meta: { align: "end" },
  }),
]);

/** One person's draws still owed, each to put right: on a phone under their name, on a desk under their row. */
const PersonDraws = ({ person }: { person: Person }) => {
  const { language } = useLanguage();
  const asMoney = useMoney();
  return (
    <ul className="flex flex-col gap-1">
      {person.draws.map((one) => (
        <li
          className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
          key={one.id}
        >
          <span>
            {`${formatDate(new Date(one.drawnAt), language, "date")} · ${asMoney(one.openMoney)}`}
            {one.note ? ` · ${one.note}` : ""}
          </span>
          <DrawCorrection draw={{ ...one, name: person.name }} />
        </li>
      ))}
    </ul>
  );
};

/** On a desk, a person a row — who, their oldest draw, how many, and what they still owe — each opening to the draws
 *  themselves (Polaris's index table, Carbon's expandable rows). */
const DrawsTable = ({ people }: { people: Person[] }) => {
  const table = useListTable({
    columns: personColumns,
    data: people,
    getRowId: (person) => person.counterpartyId,
  });
  return (
    <DataTable
      renderDetail={(person) => <PersonDraws person={person} />}
      table={table}
    />
  );
};

/**
 * Each person's Wage Draws still owed, the most owed first, and the button to write another down. Payday takes them off
 * the month's wage; this is where the Manager sees who has drawn ahead.
 */
export const WageDrawsTab = () => {
  const { t } = useLanguage();
  const asMoney = useMoney();
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
          <ul className="divide-y md:hidden">
            {people.map((person) => (
              <li
                className="flex flex-col gap-1 py-3"
                key={person.counterpartyId}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{person.name}</span>
                  <span className="font-semibold tabular-nums">
                    {asMoney(person.openMoney)}
                  </span>
                </span>
                <PersonDraws person={person} />
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <DrawsTable people={people} />
          </div>
        </section>
      )}
      <DrawDialog onOpenChange={setDrawing} open={drawing} />
    </div>
  );
};

/** A name as the farm finds a person by it: one Unicode form, whatever the capitals — a name typed on another keyboard
 *  is the same person, whose draws the farm will take off. */
const asTheFarmReads = (said: string) =>
  said.normalize("NFC").trim().toLowerCase();

/**
 * On a wage being entered: what the person has drawn ahead and still owes, how much of it this wage takes off, and so
 * what is paid now — and what carries over, where the draws come to more than the wage. Nothing for a person owing none.
 */
export const WageDrawsNote = ({
  name,
  wageMoney,
}: {
  name: string;
  wageMoney: number;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const open = useQuery(orpc.money.openDraws.queryOptions());
  const person = (open.data ?? []).find(
    (one) => asTheFarmReads(one.name) === asTheFarmReads(name)
  );
  if (!person) {
    return null;
  }
  const taken = Math.min(person.openMoney, Math.max(0, wageMoney));
  const carried = person.openMoney - taken;
  const carriesOver = carried > 0;
  return (
    <p className="bg-muted rounded-md px-3 py-2 text-sm tabular-nums">
      {t("wageDraw.atPayday", {
        owed: asMoney(person.openMoney),
        taken: asMoney(taken),
        paid: asMoney(Math.max(0, wageMoney - taken)),
      })}
      {carriesOver
        ? ` ${t("wageDraw.carried", { amount: asMoney(carried) })}`
        : ""}
    </p>
  );
};
