import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useInvestorNames } from "@/components/investors/investor-names";
import { FormField, FormSheet, InsetPanel } from "@/components/page-kit";
import { FarmAccountField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
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
 * transfer number rather than a date. The Farm's own capital comes back to the Farm's own books, so where the Farm
 * had put some in, the sheet asks which of its bank accounts it went back into.
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
  const refused = useRefused();
  const asMoney = useMoney();
  const [reason, setReason] = useState("");
  const [sentBack, setSentBack] = useState<Record<string, SentBack>>({});
  const [farmAccountId, setFarmAccountId] = useState("");
  useFreshFor(venture?.id, () => {
    setReason("");
    setSentBack({});
    setFarmAccountId("");
  });
  const movements = useQuery({
    ...orpc.ventures.movements.list.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const nameOf = useInvestorNames();
  const took = (movements.data ?? []).filter(
    (one) => one.kind === "capital_in"
  );
  const agreements = useQuery({
    ...orpc.ventures.agreements.list.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const farmsOwn = new Set(
    (agreements.data ?? []).filter((one) => one.isFarm).map((one) => one.id)
  );
  const farmsComeBack = took.some(
    (one) => one.agreementId !== null && farmsOwn.has(one.agreementId)
  );
  const callingOff = useMutation(
    orpc.ventures.cancel.mutationOptions({
      onError: refused,
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
          ...(farmsComeBack && farmAccountId ? { farmAccountId } : {}),
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
      {farmsComeBack ? (
        <FarmAccountField
          id="call-off-farm-account"
          kind="bank"
          onChange={setFarmAccountId}
          value={farmAccountId}
        />
      ) : null}
      {took.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("ventures.nothingToSendBack")}
        </p>
      ) : (
        took.map((one) => (
          <InsetPanel className="flex flex-col gap-3" key={one.id}>
            <p className="text-sm font-medium">
              {`${nameOf(one.investorId)} · ${asMoney(one.amountMoney)} · ${one.reference}`}
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
          </InsetPanel>
        ))
      )}
    </FormSheet>
  );
};
