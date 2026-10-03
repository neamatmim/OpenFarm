import { useMutation } from "@tanstack/react-query";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { figure, words } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

/** A buying outing put right — where it went, or what a part of it cost — with the reason; every animal that came home
 *  on it carries her share of the new figure at once. */
export const BuyingTripCorrection = ({
  trip,
}: {
  trip: {
    id: string;
    wentTo: string;
    parts: { brokerMoney: number; transportMoney: number; keepMoney: number };
  };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    wentTo: words(trip.wentTo),
    brokerMoney: figure(trip.parts.brokerMoney),
    transportMoney: figure(trip.parts.transportMoney),
    keepMoney: figure(trip.parts.keepMoney),
  });
  const correct = useMutation(orpc.buyingTrips.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: trip.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.buyingTrip")}
    >
      <CorrectionAnswer
        label={t("intake.tripLivestockMarket")}
        onChange={(value) => correcting.set("wentTo", value)}
        value={correcting.typed.wentTo ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <CorrectionAnswer
          inputMode="numeric"
          label={t("intake.tripBroker")}
          onChange={(value) => correcting.set("brokerMoney", value)}
          type="number"
          value={correcting.typed.brokerMoney ?? ""}
        />
        <CorrectionAnswer
          inputMode="numeric"
          label={t("intake.tripTransport")}
          onChange={(value) => correcting.set("transportMoney", value)}
          type="number"
          value={correcting.typed.transportMoney ?? ""}
        />
        <CorrectionAnswer
          inputMode="numeric"
          label={t("intake.tripKeep")}
          onChange={(value) => correcting.set("keepMoney", value)}
          type="number"
          value={correcting.typed.keepMoney ?? ""}
        />
      </div>
    </CorrectionDialog>
  );
};

/** A selling outing put right — where it went, or what a part of it cost — with the reason; every animal taken on it
 *  carries her share of the new figure at once. */
export const SellingTripCorrection = ({
  trip,
}: {
  trip: {
    id: string;
    wentTo: string;
    parts: { transportMoney: number; keepMoney: number };
  };
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    wentTo: words(trip.wentTo),
    transportMoney: figure(trip.parts.transportMoney),
    keepMoney: figure(trip.parts.keepMoney),
  });
  const correct = useMutation(orpc.sellingTrips.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: trip.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed}
      title={t("correct.sellingTrip")}
    >
      <CorrectionAnswer
        label={t("selling.wentTo")}
        onChange={(value) => correcting.set("wentTo", value)}
        value={correcting.typed.wentTo ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="numeric"
          label={t("selling.transport")}
          onChange={(value) => correcting.set("transportMoney", value)}
          type="number"
          value={correcting.typed.transportMoney ?? ""}
        />
        <CorrectionAnswer
          inputMode="numeric"
          label={t("selling.keep")}
          onChange={(value) => correcting.set("keepMoney", value)}
          type="number"
          value={correcting.typed.keepMoney ?? ""}
        />
      </div>
    </CorrectionDialog>
  );
};
