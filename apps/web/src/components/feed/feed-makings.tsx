import {
  SMALLEST_FEED_AMOUNT,
  farmDayOf,
  startOfFarmDay,
  feedUnitEach,
  feedUnitWord,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Blend, PackageOpen, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import {
  CorrectionAnswer,
  CorrectionChoice,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  EmptyState,
  Loaded,
  SegmentedControl,
  StatusBadge,
} from "@/components/page";
import {
  FormDialog,
  FormField,
  FormSheet,
  NativeSelect,
  WorkedOut,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { day, figure, voiding } from "@/lib/correcting";
import { useMoney } from "@/lib/money";
import { namesIn } from "@/lib/names-in";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import { OtherName, TwoNames } from "./feed-name";
import type { FeedItemRow, StockLine } from "./feed-types";
import type { DraftLine, MakingDraft } from "./making-draft";
import {
  blankDraft,
  blankLine,
  choosingOutput,
  inputsPutRight,
  lineKey,
  makingOfDraft,
  shortNamed,
  whatIsMissing,
} from "./making-draft";

export type Making = Awaited<
  ReturnType<typeof orpc.feedMaking.list.call>
>[number];

/** One feed that went into a making, as it is said. */
interface InputSaid {
  nameBn: string;
  nameEn: string | null;
  unit: string;
  quantity: number;
}

/** What went in, as one line in the reader's language and digits: "Wheat bran 400 kg · Salt 10 kg". */
export const inputsSaid = (
  inputs: readonly InputSaid[],
  language: "bn" | "en"
): string =>
  inputs
    .map(
      (one) =>
        `${namesIn(one, language).shown} ${formatNumber(one.quantity, language)} ${feedUnitWord(one.unit, language)}`
    )
    .join(" · ");

const InputsLine = ({ inputs }: { inputs: readonly InputSaid[] }) => {
  const { language } = useLanguage();
  return inputsSaid(inputs, language);
};

/** A feed's line in the sheet: which feed, how much, and what the store holds of it beside. */
const InputRow = ({
  line,
  items,
  stock,
  onChange,
  onRemove,
}: {
  line: MakingDraft["lines"][number];
  items: readonly FeedItemRow[];
  stock: ReadonlyMap<string, StockLine>;
  onChange: (line: MakingDraft["lines"][number]) => void;
  onRemove: () => void;
}) => {
  const { t, language } = useLanguage();
  const held = stock.get(line.feedItemId);
  const unit = items.find((one) => one.id === line.feedItemId)?.unit ?? "kg";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label={t("making.inputFeed")}
          className="min-w-0 flex-1"
          onChange={(event) =>
            onChange({ ...line, feedItemId: event.target.value })
          }
          value={line.feedItemId}
        >
          <option value="">{t("making.chooseFeed")}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {namesIn(item, language).shown}
            </option>
          ))}
        </NativeSelect>
        <Input
          aria-label={t("making.inputAmount", {
            feed: t("making.inputFeed"),
            unit: feedUnitWord(unit, language),
          })}
          className="w-28"
          inputMode="decimal"
          min={SMALLEST_FEED_AMOUNT}
          onChange={(event) =>
            onChange({ ...line, quantity: event.target.value })
          }
          step="0.1"
          type="number"
          value={line.quantity}
        />
        <span className="text-muted-foreground w-12 text-sm">
          {feedUnitWord(unit, language)}
        </span>
        <Button
          aria-label={t("making.removeInput")}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden />
        </Button>
      </div>
      {held ? (
        <span className="text-muted-foreground text-xs">
          {t("making.onHand", {
            amount: formatNumber(Math.max(0, held.onHand), language),
            unit: feedUnitWord(held.unit, language),
          })}
        </span>
      ) : null}
    </div>
  );
};

/**
 * Making feed: what it makes, what goes in — filled as last time for the same feed — and whether it is a mix in the
 * store today or silage that comes out of the pit later.
 */
