import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Section, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefreshTheBooks } from "@/lib/refresh";
import { sayWhy } from "@/lib/saying";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type Approved = NonNullable<
  Awaited<ReturnType<typeof orpc.ventures.approvedSettlement.call>>
>;
type Adjustment = Approved["adjustments"][number];

/** What became of an Adjustment: what it is called, and how loudly it is said. */
const OUTCOME = {
  noted: { word: "ventures.onlyNoted", tone: "neutral" },
  outstanding: { word: "ventures.stillToDeal", tone: "warning" },
  paid: { word: "ventures.wasPaid", tone: "success" },
  waived: { word: "ventures.wasWaived", tone: "neutral" },
} as const satisfies Record<
  Adjustment["outcome"],
  { word: MessageKey; tone: "neutral" | "warning" | "success" }
>;

/**
 * Something that landed after the Settlement was approved, written down.
 *
 * Asked for in the Owner's words, because an Investor reading this years later is owed a reason and not
 * only a figure. What it does to the run is worked out from the records themselves — she says what
 * turned up, not what it is worth.
 */
export const RaiseAdjustmentSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refresh = useRefreshTheBooks();
  const [reason, setReason] = useState("");
  // Emptied when it is a different Venture being written up: a reason typed for one run is not a reason
  // for another.
  const [lastFor, setLastFor] = useState<string | null>(null);
  if ((venture?.id ?? null) !== lastFor) {
    setLastFor(venture?.id ?? null);
    setReason("");
  }
  const raising = useMutation(
    orpc.ventures.raiseAdjustment.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async (done) => {
        setReason("");
        onOpenChange(false);
        await refresh();
        toast.success(t(OUTCOME[done.outcome].word));
      },
    })
  );
  return (
    <FormSheet
      description={t("ventures.raiseAdjustmentHint", {
        venture: venture?.name ?? "",
      })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (venture !== null) {
          raising.mutate({ ventureId: venture.id, reason });
        }
      }}
      open={open}
      pending={raising.isPending}
      ready={venture !== null && reason.trim() !== ""}
      submitLabel={t("ventures.raiseAdjustment")}
      title={t("ventures.raiseAdjustment")}
    >
      <FormField id="adjust-reason" label={t("ventures.whatTurnedUp")}>
        <Textarea
          id="adjust-reason"
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          value={reason}
        />
      </FormField>
    </FormSheet>
  );
};

/** An Adjustment let go: the Owner deciding it is not worth moving money over, in words she stands behind. */
export const WaiveAdjustmentSheet = ({
  what,
  open,
  onOpenChange,
}: {
  what: { ventureId: string; adjustmentId: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refresh = useRefreshTheBooks();
  const [note, setNote] = useState("");
  // Emptied when it is another Adjustment being let go: one reason standing behind the wrong decision is
  // worse than no reason at all.
  const [lastFor, setLastFor] = useState<string | null>(null);
  if ((what?.adjustmentId ?? null) !== lastFor) {
    setLastFor(what?.adjustmentId ?? null);
    setNote("");
  }
  const waiving = useMutation(
    orpc.ventures.waiveAdjustment.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setNote("");
        onOpenChange(false);
        await refresh();
        toast.success(t(OUTCOME.waived.word));
      },
    })
  );
  return (
    <FormSheet
      description={t("ventures.waiveHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (what !== null) {
          waiving.mutate({ ...what, note });
        }
      }}
      open={open}
      pending={waiving.isPending}
      ready={what !== null && note.trim() !== ""}
      submitLabel={t("ventures.waive")}
      title={t("ventures.waive")}
    >
      <FormField id="waive-note" label={t("ventures.whyLetItGo")}>
        <Textarea
          id="waive-note"
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * What one Adjustment says: what turned up, what the run would come to now against what was frozen, and
 * what became of it.
 *
 * The two profits are labelled apart on purpose. An Owner who cannot tell which figure is the Settlement's
 * and which is today's is an Owner about to read the wrong one to an Investor.
 */
