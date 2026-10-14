import { startOfFarmDay } from "@OpenFarm/domain";
import { currencySign, formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Hourglass, ReceiptText } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useDeferredValue, useState } from "react";

import {
  EmptyState,
  Loaded,
  Notice,
  RecordList,
  RecordRow,
  Section,
  StatusBadge,
  TableSkeleton,
} from "@/components/page";
import {
  FormDialog,
  FormField,
  FormSheet,
  InsetPanel,
  NativeSelect,
} from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import type { StatementTyped } from "@/lib/buyer-statement-form";
import {
  STATEMENT_OPENS,
  amountApartSaid,
  signedSaid,
  besideAsked,
  statementProblem,
  statementSent,
} from "@/lib/buyer-statement-form";
import { saidAsMoney } from "@/lib/money";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** A Buyer Statement as the farm lists it. */
type Statement = Awaited<ReturnType<typeof orpc.milk.statements.call>>[number];

/** A farm day as the page says it. */
const DaySaid = ({ day }: { day: string }) => {
  const { language } = useLanguage();
  return <>{formatDate(startOfFarmDay(day), language, "date")}</>;
};

/** Money as the page says it: the sign, then the figure in the reader's numerals. */
const Money = ({ amount }: { amount: number }) => {
  const { language } = useLanguage();
  return (
    <span className="tabular-nums">
      {currencySign()}
      {formatNumber(amount, language)}
    </span>
  );
};

/**
 * The milk sent with its price to follow and still waiting for its buyer's statement, one line a buyer, the longest
 * waiting first: how much, since when, and how much of it is late.
 */
const StillToFollow = () => {
  const { t } = useLanguage();
  const waiting = useQuery(orpc.milk.priceToFollow.queryOptions());
  const rows = waiting.data ?? [];
  return (
    <Section
      description={t("statement.waitingHint")}
      title={t("statement.waiting")}
    >
      <Loaded query={waiting} skeleton={<TableSkeleton rows={2} />}>
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={Hourglass}
            title={t("statement.noneWaiting")}
          />
        ) : (
          <RecordList>
            {rows.map((one) => (
              <RecordRow
                key={one.counterpartyId}
                meta={
                  <>
                    <span>
                      {t("statement.waitingLine", {
                        count: one.count,
                        liters: one.liters,
                      })}
                    </span>
                    <span>
                      {t("statement.since")} <DaySaid day={one.oldestOn} />
                    </span>
                  </>
                }
                title={one.name}
                trailing={
                  one.lateCount > 0 ? (
                    <StatusBadge tone="warning">
                      {t("statement.late", { liters: one.lateLiters })}
                    </StatusBadge>
                  ) : null
                }
              />
            ))}
          </RecordList>
        )}
      </Loaded>
    </Section>
  );
};

/** One box of the statement sheet, labeled, holding what was typed into it. */
const StatementInput = ({
  name,
  label,
  typed,
  onType,
  ...props
}: {
  name: keyof StatementTyped;
  label: string;
  typed: StatementTyped;
  onType: (name: keyof StatementTyped, value: string) => void;
} & Omit<
  ComponentProps<typeof Input>,
  "id" | "name" | "onChange" | "value"
>) => (
  <FormField id={`statement-${name}`} label={label}>
    <Input
      id={`statement-${name}`}
      onChange={(event) => onType(name, event.target.value)}
      value={typed[name]}
      {...props}
    />
  </FormField>
);

/** A figure box: decimals, on the phone's number pad. */
const FIGURE = { inputMode: "decimal", step: "0.01", type: "number" } as const;

