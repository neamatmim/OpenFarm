import { farmDayOf } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { FormField, FormSheet, WorkedOut } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import {
  REFUSALS as PURCHASING_WORDS,
  PurchaseTermsFields,
  termsOfDraft,
  validPurchaseTerms,
} from "./feed-purchase-request";
import type { PurchaseTermsDraft } from "./feed-purchase-request";

export type FeedPurchase = Awaited<
  ReturnType<typeof orpc.feedPurchasing.list.call>
>[number];
export type PurchaseAction =
  | "approve"
  | "place"
  | "rejected"
  | "cancelled"
  | "closed";

export const PurchaseApprovalSheet = ({
  order,
  onClose,
}: {
  order: FeedPurchase;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const prefix = useId();
  const [draft, setDraft] = useState<PurchaseTermsDraft>({
    quantity: String(order.quantity),
    unitPriceMoney: String(order.unitPriceMoney),
    budgetMoney: String(order.budgetMoney),
  });
  const [reason, setReason] = useState("");
  const refused = useRefused(PURCHASING_WORDS);
  const approve = useMutation(
    orpc.feedPurchasing.approve.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("purchasing.saved"));
        onClose();
      },
    })
  );
  const isRevision = order.state !== "requested";
  const terms = termsOfDraft(draft);
  const ready =
    validPurchaseTerms(draft) &&
    terms.quantity >= order.received &&
    terms.budgetMoney >= order.spentMoney &&
    (!isRevision || reason.trim().length >= 3);
  return (
    <FormSheet
      title={t(isRevision ? "purchasing.revise" : "purchasing.approve")}
      description={t("purchasing.approveHint")}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={approve.isPending}
      ready={ready}
      submitLabel={t("purchasing.approve")}
      wide
      onSubmit={() => {
        if (ready) {
          approve.mutate({
            id: order.id,
            version: order.version,
            ...terms,
            reason: reason || undefined,
          });
        }
      }}
    >
      <WorkedOut>
        {order.supplierName} ·{" "}
        {t("purchasing.spent", { money: asMoney(order.spentMoney) })}
      </WorkedOut>
      <PurchaseTermsFields
        draft={draft}
        unit={order.unit}
        onChange={(field, value) =>
          setDraft((current) => ({ ...current, [field]: value }))
        }
      />
      <FormField
        id={`${prefix}-reason`}
        label={t("purchasing.reason")}
        hint={isRevision ? t("purchasing.reasonNeeded") : undefined}
      >
        <Input
          id={`${prefix}-reason`}
          value={reason}
          required={isRevision}
          minLength={isRevision ? 3 : undefined}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </FormSheet>
  );
};

export const PurchasePlaceSheet = ({
  order,
  onClose,
}: {
  order: FeedPurchase;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const prefix = useId();
  const [reference, setReference] = useState("");
  const [due, setDue] = useState(
    order.neededOn > farmDayOf(new Date())
      ? order.neededOn
      : farmDayOf(new Date())
  );
  const refused = useRefused(PURCHASING_WORDS);
  const arrivingLate = due > order.neededOn;
  const place = useMutation(
    orpc.feedPurchasing.place.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("purchasing.saved"));
        onClose();
      },
    })
  );
  return (
    <FormSheet
      title={t("purchasing.place")}
      description={t("purchasing.placeHint")}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={place.isPending}
      ready={!!reference.trim() && due >= farmDayOf(new Date())}
      submitLabel={t("purchasing.place")}
      onSubmit={() =>
        place.mutate({
          id: order.id,
          version: order.version,
          orderReference: reference,
          deliveryDueOn: due,
        })
      }
    >
      <WorkedOut>{order.supplierName}</WorkedOut>
      <FormField
        id={`${prefix}-reference`}
        label={t("purchasing.orderReference")}
      >
        <Input
          id={`${prefix}-reference`}
          value={reference}
          required
          maxLength={120}
          onChange={(event) => setReference(event.target.value)}
        />
      </FormField>
      <FormField id={`${prefix}-due`} label={t("purchasing.deliveryDue")}>
        <Input
          id={`${prefix}-due`}
          type="date"
          min={farmDayOf(new Date())}
          required
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
      </FormField>
      {arrivingLate ? (
        <WorkedOut>{t("purchasing.arrivingLate")}</WorkedOut>
      ) : null}
    </FormSheet>
  );
};

export const PurchaseEndSheet = ({
  order,
  outcome,
  onClose,
}: {
  order: FeedPurchase;
  outcome: "rejected" | "cancelled" | "closed";
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const prefix = useId();
  const [reason, setReason] = useState("");
  const refused = useRefused(PURCHASING_WORDS);
  const end = useMutation(
    orpc.feedPurchasing.end.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("purchasing.saved"));
        onClose();
      },
    })
  );
  return (
    <FormSheet
      title={t(`purchasing.action.${outcome}`)}
      description={t("purchasing.endHint")}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={end.isPending}
      ready={reason.trim().length >= 3}
      submitLabel={t(`purchasing.action.${outcome}`)}
      onSubmit={() =>
        end.mutate({ id: order.id, version: order.version, outcome, reason })
      }
    >
      <FormField id={`${prefix}-reason`} label={t("purchasing.reason")}>
        <Input
          id={`${prefix}-reason`}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </FormSheet>
  );
};
