import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type Hand = Awaited<ReturnType<typeof orpc.cash.inHand.call>>[number];
type Movement = Awaited<ReturnType<typeof orpc.cash.movements.call>>[number];

/** The bank, as the "to" of a Handover is chosen. */
const BANK = "bank";

/** Cash passed from one hand to another person's, or into the bank with its slip. */
const HandOverDialog = ({
  from,
  open,
  onOpenChange,
}: {
  from: Hand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  // Whom it may go to: every hand holding the farm's cash, by name — a Manager hands their takings to the Owner.
  const holders = useQuery(orpc.cash.holders.queryOptions());
  const others = (holders.data ?? []).filter(
    (one) => one.userId !== from.userId
  );
  const [chosen, setChosen] = useState("");
  const to = chosen || (others[0]?.userId ?? BANK);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const toTheBank = to === BANK;
  const handOver = useMutation(
    orpc.cash.handOver.mutationOptions({
      onSuccess: () => {
        toast.success(t("cash.handedOver"));
        setAmount("");
        setReference("");
        setNote("");
        onOpenChange(false);
      },
      onError,
    })
  );
  const slipSaid = reference.trim() !== "";
  return (
    <FormDialog
      description={t("cash.handOverHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        handOver.mutate({
          from: { userId: from.userId },
          to: toTheBank ? { bank: true } : { userId: to },
          amountBdt: Number(amount),
          ...(slipSaid ? { reference: reference.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
      open={open}
      pending={handOver.isPending}
      ready={Number(amount) > 0 && (!toTheBank || slipSaid)}
      submitLabel={t("cash.handOver")}
      title={t("cash.handOverTitle", { name: from.name })}
    >
      <FormField id="hand-to" label={t("cash.to")}>
        <NativeSelect
          id="hand-to"
          onChange={(event) => setChosen(event.target.value)}
          value={to}
        >
          {others.map((one) => (
            <option key={one.userId} value={one.userId}>
              {one.name}
            </option>
          ))}
          <option value={BANK}>{t("cash.bank")}</option>
        </NativeSelect>
      </FormField>
      <FormField id="hand-amount" label={t("cash.amount")}>
        <Input
          id="hand-amount"
          inputMode="numeric"
          min={0}
          onChange={(event) => setAmount(event.target.value)}
          required
          type="number"
          value={amount}
        />
      </FormField>
      {toTheBank ? (
        <FormField id="hand-slip" label={t("cash.slip")}>
          <Input
            id="hand-slip"
            maxLength={80}
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          />
        </FormField>
      ) : null}
      <FormField id="hand-note" label={t("cash.note")}>
        <Input
          id="hand-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/** What one movement was, in the reader's words: the money's Category, or where a Handover went or came from. */
const MovementWhat = ({ one }: { one: Movement }) => {
  const { t, language } = useLanguage();
  if (one.kind === "money") {
    return language === "en" && one.categoryEn
      ? one.categoryEn
      : (one.categoryBn ?? "");
  }
  const leaving = one.bdt < 0;
  if (one.bank) {
    return t(leaving ? "cash.toBank" : "cash.fromBank");
  }
  return t(leaving ? "cash.handedTo" : "cash.handedFrom", {
    name: one.otherName ?? "",
  });
};

/** What moved cash into or out of one hand, newest first: the money that named it, and every Handover. */
const Movements = ({ hand }: { hand: Hand }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const moved = useQuery(
    orpc.cash.movements.queryOptions({ input: { userId: hand.userId } })
  );
  if (!moved.data) {
    return null;
  }
  if (moved.data.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-sm">
        {t("cash.none")}
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {moved.data.map((one) => (
        <li
          className="flex items-baseline justify-between gap-3 py-2 text-sm"
          key={one.id}
        >
          <span className="flex min-w-0 flex-col">
            <MovementWhat one={one} />
            <span className="text-muted-foreground text-xs">
              {formatDate(new Date(one.at), language, "date")}
              {one.note ? ` · ${one.note}` : ""}
            </span>
          </span>
          <span
            className={cn(
              "whitespace-nowrap tabular-nums",
              one.bdt < 0 ? "text-muted-foreground" : "font-medium"
            )}
          >
            {one.bdt < 0 ? `− ${taka(-one.bdt)}` : taka(one.bdt)}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** One hand: what it holds, its Handover, and what moved through it once opened. */
const HandLine = ({
  hand,
  mayHandOver,
}: {
  hand: Hand;
  mayHandOver: boolean;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const [open, setOpen] = useState(false);
  const [handing, setHanding] = useState(false);
  const overdrawn = hand.bdt < 0;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-col text-left"
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          <span className="font-medium">{hand.name}</span>
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              overdrawn && "text-danger"
            )}
          >
            {overdrawn ? `− ${taka(-hand.bdt)}` : taka(hand.bdt)}
          </span>
        </button>
        {mayHandOver ? (
          <Button
            onClick={() => setHanding(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <HandCoins aria-hidden data-icon="inline-start" />
            {t("cash.handOver")}
          </Button>
        ) : null}
      </div>
      {open ? <Movements hand={hand} /> : null}
      {mayHandOver ? (
        <HandOverDialog from={hand} onOpenChange={setHanding} open={handing} />
      ) : null}
    </li>
  );
};

/**
 * Who holds the farm's cash: each Owner and Manager and what is in their hand, from the cash money that named it and
 * the Handovers that moved it on. The Owner sees and moves every hand; a Manager sees and hands over their own.
 */
export const CashTab = ({
  isOwner,
  myId,
}: {
  isOwner: boolean;
  myId: string | undefined;
}) => {
  const { t } = useLanguage();
  const hands = useQuery(orpc.cash.inHand.queryOptions());
  if (!hands.data) {
    return null;
  }
  if (hands.data.length === 0) {
    return <EmptyState icon={Banknote} title={t("cash.nobody")} />;
  }
  return (
    <section className="surface flex flex-col p-4 md:p-5">
      <p className="text-muted-foreground pb-2 text-xs">{t("cash.hint")}</p>
      <ul className="divide-y">
        {hands.data.map((hand) => (
          <HandLine
            hand={hand}
            key={hand.userId}
            mayHandOver={isOwner || hand.userId === myId}
          />
        ))}
      </ul>
    </section>
  );
};