/** The statement beside the farm's own milk to him in its days, as it is typed: what the Manager checks before saving. */
const Beside = ({ form }: { form: StatementTyped }) => {
  const { t, language } = useLanguage();
  const asked = useDeferredValue(besideAsked(form));
  const beside = useQuery({
    ...orpc.milk.statementBeside.queryOptions({
      input: asked ?? {
        counterpartyId: "",
        fromDay: "2000-01-01",
        toDay: "2000-01-01",
        liters: 1,
        amountMoney: 0,
      },
    }),
    enabled: asked !== null,
  });
  if (asked === null || !beside.data) {
    return null;
  }
  const one = beside.data;
  const short = one.differenceLiters < 0;
  return (
    <InsetPanel>
      <div className="flex flex-col gap-1 text-sm">
        <p>
          {t("statement.farmSent", {
            liters: one.farmLiters,
            count: one.toFollowCount,
          })}
        </p>
        <p className={short ? "text-warning font-medium" : undefined}>
          {one.differencePercent === null
            ? t("statement.differenceNoPercent", {
                liters: signedSaid(one.differenceLiters, language),
              })
            : t("statement.difference", {
                liters: signedSaid(one.differenceLiters, language),
                percent: signedSaid(one.differencePercent, language),
              })}
        </p>
        {one.pricedLiters > 0 ? (
          <p>
            {t("statement.pricedAtGate", {
              liters: one.pricedLiters,
              amount: one.pricedMoney,
            })}
          </p>
        ) : null}
        {one.toFollowCount > 0 ? (
          <p className="font-medium">
            {t("statement.willPrice", {
              liters: one.toFollowLiters,
              amount: one.spreadMoney,
            })}
          </p>
        ) : (
          <p>
            {t("statement.amountBeside", {
              amount: saidAsMoney(one.amountDifferenceMoney, language),
            })}
          </p>
        )}
        {one.problem ? (
          <p className="text-warning font-medium" role="alert">
            {t(
              one.problem === "statement_overlaps"
                ? "refusal.statementOverlaps"
                : "refusal.statementBelowPriced"
            )}
          </p>
        ) : null}
      </div>
    </InsetPanel>
  );
};