export const MakeFeedSheet = ({
  open,
  onOpenChange,
  items,
  stock,
  makings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly FeedItemRow[];
  stock: readonly StockLine[];
  makings: readonly Making[];
}) => {
  const { t, language } = useLanguage();
  const prefix = useId();
  const [draft, setDraft] = useState<MakingDraft>(() =>
    blankDraft(farmDayOf(new Date()))
  );
  const [filled, setFilled] = useState(false);
  // The sheet's own id for this making, kept until the farm has it: a second tap on Save, or a save whose answer was
  // lost, is the same making.
  const [makingId, setMakingId] = useState(() => crypto.randomUUID());
  const refused = useRefused();
  const make = useMutation(
    orpc.feedMaking.make.mutationOptions({
      // A store that could not spare it names each feed and what it could have.
      onError: (error) => refused(shortNamed(error, items, language)),
      onSuccess: () => {
        toast.success(t("making.saved"));
        setDraft(blankDraft(farmDayOf(new Date())));
        setFilled(false);
        setMakingId(crypto.randomUUID());
        onOpenChange(false);
      },
    })
  );
  const kept = items.filter((one) => !one.retiredAt);
  const held = new Map(stock.map((line) => [line.feedItemId, line]));
  const outputUnit =
    kept.find((one) => one.id === draft.outputFeedItemId)?.unit ?? "kg";
  const missing = whatIsMissing(draft);
  const missingWords = {
    output: { said: t("making.needsOutput"), at: `${prefix}-output` },
    inputs: { said: t("making.needsInputs") },
    amount: { said: t("making.needsAmount"), at: `${prefix}-out` },
  } as const;
  return (
    <FormSheet
      description={t("making.hint")}
      missing={missing ? missingWords[missing] : null}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (missing === null) {
          make.mutate({ ...makingOfDraft(draft), id: makingId });
        }
      }}
      open={open}
      pending={make.isPending}
      ready={missing === null}
      submitLabel={t("making.make")}
      title={t("making.title")}
      wide
    >
      <FormField id={`${prefix}-output`} label={t("making.output")}>
        <NativeSelect
          id={`${prefix}-output`}
          onChange={(event) => {
            const chosen = choosingOutput(
              draft,
              event.target.value,
              makings.find((one) => one.outputFeedItemId === event.target.value)
            );
            setDraft(chosen.draft);
            setFilled(chosen.filled);
          }}
          value={draft.outputFeedItemId}
        >
          <option value="">{t("making.chooseFeed")}</option>
          {kept.map((item) => (
            <option key={item.id} value={item.id}>
              {namesIn(item, language).shown}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={`${prefix}-made`} label={t("making.madeOn")}>
        <Input
          id={`${prefix}-made`}
          max={farmDayOf(new Date())}
          onChange={(event) =>
            setDraft({ ...draft, madeOn: event.target.value })
          }
          type="date"
          value={draft.madeOn}
        />
      </FormField>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          {t("making.inputs")}
        </legend>
        {filled ? <WorkedOut>{t("making.likeLastTime")}</WorkedOut> : null}
        {draft.lines.map((line) => (
          <InputRow
            items={kept.filter((one) => one.id !== draft.outputFeedItemId)}
            key={line.key}
            line={line}
            onChange={(changed) =>
              setDraft({
                ...draft,
                lines: draft.lines.map((one) =>
                  one.key === line.key ? changed : one
                ),
              })
            }
            onRemove={() =>
              setDraft({
                ...draft,
                lines: draft.lines.filter((one) => one.key !== line.key),
              })
            }
            stock={held}
          />
        ))}
        <Button
          className="self-start"
          onClick={() =>
            setDraft({ ...draft, lines: [...draft.lines, blankLine()] })
          }
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("making.addInput")}
        </Button>
      </fieldset>
      <FormField id={`${prefix}-how`} label={t("making.how")}>
        <SegmentedControl
          label={t("making.how")}
          name={`${prefix}-how`}
          onChange={(how) => setDraft({ ...draft, how })}
          options={[
            { value: "now", label: t("making.howNow") },
            { value: "later", label: t("making.howLater") },
          ]}
          value={draft.how}
        />
      </FormField>
      {draft.how === "now" ? (
        <FormField
          id={`${prefix}-out`}
          label={t("making.cameOutAmount", {
            unit: feedUnitWord(outputUnit, language),
          })}
        >
          <Input
            id={`${prefix}-out`}
            inputMode="decimal"
            min={SMALLEST_FEED_AMOUNT}
            onChange={(event) =>
              setDraft({ ...draft, cameOut: event.target.value })
            }
            step="0.1"
            type="number"
            value={draft.cameOut}
          />
        </FormField>
      ) : (
        <FormField id={`${prefix}-ready`} label={t("making.readyOn")}>
          <Input
            id={`${prefix}-ready`}
            min={draft.madeOn}
            onChange={(event) =>
              setDraft({ ...draft, readyOn: event.target.value })
            }
            type="date"
            value={draft.readyOn}
          />
        </FormField>
      )}
      <FormField id={`${prefix}-note`} label={t("making.note")}>
        <Input
          id={`${prefix}-note`}
          maxLength={200}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          value={draft.note}
        />
      </FormField>
    </FormSheet>
  );
};

