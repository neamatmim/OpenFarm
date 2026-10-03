import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Hand = Awaited<ReturnType<typeof orpc.cash.inHand.call>>[number];
type Movement = Awaited<ReturnType<typeof orpc.cash.movements.call>>[number];

/** The bank, as the "to" of a Handover is chosen, where the farm has listed none of its accounts. */
const BANK = "bank";
/** One of the Farm's own accounts, as the "to" of a Handover is chosen: the prefix, then its id. */
const ACCOUNT = "account:";

/** The Handover's "to", from what was chosen: a Farm Account, the bank unnamed, or a hand. */
const endChosen = (
  to: string
): { farmAccountId: string } | { bank: true } | { userId: string } => {
  if (to.startsWith(ACCOUNT)) {
    return { farmAccountId: to.slice(ACCOUNT.length) };
  }
  return to === BANK ? { bank: true } : { userId: to };
};

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
  // The Farm's own accounts a deposit may go into, by name — the bank itself where none is listed yet.
  const accounts = useQuery(orpc.farmAccounts.list.queryOptions());
  const intoAccounts = (accounts.data ?? []).filter((one) => !one.retired);
  const toAnAccount = to.startsWith(ACCOUNT);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [tripId, setTripId] = useState("");
  const toTheBank = to === BANK || toAnAccount;
  // The Farm's own outings a float may go on: none a Venture's Buying Float paid for.
  const trips = useQuery(orpc.buyingTrips.list.queryOptions());
  const farmsTrips = (trips.data ?? []).filter((one) => one.float === null);
  const handOver = useMutation(
    orpc.cash.handOver.mutationOptions({
      onSuccess: () => {
        toast.success(t("cash.handedOver"));
        setAmount("");
        setReference("");
        setNote("");
        setTripId("");
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
          to: endChosen(to),
          amountMoney: Number(amount),
          ...(slipSaid ? { reference: reference.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(tripId && !toTheBank ? { buyingTripId: tripId } : {}),
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
          {intoAccounts.length === 0 ? (
            <option value={BANK}>{t("cash.bank")}</option>
          ) : (
            intoAccounts.map((one) => (
              <option key={one.id} value={`${ACCOUNT}${one.id}`}>
                {one.name} · {one.number.slice(-4)}
              </option>
            ))
          )}
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
      {toTheBank || farmsTrips.length === 0 ? null : (
        <FormField
          hint={t("cash.forTripHint")}
          id="hand-trip"
          label={t("cash.forTrip")}
        >
          <NativeSelect
            id="hand-trip"
            onChange={(event) => setTripId(event.target.value)}
            value={tripId}
          >
            <option value="">{t("cash.noTrip")}</option>
            {farmsTrips.map((one) => (
              <option key={one.id} value={one.id}>
                {one.wentTo}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
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

type HeldSale = Hand["ventures"][number];

/** One Venture's sale cash in a hand: its Sales, ticked to go, and what they come to. */
const ventureShares = (held: readonly HeldSale[]) => {
  const byVenture = new Map<string, { name: string; sales: HeldSale[] }>();
  for (const one of held) {
    const share = byVenture.get(one.ventureId) ?? {
      name: one.ventureName,
      sales: [],
    };
    share.sales.push(one);
    byVenture.set(one.ventureId, share);
  }
  return [...byVenture].map(([ventureId, share]) => ({ ventureId, ...share }));
};

/**
 * A Venture's sale cash banked into its Venture Account from the hand that took it: the Sales it carries, ticked, the
 * slip and the day. The amount is theirs to the taka, so it is shown, not typed.
 */
const DepositDialog = ({
  from,
  ventureId,
  ventureName,
  sales,
  open,
  onOpenChange,
}: {
  from: Hand;
  ventureId: string;
  ventureName: string;
  sales: readonly HeldSale[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const onError = useRefused();
  const [ticked, setTicked] = useState<readonly string[]>(() =>
    sales.map((one) => one.saleId)
  );
  const [reference, setReference] = useState("");
  const [day, setDay] = useState("");
  const going = sales.filter((one) => ticked.includes(one.saleId));
  const totalMoney = going.reduce((sum, one) => sum + one.amount, 0);
  const deposit = useMutation(
    orpc.cash.handOver.mutationOptions({
      onSuccess: () => {
        toast.success(t("cash.deposited"));
        setReference("");
        setDay("");
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("cash.depositHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        deposit.mutate({
          from: { userId: from.userId },
          to: { ventureId, saleIds: going.map((one) => one.saleId) },
          amountMoney: totalMoney,
          reference: reference.trim(),
          ...(day ? { handedAt: new Date(`${day}T06:00:00.000Z`) } : {}),
        })
      }
      open={open}
      pending={deposit.isPending}
      ready={going.length > 0 && reference.trim() !== ""}
      submitLabel={t("cash.deposit")}
      title={t("cash.depositTitle", { venture: ventureName })}
    >
      <fieldset className="flex flex-col gap-2">
        {sales.map((one) => (
          <label className="flex items-center gap-2 text-sm" key={one.saleId}>
            <input
              checked={ticked.includes(one.saleId)}
              onChange={(event) =>
                setTicked((was) =>
                  event.target.checked
                    ? [...was, one.saleId]
                    : was.filter((saleId) => saleId !== one.saleId)
                )
              }
              type="checkbox"
            />
            <span className="font-mono">{one.tagNumber}</span>
            <span className="tabular-nums">{asMoney(one.amount)}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-sm font-medium">
        {t("cash.depositTotal", { amount: asMoney(totalMoney) })}
      </p>
      <FormField id="deposit-slip" label={t("cash.slip")}>
        <Input
          id="deposit-slip"
          maxLength={80}
          onChange={(event) => setReference(event.target.value)}
          required
          value={reference}
        />
      </FormField>
      <FormField id="deposit-day" label={t("cash.depositDay")}>
        <Input
          id="deposit-day"
          onChange={(event) => setDay(event.target.value)}
          type="date"
          value={day}
        />
      </FormField>
    </FormDialog>
  );
};

/** One Venture's sale cash in a hand, and its way to the bank. */
const VentureShare = ({
  hand,
  share,
  mayDeposit,
}: {
  hand: Hand;
  share: ReturnType<typeof ventureShares>[number];
  mayDeposit: boolean;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const [depositing, setDepositing] = useState(false);
  const amount = share.sales.reduce((sum, one) => sum + one.amount, 0);
  return (
    <div className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
      <span>
        {t("cash.heldForVenture", {
          amount: asMoney(amount),
          venture: share.name,
          tags: share.sales.map((one) => one.tagNumber).join(", "),
        })}
      </span>
      {mayDeposit ? (
        <>
          <Button
            onClick={() => setDepositing(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Banknote aria-hidden data-icon="inline-start" />
            {t("cash.deposit")}
          </Button>
          <DepositDialog
            from={hand}
            onOpenChange={setDepositing}
            open={depositing}
            sales={share.sales}
            ventureId={share.ventureId}
            ventureName={share.name}
          />
        </>
      ) : null}
    </div>
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
  const leaving = one.amount < 0;
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
  const asMoney = useMoney();
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
              one.amount < 0 ? "text-muted-foreground" : "font-medium"
            )}
          >
            {one.amount < 0 ? `− ${asMoney(-one.amount)}` : asMoney(one.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** When the hand was last counted, what was found, and how far that was from what the farm said it held. Nothing for a
 *  hand never counted — or on an answer kept from before counts were made. */
const LastCount = ({ hand }: { hand: Hand }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const last = hand.lastCount ?? null;
  if (!last) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("cash.neverCounted")}
      </span>
    );
  }
  const short = last.expected - last.counted;
  const cameShort = short > 0;
  const said = t("cash.lastCount", {
    day: formatDate(new Date(last.at), language, "date"),
    counted: asMoney(last.counted),
    expected: asMoney(last.expected),
  });
  if (short === 0) {
    return <span className="text-muted-foreground text-xs">{said}</span>;
  }
  return (
    <span className="text-xs">
      <span className="text-muted-foreground">{said} · </span>
      <span
        className={
          cameShort ? "text-warning font-medium" : "text-muted-foreground"
        }
      >
        {cameShort
          ? t("cash.countShort", { amount: asMoney(short) })
          : t("cash.countOver", { amount: asMoney(-short) })}
      </span>
    </span>
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
  const asMoney = useMoney();
  const [open, setOpen] = useState(false);
  const [handing, setHanding] = useState(false);
  const overdrawn = hand.amount < 0;
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
            {overdrawn ? `− ${asMoney(-hand.amount)}` : asMoney(hand.amount)}
          </span>
          <LastCount hand={hand} />
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
      {/* A Venture's sale cash in this hand, until it is deposited — missing from an answer cached before it was said. */}
      {ventureShares(hand.ventures ?? []).map((share) => (
        <VentureShare
          hand={hand}
          key={share.ventureId}
          mayDeposit={mayHandOver}
          share={share}
        />
      ))}
      {open ? <Movements hand={hand} /> : null}
      {mayHandOver ? (
        <HandOverDialog from={hand} onOpenChange={setHanding} open={handing} />
      ) : null}
    </li>
  );
};

type Float = Awaited<ReturnType<typeof orpc.cash.tripFloats.call>>[number];

/** The Owner counts a float home: the cash brought back, which must make the float balance to the taka. */
const CountHomeDialog = ({
  float,
  open,
  onOpenChange,
}: {
  float: Float;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const due = float.handedMoney - float.boughtMoney - float.backMoney;
  const [back, setBack] = useState(String(Math.max(0, due)));
  const countHome = useMutation(
    orpc.cash.countFloatHome.mutationOptions({
      onSuccess: () => {
        toast.success(t("cash.countedHome"));
        onOpenChange(false);
      },
      onError,
    })
  );
  const typed = Number(back);
  const saysAnAmount = back.trim() !== "" && !(typed < 0);
  return (
    <FormDialog
      description={t("cash.countHomeHint", { name: float.carrierName ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        countHome.mutate({ tripId: float.tripId, cashBackMoney: typed })
      }
      open={open}
      pending={countHome.isPending}
      ready={saysAnAmount}
      submitLabel={t("cash.countHome")}
      title={t("cash.countHomeTitle", { trip: float.wentTo })}
    >
      <FormField id="float-back" label={t("cash.cashBack")}>
        <Input
          id="float-back"
          inputMode="numeric"
          min={0}
          onChange={(event) => setBack(event.target.value)}
          type="number"
          value={back}
        />
      </FormField>
    </FormDialog>
  );
};

/** One float still out: where it went, who carried it, what went out, what it bought, and what is to come back. */
const FloatLine = ({ float, isOwner }: { float: Float; isOwner: boolean }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const [counting, setCounting] = useState(false);
  const due = float.handedMoney - float.boughtMoney - float.backMoney;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">
          {float.wentTo} ·{" "}
          {formatDate(new Date(float.wentOn), language, "date")}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("cash.floatLine", {
            name: float.carrierName ?? "",
            handed: asMoney(float.handedMoney),
            bought: asMoney(float.boughtMoney),
            due: asMoney(due),
          })}
        </span>
      </span>
      {isOwner ? (
        <>
          <Button
            onClick={() => setCounting(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("cash.countHome")}
          </Button>
          <CountHomeDialog
            float={float}
            onOpenChange={setCounting}
            open={counting}
          />
        </>
      ) : null}
    </li>
  );
};

/** The Buying Floats the Farm handed out for its own outings and has not yet counted home. Nothing while none is out. */
const FloatsOut = ({ isOwner }: { isOwner: boolean }) => {
  const { t } = useLanguage();
  const floats = useQuery(orpc.cash.tripFloats.queryOptions());
  if (!floats.data?.length) {
    return null;
  }
  return (
    <section className="surface flex flex-col p-4 md:p-5">
      <h3 className="text-base font-semibold tracking-tight">
        {t("cash.floatsOut")}
      </h3>
      <ul className="divide-y">
        {floats.data.map((float) => (
          <FloatLine float={float} isOwner={isOwner} key={float.tripId} />
        ))}
      </ul>
    </section>
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
    <div className="flex flex-col gap-6">
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
      <FloatsOut isOwner={isOwner} />
    </div>
  );
};