const OneAdjustment = ({
  adjustment,
  frozen,
  shares,
  onPay,
  onWaive,
}: {
  adjustment: Adjustment;
  frozen: { profitBdt: number; perUnitBdt: number };
  shares: Approved["shares"];
  onPay: () => void;
  onWaive: () => void;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const down = adjustment.perUnitDifferenceBdt < 0;
  return (
    <div className="flex flex-col gap-1 border-t pt-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{adjustment.reason}</span>
        <StatusBadge
          tone={
            adjustment.outcome === "outstanding" &&
            adjustment.perUnitToPayBdt <= 0
              ? "neutral"
              : OUTCOME[adjustment.outcome].tone
          }
        >
          {adjustment.outcome === "outstanding" &&
          adjustment.perUnitToPayBdt <= 0
            ? t("ventures.alreadySentByAnEarlierOne")
            : t(OUTCOME[adjustment.outcome].word)}
        </StatusBadge>
      </div>
      <p className="text-muted-foreground">
        {formatDate(new Date(adjustment.raisedAt), language, "date")}
      </p>
      <p className="tabular-nums">
        {t("ventures.wouldBeNow", {
          profit: taka(adjustment.profitBdt),
          perUnit: taka(adjustment.perUnitBdt),
        })}
      </p>
      <p className="text-muted-foreground tabular-nums">
        {t("ventures.wasFrozenAt", {
          profit: taka(frozen.profitBdt),
          perUnit: taka(frozen.perUnitBdt),
        })}
      </p>
      <p
        className={
          down && adjustment.outcome === "outstanding"
            ? "text-amber-700 dark:text-amber-500"
            : ""
        }
      >
        {t(down ? "ventures.aUnitLost" : "ventures.aUnitGained", {
          amount: taka(Math.abs(adjustment.perUnitDifferenceBdt)),
        })}
      </p>
      {adjustment.waivedNote ? (
        <p className="text-muted-foreground">{adjustment.waivedNote}</p>
      ) : null}
      {adjustment.outcome === "paid" ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">
            {t("ventures.theFarmMadeItGood")}
          </p>
          {/* What each man actually got, not only what the act came to: it is his own figure he will
              ask about. */}
          {shares.map((one) => (
            <div className="flex justify-between gap-2" key={one.agreementId}>
              <span className="text-muted-foreground">{one.name}</span>
              <span className="tabular-nums">
                {taka(adjustment.perUnitPaidBdt * one.units)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {adjustment.outcome === "outstanding" ? (
        <div className="flex justify-end gap-2">
          {adjustment.perUnitToPayBdt <= 0 ? null : (
            <Button
              aria-label={t("ventures.sendOnThis", {
                reason: adjustment.reason,
              })}
              onClick={onPay}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("ventures.send")}
            </Button>
          )}
          <Button
            aria-label={t("ventures.waiveThis", { reason: adjustment.reason })}
            onClick={onWaive}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("ventures.waive")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Everything that has landed since the Settlement was approved, and what was done about each.
 *
 * The Settlement's own figures never move through any of it — which is why each Adjustment says what the
 * run would come to now *and* what was frozen, side by side, rather than leaving her to wonder.
 */
export const Adjustments = ({
  approved,
  onRaise,
  onPay,
  onWaive,
}: {
  approved: Approved;
  onRaise: () => void;
  onPay: (what: { adjustmentId: string; amountBdt: number }) => void;
  onWaive: (adjustmentId: string) => void;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      action={
        <Button onClick={onRaise} size="sm" type="button" variant="outline">
          {t("ventures.raiseAdjustment")}
        </Button>
      }
      plain
      title={t("ventures.settlementAdjustments")}
    >
      <div className="flex flex-col gap-2">
        {approved.adjustments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("ventures.nothingHasLanded")}
          </p>
        ) : null}
        {approved.adjustments.map((one) => (
          <OneAdjustment
            adjustment={one}
            frozen={approved}
            key={one.id}
            onPay={() =>
              onPay({
                adjustmentId: one.id,
                amountBdt: one.perUnitToPayBdt * approved.units,
              })
            }
            onWaive={() => onWaive(one.id)}
            shares={approved.shares}
          />
        ))}
      </div>
    </Section>
  );
};