/** Silage opened: how much came out, and the day. */
const CameOutDialog = ({
  making,
  onClose,
}: {
  making: Making;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const prefix = useId();
  const [quantity, setQuantity] = useState("");
  const [on, setOn] = useState(farmDayOf(new Date()));
  const refused = useRefused();
  const cameOut = useMutation(
    orpc.feedMaking.cameOut.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("making.cameOutSaved"));
        onClose();
      },
    })
  );
  const amount = Number(quantity);
  const ready =
    quantity.trim() !== "" &&
    Number.isFinite(amount) &&
    amount >= SMALLEST_FEED_AMOUNT;
  return (
    <FormDialog
      description={t("making.cameOutHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (ready) {
          cameOut.mutate({ id: making.id, quantity: amount, cameOutOn: on });
        }
      }}
      open
      pending={cameOut.isPending}
      ready={ready}
      submitLabel={t("making.cameOut")}
      title={`${t("making.cameOutTitle")} — ${namesIn(making, language).shown}`}
    >
      <FormField
        id={`${prefix}-amount`}
        label={t("making.cameOutAmount", {
          unit: feedUnitWord(making.unit, language),
        })}
      >
        <Input
          id={`${prefix}-amount`}
          inputMode="decimal"
          min={SMALLEST_FEED_AMOUNT}
          onChange={(event) => setQuantity(event.target.value)}
          step="0.1"
          type="number"
          value={quantity}
        />
      </FormField>
      <FormField id={`${prefix}-on`} label={t("making.cameOutOn")}>
        <Input
          id={`${prefix}-on`}
          max={farmDayOf(new Date())}
          min={making.madeOn}
          onChange={(event) => setOn(event.target.value)}
          type="date"
          value={on}
        />
      </FormField>
    </FormDialog>
  );
};

/** What the Feed page knows of its feeds, for a making's rows. */
interface Feeds {
  items: readonly FeedItemRow[];
  stock: ReadonlyMap<string, StockLine>;
}

/** A making's inputs as rows to put right. */
const rowsOf = (making: Making): DraftLine[] =>
  making.inputs.map((one) => ({
    key: lineKey(),
    feedItemId: one.feedItemId,
    quantity: String(one.quantity),
  }));

/**
 * A making written up wrong: what went in — a feed taken away or one added — the day, how much came out and when, or
 * voided, never made. With the reason, as every Correction is.
 */
const MakingCorrection = ({
  making,
  feeds,
}: {
  making: Making;
  feeds: Feeds;
}) => {
  const { t, language } = useLanguage();
  // As the farm compares them: one order, by the feed.
  const held = making.inputs
    .map((one) => ({ feedItemId: one.feedItemId, quantity: one.quantity }))
    .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId));
  const [rows, setRows] = useState<DraftLine[]>(() => rowsOf(making));
  const inputs = inputsPutRight(held, rows);
  const correcting = useCorrecting({
    voided: voiding(),
    madeOn: day(startOfFarmDay(making.madeOn)),
    ...(making.madeFeed
      ? {
          quantity: figure(making.madeFeed.quantity, SMALLEST_FEED_AMOUNT),
          cameOutOn: day(making.madeFeed.cameOutOn),
        }
      : {}),
  });
  const correct = useMutation(orpc.feedMaking.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={() => {
        correcting.handleOpen();
        setRows(rowsOf(making));
      }}
      onSave={async (reason) => {
        try {
          await correct.mutateAsync({
            id: making.id,
            reason,
            changes: {
              ...correcting.changes(),
              ...(inputs.changed
                ? { inputs: { from: held, to: inputs.to } }
                : {}),
            },
          });
        } catch (error) {
          // A store that could not spare it names each feed and what it could have.
          throw shortNamed(error, feeds.items, language);
        }
      }}
      ready={inputs.ready && (correcting.changed || inputs.changed)}
      title={t("making.correct")}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          {t("making.inputs")}
        </legend>
        {rows.map((line) => (
          <InputRow
            items={feeds.items.filter(
              (one) =>
                one.id !== making.outputFeedItemId &&
                (!one.retiredAt ||
                  held.some((each) => each.feedItemId === one.id))
            )}
            key={line.key}
            line={line}
            onChange={(changed) =>
              setRows(rows.map((one) => (one.key === line.key ? changed : one)))
            }
            onRemove={() => setRows(rows.filter((one) => one.key !== line.key))}
            stock={feeds.stock}
          />
        ))}
        <Button
          className="self-start"
          onClick={() => setRows([...rows, blankLine()])}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("making.addInput")}
        </Button>
      </fieldset>
      <CorrectionAnswer
        label={t("making.madeOn")}
        onChange={(value) => correcting.set("madeOn", value)}
        type="date"
        value={correcting.typed.madeOn ?? ""}
      />
      {making.madeFeed ? (
        <>
          <CorrectionAnswer
            inputMode="decimal"
            label={t("making.cameOutAmount", {
              unit: feedUnitWord(making.unit, language),
            })}
            onChange={(value) => correcting.set("quantity", value)}
            type="number"
            value={correcting.typed.quantity ?? ""}
          />
          <CorrectionAnswer
            label={t("making.cameOutOn")}
            onChange={(value) => correcting.set("cameOutOn", value)}
            type="date"
            value={correcting.typed.cameOutOn ?? ""}
          />
        </>
      ) : null}
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

