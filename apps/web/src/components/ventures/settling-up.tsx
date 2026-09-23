import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Approved = NonNullable<
  Awaited<ReturnType<typeof orpc.ventures.approvedSettlement.call>>
>;
type Share = Approved["shares"][number];

/** The day and the bank reference a payment went out on — asked for every time money leaves. */
const WhenAndWhat = ({
  movedOn,
  reference,
  onMovedOn,
  onReference,
  id,
}: {
  movedOn: string;
  reference: string;
  onMovedOn: (day: string) => void;
  onReference: (what: string) => void;
  id: string;
}) => {
  const { t } = useLanguage();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${id}-day`} label={t("ventures.movedOn")}>
        <Input
          id={`${id}-day`}
          onChange={(event) => onMovedOn(event.target.value)}
          type="date"
          value={movedOn}
        />
      </FormField>
      <FormField id={`${id}-reference`} label={t("ventures.reference")}>
        <Input
          autoComplete="off"
          id={`${id}-reference`}
          onChange={(event) => onReference(event.target.value)}
          value={reference}
        />
      </FormField>
    </div>
  );
};

/**
 * What the payment sheet says for one payment. The Farm's share of a loss is the one that comes in rather than
 * going out, and says so: "send the Farm its money" would be the wrong way round for the Farm putting money in.
 */
const sheetWords = (
  what: { kind: string; title: string; amountBdt: number } | null,
  t: (key: MessageKey, params?: MessageParams) => string,
  language: Language
) => {
  const amount = formatNumber(what?.amountBdt ?? 0, language);
  const who = what?.title ?? "";
  if (what?.kind === "farmLoss") {
    return {
      title: t("ventures.farmsLoss"),
      description: t("ventures.coverLossHint", { amount }),
      submit: t("ventures.payIn"),
    };
  }
  return {
    title: t("ventures.sendTo", { who }),
    description: t("ventures.payOutHint", { who, amount }),
    submit: t("ventures.send"),
  };
};

/**
 * One payment against an approved Settlement: the Owner's own money back, an Investor's share, the Farm's
 * share going out — or the Farm's share of a loss coming in. The same sheet for all of them, because they are
 * the same act with a different name on it.
 */
export const PayOutSheet = ({
  what,
  open,
  onOpenChange,
}: {
  what: {
    ventureId: string;
    kind: "advance" | "share" | "farm" | "farmLoss" | "adjustment";
    title: string;
    amountBdt: number;
    agreementId?: string;
    adjustmentId?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [movedOn, setMovedOn] = useState("");
  const [reference, setReference] = useState("");
  // Emptied whenever the sheet is opened for somebody else: a bank reference left over from the last man
  // is a reference against the wrong payment, and the whole point of writing it down is that it is real.
  const [lastFor, setLastFor] = useState<string | null>(null);
  const who =
    what === null
      ? null
      : `${what.kind}:${what.agreementId ?? ""}:${what.adjustmentId ?? ""}`;
  if (who !== lastFor) {
    setLastFor(who);
    setMovedOn("");
    setReference("");
  }
  const done = () => {
    setMovedOn("");
    setReference("");
    onOpenChange(false);
    toast.success(t("ventures.paid"));
  };
  const failed = refused;
  const repaying = useMutation(
    orpc.ventures.repayAdvance.mutationOptions({
      onError: failed,
      onSuccess: done,
    })
  );
  const paying = useMutation(
    orpc.ventures.paySettlement.mutationOptions({
      onError: failed,
      onSuccess: done,
    })
  );
  const taking = useMutation(
    orpc.ventures.takeTheFarmsShare.mutationOptions({
      onError: failed,
      onSuccess: done,
    })
  );
  const covering = useMutation(
    orpc.ventures.coverTheFarmsLoss.mutationOptions({
      onError: failed,
      onSuccess: done,
    })
  );
  const adjusting = useMutation(
    orpc.ventures.payAdjustment.mutationOptions({
      onError: failed,
      onSuccess: done,
    })
  );
  const pending =
    repaying.isPending ||
    paying.isPending ||
    taking.isPending ||
    covering.isPending ||
    adjusting.isPending;
  const send = () => {
    if (what === null) {
      return;
    }
    const where = {
      ventureId: what.ventureId,
      movedOn,
      paymentMethod: "bank" as const,
      reference,
    };
    // One call for each kind of payment, looked up rather than asked in turn.
    const byKind = {
      advance: () => repaying.mutate(where),
      farm: () => taking.mutate(where),
      farmLoss: () => covering.mutate(where),
      adjustment: () =>
        adjusting.mutate({ ...where, adjustmentId: what.adjustmentId ?? "" }),
      share: () =>
        paying.mutate({
          ...where,
          agreementId: what.agreementId ?? "",
          amountBdt: what.amountBdt,
        }),
    } as const;
    byKind[what.kind]();
  };
  const words = sheetWords(what, t, language);
  return (
    <FormSheet
      description={words.description}
      onOpenChange={onOpenChange}
      onSubmit={send}
      open={open}
      pending={pending}
      ready={what !== null && movedOn !== "" && reference.trim() !== ""}
      submitLabel={words.submit}
      title={words.title}
    >
      <WhenAndWhat
        id="pay-out"
        movedOn={movedOn}
        onMovedOn={setMovedOn}
        onReference={setReference}
        reference={reference}
      />
    </FormSheet>
  );
};

/** An Investor saying he had his money, written down against his payout. */
export const AcknowledgeSheet = ({
  what,
  open,
  onOpenChange,
}: {
  what: { ventureId: string; agreementId: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [note, setNote] = useState("");
  // Emptied when it is somebody else being written down: one man recorded as saying another's words is
  // worse than nothing written at all.
  const [lastFor, setLastFor] = useState<string | null>(null);
  if ((what?.agreementId ?? null) !== lastFor) {
    setLastFor(what?.agreementId ?? null);
    setNote("");
  }
  const saying = useMutation(
    orpc.ventures.acknowledgePayout.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setNote("");
        onOpenChange(false);
        toast.success(t("ventures.acknowledged"));
      },
    })
  );
  return (
    <FormSheet
      description={t("ventures.acknowledgeHint", { who: what?.title ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (what !== null) {
          saying.mutate({
            ventureId: what.ventureId,
            agreementId: what.agreementId,
            note: note.trim() === "" ? undefined : note,
          });
        }
      }}
      open={open}
      pending={saying.isPending}
      ready={what !== null}
      submitLabel={t("ventures.acknowledge")}
      title={t("ventures.acknowledge")}
    >
      <FormField id="ack-note" label={t("ventures.whatHeSaid")}>
        <Textarea
          id="ack-note"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * What one Investor is owed, and what has happened about it.
 *
 * Paid or not paid, and whether he has said so himself — the two are different facts, and the Owner is
 * about to telephone whoever is missing from the second.
 */
export const SharePaid = ({
  share,
  onPay,
  onAcknowledge,
  advanceFirst = false,
}: {
  share: Share;
  onPay: () => void;
  onAcknowledge: () => void;
  /** Her own Advance is still out, and her money comes back before any capital does. */
  advanceFirst?: boolean;
}) => {
  const { t, language } = useLanguage();
  if (!share.paid) {
    // Held while the Advance is still out, and saying why beside it: the farm refuses a payout before the
    // Advance, and finding that out after writing the transfer's reference is finding it out too late.
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Button
          aria-label={t("ventures.sendTo", { who: share.name })}
          disabled={advanceFirst}
          onClick={onPay}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("ventures.send")}
        </Button>
        {advanceFirst ? (
          <span className="text-muted-foreground text-xs">
            {t("refusal.advanceComesFirst")}
          </span>
        ) : null}
      </span>
    );
  }
  if (share.acknowledgedAt) {
    return (
      <span className="flex items-center gap-2">
        <StatusBadge tone="success">
          {t("ventures.saidOn", {
            day: formatDate(new Date(share.acknowledgedAt), language, "date"),
          })}
        </StatusBadge>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <StatusBadge tone="neutral">{t("ventures.sent")}</StatusBadge>
      <Button
        aria-label={t("ventures.acknowledgeHint", { who: share.name })}
        onClick={onAcknowledge}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("ventures.acknowledge")}
      </Button>
    </span>
  );
};
