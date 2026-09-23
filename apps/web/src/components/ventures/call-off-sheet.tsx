import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { sayWhy } from "@/lib/saying";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** The day and the reference of the transfer that sends one movement's money back. */
interface SentBack {
  movedOn: string;
  reference: string;
}

const NOTHING_SENT: SentBack = { movedOn: "", reference: "" };

/**
 * A Venture called off: the Floor was not met by the day it had to be, so nothing is bought and every
 * taka goes back.
 *
 * The sheet asks for the day and the reference of each refund, one per movement that came in, because
 * the Venture ends when the money is on its way back and an Investor asking "where is mine" deserves a
 * transfer number rather than a date.
 */
export const CallOffSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const [reason, setReason] = useState("");
  const [sentBack, setSentBack] = useState<Record<string, SentBack>>({});
  useFreshFor(venture?.id, () => {
    setReason("");
    setSentBack({});
  });
  const movements = useQuery({
    ...orpc.ventures.movements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const nameOf = useInvestorNames();
  const took = (movements.data ?? []).filter(
    (one) => one.kind === "capital_in"
  );
  const callingOff = useMutation(
    orpc.ventures.cancel.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: () => {
        setReason("");
        setSentBack({});
        onOpenChange(false);
        toast.success(t("ventures.calledOff"));
      },
    })
  );
  const eachAnswered = took.every((one) => {
    const back = sentBack[one.id];
    return back && back.movedOn !== "" && back.reference.trim() !== "";
  });
  const ready = venture !== null && reason.trim() !== "" && eachAnswered;
  const say = (movementId: string, what: Partial<SentBack>) =>
    setSentBack((before) => ({
      ...before,
      [movementId]: { ...NOTHING_SENT, ...before[movementId], ...what },
    }));
  return (
    <FormSheet
      description={t("ventures.callOffHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        callingOff.mutate({
          id: venture?.id ?? "",
          reason,
          refunds: took.map((one) => ({
            movementId: one.id,
            movedOn: sentBack[one.id]?.movedOn ?? "",
            reference: sentBack[one.id]?.reference ?? "",
          })),
        })
      }
      open={open}
      pending={callingOff.isPending}
      ready={ready}
      submitLabel={t("ventures.callOff")}
      title={t("ventures.callOff")}
    >
      <FormField id="call-off-reason" label={t("ventures.callOffReason")}>
        <Textarea
          id="call-off-reason"
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          value={reason}
        />
      </FormField>
      {took.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("ventures.nothingToSendBack")}
        </p>
      ) : (
        took.map((one) => (
          <div
            className="flex flex-col gap-3 rounded-lg border p-3"
            key={one.id}
          >
            <p className="text-sm font-medium">
              {`${nameOf(one.investorId)} · ${taka(one.amountBdt)} · ${one.reference}`}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id={`refund-day-${one.id}`}
                label={t("ventures.refundedOn")}
              >
                <Input
                  id={`refund-day-${one.id}`}
                  onChange={(event) =>
                    say(one.id, { movedOn: event.target.value })
                  }
                  type="date"
                  value={sentBack[one.id]?.movedOn ?? ""}
                />
              </FormField>
              <FormField
                id={`refund-reference-${one.id}`}
                label={t("ventures.reference")}
              >
                <Input
                  autoComplete="off"
                  id={`refund-reference-${one.id}`}
                  onChange={(event) =>
                    say(one.id, { reference: event.target.value })
                  }
                  value={sentBack[one.id]?.reference ?? ""}
                />
              </FormField>
            </div>
          </div>
        ))
      )}
    </FormSheet>
  );
};