interface MakingRow extends Making {
  mayCorrect: boolean;
  onOpenPit: (making: Making) => void;
  feeds: Feeds;
}

const MadeOnCell = ({ row }: { row: { original: MakingRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatDate(startOfFarmDay(row.original.madeOn), language)}
    </span>
  );
};

const MadeItemCell = ({ row }: { row: { original: MakingRow } }) => (
  <div className="flex flex-col">
    <TwoNames className="font-medium" named={row.original} />
    {row.original.note ? (
      <span className="text-muted-foreground text-xs">{row.original.note}</span>
    ) : null}
  </div>
);

const InputsCell = ({ row }: { row: { original: MakingRow } }) => (
  <span className="text-sm">
    <InputsLine inputs={row.original.inputs} />
  </span>
);

/** What came out, what is left of it, and what the making lost — or that it is still in the pit, and when it is due. */
const CameOutLine = ({ making }: { making: Making }) => {
  const { t, language } = useLanguage();
  const unit = feedUnitWord(making.unit, language);
  if (!making.madeFeed) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="info">{t("making.inThePit")}</StatusBadge>
        {making.readyOn ? (
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {t("making.readyAbout", {
              day: formatDate(startOfFarmDay(making.readyOn), language),
            })}
          </span>
        ) : null}
      </div>
    );
  }
  const loss = making.loss ?? null;
  return (
    <div className="flex flex-col">
      <span className="whitespace-nowrap">
        {formatNumber(making.madeFeed.quantity, language)} {unit}
      </span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {formatDate(making.madeFeed.cameOutOn, language)} · {t("lots.col.left")}{" "}
        {formatNumber(making.madeFeed.left, language)} {unit}
      </span>
      {loss && loss.lost > 0 ? (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("making.lost", {
            amount: formatNumber(loss.lost, language),
            unit,
            percent: formatNumber(loss.percent, language),
          })}
        </span>
      ) : null}
    </div>
  );
};

const CameOutCell = ({ row }: { row: { original: MakingRow } }) => (
  <CameOutLine making={row.original} />
);

/** What went in was worth, and what a unit of the made feed came to; or why it has no price yet. */
const WorthLine = ({ making }: { making: Making }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  if (making.worthMoney === null) {
    return <span className="text-warning text-xs">{t("making.unpriced")}</span>;
  }
  return (
    <div className="flex flex-col items-end">
      <span className="whitespace-nowrap">{asMoney(making.worthMoney)}</span>
      {making.unitPriceMoney === null ? null : (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("stock.averagePrice", {
            amount: formatNumber(
              Math.round(making.unitPriceMoney * 100) / 100,
              language
            ),
            unit: feedUnitEach(making.unit, language),
          })}
        </span>
      )}
    </div>
  );
};

const WorthCell = ({ row }: { row: { original: MakingRow } }) => (
  <WorthLine making={row.original} />
);