/** The Manager or the Owner records a buyer's statement: his days, his liters, his amount, and the milk it prices. */
const StatementSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(STATEMENT_OPENS);
  const [photo, setPhoto] = useState<Photo | null>(null);
  // The phone's own id for this statement, so a save sent twice is one statement; a new one once it is kept.
  const [id, setId] = useState(() => crypto.randomUUID());
  const buyers = useQuery({
    ...orpc.milk.buyers.queryOptions(),
    enabled: open,
  });
  const record = useMutation(
    orpc.milk.recordStatement.mutationOptions({
      onSuccess: async () => {
        setForm(STATEMENT_OPENS);
        setPhoto(null);
        setId(crypto.randomUUID());
        toast.success(t("statement.recorded"));
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.milk.key() });
      },
      onError: refused,
    })
  );
  const onType = (name: keyof StatementTyped, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));
  const problem = statementProblem(form);
  const box = { typed: form, onType };
  return (
    <FormSheet
      description={t("statement.sheetDescription")}
      missing={problem ? { at: problem.at, said: t(problem.message) } : null}
      onOpenChange={onOpenChange}
      onSubmit={() => record.mutate(statementSent(form, id, photo))}
      open={open}
      pending={record.isPending}
      ready={problem === null}
      submitLabel={t("statement.save")}
      title={t("statement.record")}
      wide
    >
      <FormField id="statement-buyer" label={t("dispatch.buyer")}>
        <NativeSelect
          id="statement-buyer"
          onChange={(event) => onType("counterpartyId", event.target.value)}
          value={form.counterpartyId}
        >
          <option value="">{t("statement.pickBuyer")}</option>
          {(buyers.data ?? []).map((one) => (
            <option key={one.counterpartyId} value={one.counterpartyId}>
              {one.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatementInput
          {...box}
          label={t("statement.fromDay")}
          name="fromDay"
          type="date"
        />
        <StatementInput
          {...box}
          label={t("statement.toDay")}
          name="toDay"
          type="date"
        />
        <StatementInput
          {...box}
          label={t("statement.statedOn")}
          name="statedOn"
          type="date"
        />
        <StatementInput
          {...box}
          label={t("statement.payBy")}
          name="payBy"
          type="date"
        />
        <StatementInput
          {...box}
          {...FIGURE}
          label={t("statement.liters")}
          min={0.01}
          name="liters"
        />
        <StatementInput
          {...box}
          {...FIGURE}
          label={t("statement.amount")}
          min={0}
          name="amount"
        />
      </div>
      <Beside form={form} />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatementInput {...box} label={t("statement.number")} name="number" />
        <StatementInput
          {...box}
          {...FIGURE}
          label={t("statement.rate")}
          name="rate"
        />
        <StatementInput
          {...box}
          {...FIGURE}
          label={t("dispatch.fat")}
          name="fat"
        />
        <StatementInput
          {...box}
          {...FIGURE}
          label={t("dispatch.snf")}
          name="snf"
        />
      </div>
      <StatementInput {...box} label={t("dispatch.note")} name="note" />
      <PhotoField
        chosen={photo !== null}
        id="statement-photo"
        onPhoto={setPhoto}
        takeLabel="statement.photo"
      />
    </FormSheet>
  );
};

/** The Owner voids a wrong statement, with her reason: the milk it priced goes back to its price to follow. */
const VoidStatement = ({ statement }: { statement: Statement }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const voiding = useMutation(
    orpc.milk.voidStatement.mutationOptions({
      onSuccess: async () => {
        setReason("");
        setOpen(false);
        toast.success(t("statement.voided"));
        await queryClient.invalidateQueries({ queryKey: orpc.milk.key() });
      },
      onError: refused,
    })
  );
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("statement.void")}
      </Button>
      <FormDialog
        description={t("statement.voidHint")}
        onOpenChange={setOpen}
        onSubmit={() => voiding.mutate({ id: statement.id, reason })}
        open={open}
        pending={voiding.isPending}
        ready={reason.trim() !== ""}
        submitLabel={t("statement.void")}
        title={t("statement.voidTitle", { name: statement.buyerName })}
      >
        <FormField id={`void-${statement.id}`} label={t("correct.why")}>
          <Input
            id={`void-${statement.id}`}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </FormField>
      </FormDialog>
    </>
  );
};

/** A statement's photograph, fetched only when asked for. */
const StatementPhoto = ({ id }: { id: string }) => {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  const photo = useQuery({
    ...orpc.milk.statementPhoto.queryOptions({ input: { id } }),
    enabled: shown,
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-fit"
        onClick={() => setShown((was) => !was)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t(shown ? "statement.hidePhoto" : "statement.seePhoto")}
      </Button>
      {shown && photo.data ? (
        <img
          alt={t("statement.photo")}
          className="h-auto max-w-full rounded-lg"
          src={`data:${photo.data.contentType};base64,${photo.data.data}`}
        />
      ) : null}
    </div>
  );
};

/** One statement, beside the farm's own milk to him in its days. */
const StatementLine = ({
  statement,
  mayVoid,
}: {
  statement: Statement;
  mayVoid: boolean;
}) => {
  const { t, language } = useLanguage();
  const short = statement.differenceLiters < 0;
  // His amount not matched by what the farm priced in its days — a can priced at the gate written in since, say.
  const amountApart = amountApartSaid(statement, language);
  // Voided, it says so; standing, the Owner may void it.
  let standing: ReactNode = null;
  if (statement.voided) {
    standing = (
      <StatusBadge tone="danger">{t("statement.voidedBadge")}</StatusBadge>
    );
  } else if (mayVoid) {
    standing = <VoidStatement statement={statement} />;
  }
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">
            {statement.buyerName}
            {statement.number ? ` · ${statement.number}` : ""}
          </span>
          <span className="text-muted-foreground text-sm">
            <DaySaid day={statement.fromDay} /> –{" "}
            <DaySaid day={statement.toDay} />
          </span>
        </div>
        {standing}
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <span>
          {t("statement.theirLiters", { liters: statement.liters })} ·{" "}
          {t("statement.ourLiters", { liters: statement.farmLiters })}
        </span>
        <span className={short ? "text-warning font-medium" : undefined}>
          {statement.differencePercent === null
            ? t("statement.differenceNoPercent", {
                liters: signedSaid(statement.differenceLiters, language),
              })
            : t("statement.difference", {
                liters: signedSaid(statement.differenceLiters, language),
                percent: signedSaid(statement.differencePercent, language),
              })}
        </span>
        <span>
          {t("statement.amountLabel")} <Money amount={statement.amountMoney} />
          {statement.ratePerLiterMoney === null ? null : (
            <span className="text-muted-foreground">
              {" "}
              · {t("statement.rateSaid", { rate: statement.ratePerLiterMoney })}
            </span>
          )}
        </span>
        {statement.voided ? (
          <span className="text-muted-foreground">
            {t("statement.voidedWhy", { reason: statement.voided.reason })}
          </span>
        ) : (
          <span>
            {t("statement.priced", {
              count: statement.pricedByItCount,
              amount: statement.pricedByItMoney,
            })}
          </span>
        )}
        {amountApart ? (
          <span className="text-warning font-medium">
            {t("statement.amountBesideRecorded", {
              amount: amountApart,
            })}
          </span>
        ) : null}
      </div>
      {statement.hasPhoto ? <StatementPhoto id={statement.id} /> : null}
    </div>
  );
};

/**
 * The milk page's Statements tab: the milk still waiting for its price, and every buyer's statement beside the farm's
 * own milk to him in its days — his liters against the farm's, his amount, and what it priced (ADR 0033). The Manager
 * and the Owner record them; the Owner voids a wrong one.
 */
export const BuyerStatementsTab = ({
  mayRecord,
  mayVoid,
}: {
  mayRecord: boolean;
  mayVoid: boolean;
}) => {
  const { t } = useLanguage();
  const [recording, setRecording] = useState(false);
  const statements = useQuery(orpc.milk.statements.queryOptions());
  const rows = statements.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <StillToFollow />
      <Section
        action={
          mayRecord ? (
            <Button onClick={() => setRecording(true)} type="button">
              <ReceiptText aria-hidden data-icon="inline-start" />
              {t("statement.record")}
            </Button>
          ) : null
        }
        description={t("statement.listHint")}
        title={t("statement.title")}
      >
        <Loaded query={statements} skeleton={<TableSkeleton />}>
          {rows.length === 0 ? (
            <EmptyState bare icon={FileText} title={t("statement.none")} />
          ) : (
            <RecordList>
              {rows.map((one) => (
                <StatementLine key={one.id} mayVoid={mayVoid} statement={one} />
              ))}
            </RecordList>
          )}
        </Loaded>
      </Section>
      {mayRecord ? (
        <StatementSheet onOpenChange={setRecording} open={recording} />
      ) : null}
    </div>
  );
};

/** The buyers whose milk with its price to follow is late, and whether the farm has answered: what the Owner's "all
 *  fine" waits on too. */
export const useLatePriceToFollow = () => {
  const waiting = useQuery(orpc.milk.priceToFollow.queryOptions());
  return {
    late: (waiting.data ?? []).filter((one) => one.lateCount > 0),
    heard: waiting.isSuccess,
  };
};

/**
 * Milk sent with its price to follow and left too long — past its buyer's statement period and ten days more — as the
 * Manager's and the Owner's homes say it, with the way to the Statements tab. Nothing while none is late.
 */
export const PriceToFollowAttention = () => {
  const { t } = useLanguage();
  const { late } = useLatePriceToFollow();
  if (late.length === 0) {
    return null;
  }
  return (
    <Notice
      action={
        <Link
          className="text-sm font-medium underline underline-offset-4"
          to="/milk/statements"
        >
          {t("statement.seeWaiting")}
        </Link>
      }
      title={t("statement.attention")}
      tone="warning"
    >
      {t("statement.attentionHint", {
        count: late.length,
        liters: late.reduce((sum, one) => sum + one.lateLiters, 0),
      })}
    </Notice>
  );
};
