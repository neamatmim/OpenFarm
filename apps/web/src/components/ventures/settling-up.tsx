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
import { useRefreshTheBooks } from "@/lib/refresh";
import { sayWhy } from "@/lib/saying";
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
 * One payment out of an approved Settlement: the Owner's own money back, an Investor's share, or the
 * Farm's. The same sheet for all three, because they are the same act with a different name on it.
 */
export const PayOutSheet = ({
  what,
  open,
  onOpenChange,
}: {
  what: {
    ventureId: string;
    kind: "advance" | "share" | "farm" | "adjustment";
    title: string;
    amountBdt: number;
    agreementId?: string;
    adjustmentId?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refresh = useRefreshTheBooks();
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
  const done = async () => {
    setMovedOn("");
    setReference("");
    onOpenChange(false);
    await refresh();
    toast.success(t("ventures.paid"));
  };
  const failed = (error: unknown) => toast.error(sayWhy(error, t));
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
    if (what.kind === "advance") {
      repaying.mutate(where);
      return;
    }
    if (what.kind === "farm") {
      taking.mutate(where);
      return;
    }
    if (what.kind === "adjustment") {
      adjusting.mutate({ ...where, adjustmentId: what.adjustmentId ?? "" });
      return;
    }
    paying.mutate({
      ...where,
      agreementId: what.agreementId ?? "",
      amountBdt: what.amountBdt,
    });
  };
  return (
    <FormSheet
      description={t("ventures.payOutHint", {
        who: what?.title ?? "",
        amount: formatNumber(what?.amountBdt ?? 0, language),
      })}
      onOpenChange={onOpenChange}
      onSubmit={send}
      open={open}
      pending={pending}
      ready={what !== null && movedOn !== "" && reference.trim() !== ""}
      submitLabel={t("ventures.send")}
      title={t("ventures.sendTo", { who: what?.title ?? "" })}
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
  const refresh = useRefreshTheBooks();
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
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setNote("");
        onOpenChange(false);
        await refresh();
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
}: {
  share: Share;
  onPay: () => void;
  onAcknowledge: () => void;
}) => {
  const { t, language } = useLanguage();
  if (!share.paid) {
    // Offered even while the Advance is still out, because the farm refuses that in words she can act
    // on — and a button that will not press tells her nothing about why.
    return (
      <Button
        aria-label={t("ventures.sendTo", { who: share.name })}
        onClick={onPay}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("ventures.send")}
      </Button>
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