/** Opening the pit, for silage still in it; putting it right, for whoever may. */
const MakingActions = ({ row }: { row: MakingRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-end gap-2">
      {row.madeFeed === null && row.mayCorrect ? (
        <Button
          onClick={() => row.onOpenPit(row)}
          size="sm"
          type="button"
          variant="outline"
        >
          <PackageOpen aria-hidden data-icon="inline-start" />
          {t("making.cameOut")}
        </Button>
      ) : null}
      {row.mayCorrect ? (
        <MakingCorrection feeds={row.feeds} making={row} />
      ) : null}
    </div>
  );
};

const ActionsCell = ({ row }: { row: { original: MakingRow } }) => (
  <MakingActions row={row.original} />
);

const makingColumn = createListColumns<MakingRow>();
const makingColumns = makingColumn.columns([
  makingColumn.accessor((one) => one.madeOn, {
    id: "madeOn",
    header: listHeader("making.col.madeOn"),
    cell: MadeOnCell,
  }),
  makingColumn.accessor("nameBn", {
    header: listHeader("making.col.item"),
    cell: MadeItemCell,
  }),
  makingColumn.display({
    id: "inputs",
    header: listHeader("making.col.inputs"),
    cell: InputsCell,
  }),
  makingColumn.accessor((one) => one.madeFeed?.quantity ?? undefined, {
    id: "out",
    header: listHeader("making.col.out"),
    cell: CameOutCell,
  }),
  makingColumn.accessor((one) => one.worthMoney ?? undefined, {
    id: "worth",
    header: listHeader("making.col.worth"),
    cell: WorthCell,
    meta: { align: "end" },
  }),
  makingColumn.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end" },
  }),
]);

/** A making on a phone: what it made and when on top, what went in, what came out and its worth beneath. */
const MakingCard = ({ row }: { row: MakingRow }) => {
  const { language } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{namesIn(row, language).shown}</span>
          <OtherName named={row} />
          <span className="text-muted-foreground text-xs">
            {formatDate(startOfFarmDay(row.madeOn), language)}
            {row.note ? ` · ${row.note}` : ""}
          </span>
        </div>
        <WorthLine making={row} />
      </div>
      <span className="text-sm">
        <InputsLine inputs={row.inputs} />
      </span>
      <CameOutLine making={row} />
      <MakingActions row={row} />
    </div>
  );
};

const makingCard = (row: MakingRow) => <MakingCard row={row} />;

/**
 * Feed made on the farm, newest first: home mixes and silage, what went into each and what came out, and the pits
 * still to open. Making feed is one button away.
 */
export const MakingsTab = ({
  items,
  stock,
  mayRecord,
}: {
  items: readonly FeedItemRow[];
  stock: readonly StockLine[];
  mayRecord: boolean;
}) => {
  const { t } = useLanguage();
  const makings = useQuery(orpc.feedMaking.list.queryOptions());
  const [making, setMaking] = useState(false);
  const [opening, setOpening] = useState<Making | null>(null);
  const feeds: Feeds = {
    items,
    stock: new Map(stock.map((line) => [line.feedItemId, line])),
  };
  const rows = (makings.data ?? []).map((one) => ({
    ...one,
    // An answer cached before losses were said has none.
    loss: one.loss ?? null,
    mayCorrect: mayRecord,
    onOpenPit: setOpening,
    feeds,
  }));
  const table = useListTable({
    columns: makingColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <div className="flex flex-col gap-4">
      {mayRecord ? (
        <Button
          className="self-end"
          onClick={() => setMaking(true)}
          type="button"
        >
          <Blend aria-hidden data-icon="inline-start" />
          {t("making.make")}
        </Button>
      ) : null}
      <Loaded query={makings}>
        {rows.length === 0 ? (
          <EmptyState
            description={t("making.emptyHint")}
            icon={Blend}
            title={t("making.empty")}
          />
        ) : (
          <div className="surface p-4 md:p-5">
            <DataTable
              card={makingCard}
              minWidth="56rem"
              pageSize={20}
              table={table}
            />
          </div>
        )}
      </Loaded>
      {mayRecord ? (
        <MakeFeedSheet
          items={items}
          makings={makings.data ?? []}
          onOpenChange={setMaking}
          open={making}
          stock={stock}
        />
      ) : null}
      {opening ? (
        <CameOutDialog making={opening} onClose={() => setOpening(null)} />
      ) : null}
    </div>
  );
};
