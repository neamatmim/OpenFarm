import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins } from "lucide-react";
import { useState } from "react";

import { TakeItBack } from "@/components/animal/take-it-back";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Section,
  TableSkeleton,
  TagChip,
} from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
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

/** Cash passed from one hand to another person's, or into the bank with its slip. A record of money, in a sheet as
 *  every money record is. */
const HandOverSheet = ({
  from,
  open,
  onOpenChange,
}: {
  from: Hand;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  // Whom it may go to: every hand holding the farm's cash, by name — a Manager hands their takings to the Owner.
  const holders = useQuery(orpc.cash.holders.queryOptions());
  const others = (holders.data ?? []).filter(
    (one) => one.userId !== from.userId
  );
  const [chosen, setChosen] = useState("");
  // The Farm's own accounts a deposit may go into, by name — and the bank itself while no bank account of the farm's is
  // open, since the farm asks one named once any is.
  const accounts = useQuery(orpc.farmAccounts.list.queryOptions());
  const intoAccounts = (accounts.data ?? []).filter((one) => !one.retired);
  const plainBank = !intoAccounts.some((one) => one.kind === "bank");
  // What the list draws, in its order: what is sent is always one of these, and the first unless another is chosen.
  const drawn = [
    ...others.map((one) => one.userId),
    ...(plainBank ? [BANK] : []),
    ...intoAccounts.map((one) => `${ACCOUNT}${one.id}`),
  ];
  const to = drawn.includes(chosen) ? chosen : (drawn[0] ?? BANK);
  const toAnAccount = to.startsWith(ACCOUNT);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [tripId, setTripId] = useState("");
  const toTheBank = to === BANK || toAnAccount;
  // The Farm's own outings a float may go on: none a Venture's Buying Float paid for, and none counted home already.
  const trips = useQuery(orpc.buyingTrips.list.queryOptions());
  const farmsTrips = (trips.data ?? []).filter(
    (one) => one.float === null && !(one.countedHome ?? false)
  );
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
    <FormSheet
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
          {plainBank ? <option value={BANK}>{t("cash.bank")}</option> : null}
          {intoAccounts.map((one) => (
            <option key={one.id} value={`${ACCOUNT}${one.id}`}>
              {one.name} · {one.number.slice(-4)}
            </option>
          ))}
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
                {`${one.wentTo} · ${formatDate(new Date(one.wentOn), language, "date")}`}
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
    </FormSheet>
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
 * slip and the day. The amount is theirs to the taka, so it is shown, not typed. A record of money, in a sheet.
 */
const DepositSheet = ({
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
    <FormSheet
      description={t("cash.depositHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        deposit.mutate({
          from: { userId: from.userId },
          to: { ventureId, saleIds: going.map((one) => one.saleId) },
          amountMoney: totalMoney,
          reference: reference.trim(),
          // Today is now, as the farm writes it; an earlier day is that farm day's start — never a clock hour that is
          // still to come this morning.
          ...(day && day !== farmDayOf(new Date())
            ? { handedAt: startOfFarmDay(day) }
            : {}),
        })
      }
      open={open}
      pending={deposit.isPending}
      ready={going.length > 0 && reference.trim() !== ""}
      submitLabel={t("cash.deposit")}
      title={t("cash.depositTitle", { venture: ventureName })}
    >
      <fieldset className="flex flex-col">
        {sales.map((one) => (
          <Label
            className="flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-8"
            key={one.saleId}
          >
            <Checkbox
              checked={ticked.includes(one.saleId)}
              onCheckedChange={(on) =>
                setTicked((was) =>
                  on
                    ? [...was, one.saleId]
                    : was.filter((saleId) => saleId !== one.saleId)
                )
              }
            />
            <TagChip>{one.tagNumber}</TagChip>
            <span className="tabular-nums">{asMoney(one.amount)}</span>
          </Label>
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
    </FormSheet>
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
          <DepositSheet
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

/** A Handover written twice or to the wrong hand, voided by whoever wrote it in their window or by the Owner. */
const VoidHandover = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const correct = useMutation(orpc.cash.correctHandover.mutationOptions({}));
  return (
    <TakeItBack
      choice={t("cash.voidHandoverIt")}
      hint={t("cash.voidHandoverHint")}
      onSave={(reason) =>
        correct.mutateAsync({
          id,
          reason,
          changes: { voided: { from: false, to: true } },
        })
      }
      title={t("cash.voidHandover")}
    />
  );
};

/** The movements themselves, newest first, each with what it was, its day and note, and the money in or out. */
const MovementList = ({ movements }: { movements: Movement[] }) => {
  const { language } = useLanguage();
  const asMoney = useMoney();
  return (
    <ul className="divide-y">
      {movements.map((one) => (
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
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "whitespace-nowrap tabular-nums",
                one.amount < 0 ? "text-muted-foreground" : "font-medium"
              )}
            >
              {one.amount < 0
                ? `− ${asMoney(-one.amount)}`
                : asMoney(one.amount)}
            </span>
            {one.kind === "handover" ? <VoidHandover id={one.id} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** What moved cash into or out of one hand, newest first: the money that named it, and every Handover. "None" only
 *  once the farm has said so. */
const Movements = ({ hand }: { hand: Hand }) => {
  const { t } = useLanguage();
  const moved = useQuery(
    orpc.cash.movements.queryOptions({ input: { userId: hand.userId } })
  );
  const movements = moved.data ?? [];
  return (
    <Loaded query={moved}>
      {movements.length === 0 ? (
        <p className="text-muted-foreground px-1 py-2 text-sm">
          {t("cash.none")}
        </p>
      ) : (
        <MovementList movements={movements} />
      )}
    </Loaded>
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

/** A hand's Handover: the button, and the sheet it opens. */
const HandOverButton = ({ hand }: { hand: Hand }) => {
  const { t } = useLanguage();
  const [handing, setHanding] = useState(false);
  return (
    <>
      <Button
        onClick={() => setHanding(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <HandCoins aria-hidden data-icon="inline-start" />
        {t("cash.handOver")}
      </Button>
      <HandOverSheet from={hand} onOpenChange={setHanding} open={handing} />
    </>
  );
};

/** One hand as the desk's table reads it, with whether the reader may move its cash. */
interface HandRow {
  hand: Hand;
  mayHandOver: boolean;
}

/** One hand on a phone: what it holds, its Handover, and what moved through it once opened. */
const HandCard = ({ row }: { row: HandRow }) => {
  const asMoney = useMoney();
  const { hand, mayHandOver } = row;
  const [open, setOpen] = useState(false);
  const overdrawn = hand.amount < 0;
  return (
    <div className="flex flex-col gap-2">
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
        {mayHandOver ? <HandOverButton hand={hand} /> : null}
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
    </div>
  );
};

const handCard = (row: HandRow) => <HandCard row={row} />;

type Float = Awaited<ReturnType<typeof orpc.cash.tripFloats.call>>[number];

/**
 * The Owner counts a float home: the cash brought back, which must make the float balance to the taka. Counting a
 * float home is a piece of work of its own, in a sheet — as a Venture's Float is counted home on the Venture's page.
 */
const CountHomeSheet = ({
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
  // Filled in when it opens — mounted afresh each time, by its key — so a bull or a cost written up since the page was
  // drawn is in what is due.
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
    <FormSheet
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
    </FormSheet>
  );
};

/** A float's count home: the button, and the sheet it opens. */
const CountHomeButton = ({ float }: { float: Float }) => {
  const { t } = useLanguage();
  const [counting, setCounting] = useState(false);
  return (
    <>
      <Button
        onClick={() => setCounting(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("cash.countHome")}
      </Button>
      <CountHomeSheet
        float={float}
        key={counting ? "counting" : "shut"}
        onOpenChange={setCounting}
        open={counting}
      />
    </>
  );
};

interface FloatRow {
  float: Float;
  isOwner: boolean;
}

/** What a float still has to bring back: what went out, less what it bought and what is back already. */
const dueOf = (float: Float) =>
  float.handedMoney - float.boughtMoney - float.backMoney;

/** One float still out on a phone: where it went, who carried it, what went out, what it bought, and what is to come
 *  back. */
const FloatCard = ({ row }: { row: FloatRow }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const { float, isOwner } = row;
  return (
    <div className="flex items-center justify-between gap-3">
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
            due: asMoney(dueOf(float)),
          })}
        </span>
      </span>
      {isOwner ? <CountHomeButton float={float} /> : null}
    </div>
  );
};

const floatCard = (row: FloatRow) => <FloatCard row={row} />;

interface FloatCell {
  row: { original: FloatRow };
}

const FloatTripCell = ({ row }: FloatCell) => {
  const { language } = useLanguage();
  const { float } = row.original;
  return (
    <span className="flex flex-col">
      <span className="font-medium">{float.wentTo}</span>
      <span className="text-muted-foreground text-xs">
        {formatDate(new Date(float.wentOn), language, "date")}
      </span>
    </span>
  );
};
const FloatCarrierCell = ({ row }: FloatCell) =>
  row.original.float.carrierName ?? <Nothing />;
const FloatMoneyCell = ({ amount }: { amount: number }) => {
  const asMoney = useMoney();
  return <span>{asMoney(amount)}</span>;
};
const FloatHandedCell = ({ row }: FloatCell) => (
  <FloatMoneyCell amount={row.original.float.handedMoney} />
);
const FloatBoughtCell = ({ row }: FloatCell) => (
  <FloatMoneyCell amount={row.original.float.boughtMoney} />
);
const FloatDueCell = ({ row }: FloatCell) => (
  <span className="font-medium">
    <FloatMoneyCell amount={dueOf(row.original.float)} />
  </span>
);
const FloatCountCell = ({ row }: FloatCell) =>
  row.original.isOwner ? <CountHomeButton float={row.original.float} /> : null;

const floatColumn = createListColumns<FloatRow>();
const floatColumns = floatColumn.columns([
  floatColumn.accessor((row) => row.float.wentOn, {
    id: "trip",
    header: listHeader("intake.tripLivestockMarket"),
    cell: FloatTripCell,
  }),
  floatColumn.accessor((row) => row.float.carrierName ?? undefined, {
    id: "carrier",
    header: listHeader("cash.col.carrier"),
    cell: FloatCarrierCell,
  }),
  floatColumn.accessor((row) => row.float.handedMoney, {
    id: "handed",
    header: listHeader("cash.col.handed"),
    cell: FloatHandedCell,
    meta: { align: "end" },
  }),
  floatColumn.accessor((row) => row.float.boughtMoney, {
    id: "bought",
    header: listHeader("cash.col.bought"),
    cell: FloatBoughtCell,
    meta: { align: "end" },
  }),
  floatColumn.accessor((row) => dueOf(row.float), {
    id: "due",
    header: listHeader("cash.col.due"),
    cell: FloatDueCell,
    meta: { align: "end" },
  }),
  floatColumn.display({
    id: "count",
    header: ActionsHeader,
    cell: FloatCountCell,
    meta: { align: "end" },
  }),
]);

/** The floats out as a table on a desk, a card a float on a phone. */
const FloatsTable = ({ rows }: { rows: FloatRow[] }) => {
  const table = useListTable({
    columns: floatColumns,
    data: rows,
    getRowId: (row) => row.float.tripId,
  });
  return <DataTable card={floatCard} table={table} />;
};

/** The Buying Floats the Farm handed out for its own outings and has not yet counted home. Nothing while none is out —
 *  nor while the farm is asked, since a part that is there only when something is out has no place to hold. */
const FloatsOut = ({ isOwner }: { isOwner: boolean }) => {
  const { t } = useLanguage();
  const floats = useQuery(orpc.cash.tripFloats.queryOptions());
  if (!floats.data?.length) {
    return null;
  }
  return (
    <Section title={t("cash.floatsOut")}>
      <FloatsTable rows={floats.data.map((float) => ({ float, isOwner }))} />
    </Section>
  );
};

interface HandCell {
  row: { original: HandRow };
}

/** What a hand holds, red where it has paid out more than it took. */
const InHand = ({ amount }: { amount: number }) => {
  const asMoney = useMoney();
  const overdrawn = amount < 0;
  return (
    <span className={cn("font-medium", overdrawn && "text-danger")}>
      {overdrawn ? `− ${asMoney(-amount)}` : asMoney(amount)}
    </span>
  );
};

/** What of a hand's cash is a Venture's, from its Sales, until it is deposited. */
const ventureCashOf = (hand: Hand) =>
  (hand.ventures ?? []).reduce((sum, one) => sum + one.amount, 0);

const HandNameCell = ({ row }: HandCell) => (
  <span className="font-medium">{row.original.hand.name}</span>
);
const HandAmountCell = ({ row }: HandCell) => (
  <InHand amount={row.original.hand.amount} />
);
const HandCountCell = ({ row }: HandCell) => (
  <LastCount hand={row.original.hand} />
);
const HandVentureCell = ({ row }: HandCell) => {
  const asMoney = useMoney();
  const amount = ventureCashOf(row.original.hand);
  return amount > 0 ? <span>{asMoney(amount)}</span> : <Nothing />;
};
const HandOverCell = ({ row }: HandCell) =>
  row.original.mayHandOver ? <HandOverButton hand={row.original.hand} /> : null;

const handColumn = createListColumns<HandRow>();
const handColumns = handColumn.columns([
  handColumn.accessor((row) => row.hand.name, {
    id: "name",
    header: listHeader("cash.col.hand"),
    cell: HandNameCell,
  }),
  handColumn.accessor((row) => row.hand.lastCount?.at, {
    id: "counted",
    header: listHeader("cash.col.lastCount"),
    cell: HandCountCell,
  }),
  handColumn.accessor((row) => ventureCashOf(row.hand), {
    id: "ventures",
    header: listHeader("cash.col.ventures"),
    cell: HandVentureCell,
    meta: { align: "end" },
  }),
  handColumn.accessor((row) => row.hand.amount, {
    id: "amount",
    header: listHeader("cash.col.inHand"),
    cell: HandAmountCell,
    meta: { align: "end" },
  }),
  handColumn.display({
    id: "handOver",
    header: ActionsHeader,
    cell: HandOverCell,
    meta: { align: "end" },
  }),
]);

/** Under a hand's row: its Venture sale cash, each to deposit, and what moved through it. */
const HandDetail = ({ row }: { row: HandRow }) => (
  <div className="flex flex-col gap-3">
    {ventureShares(row.hand.ventures ?? []).map((share) => (
      <VentureShare
        hand={row.hand}
        key={share.ventureId}
        mayDeposit={row.mayHandOver}
        share={share}
      />
    ))}
    <Movements hand={row.hand} />
  </div>
);

/** On a desk, the hands as a table — who, last counted, what of it is a Venture's, and what is in hand — each opening
 *  to what moved through it (Polaris's index table, Carbon's expandable rows); on a phone, a card a hand. */
const HandsTable = ({ rows }: { rows: HandRow[] }) => {
  const table = useListTable({
    columns: handColumns,
    data: rows,
    getRowId: (row) => row.hand.userId,
  });
  return (
    <DataTable
      card={handCard}
      renderDetail={(row) => <HandDetail row={row} />}
      table={table}
    />
  );
};

/**
 * Who holds the farm's cash: each Owner and Manager and what is in their hand, from the cash money that named it and
 * the Handovers that moved it on. The Owner sees and moves every hand; a Manager sees and hands over their own.
 * "Nobody holds it" is said only once the farm has answered.
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
  const held = hands.data ?? [];
  return (
    <Loaded query={hands} skeleton={<TableSkeleton rows={3} />}>
      {held.length === 0 ? (
        <EmptyState icon={Banknote} title={t("cash.nobody")} />
      ) : (
        <div className="flex flex-col gap-6">
          <Section description={t("cash.hint")} title={t("cash.hands")}>
            <HandsTable
              rows={held.map((hand) => ({
                hand,
                mayHandOver: isOwner || hand.userId === myId,
              }))}
            />
          </Section>
          <FloatsOut isOwner={isOwner} />
        </div>
      )}
    </Loaded>
  );
};
