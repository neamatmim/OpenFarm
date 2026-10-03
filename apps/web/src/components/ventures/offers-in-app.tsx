import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Offer = Awaited<
  ReturnType<typeof client.ventures.agreementOffers>
>[number];

/** Why the farm would not approve or withdraw an offer, in the Owner's words. */
const OFFER_REFUSALS = {
  offer_not_agreed: "agreeInApp.refusal.offer_not_agreed",
  offer_withdrawn: "agreeInApp.refusal.offer_withdrawn",
  offer_already_approved: "agreeInApp.refusal.offer_already_approved",
  venture_units_gone: "agreeInApp.refusal.venture_units_gone",
  investor_cap_reached: "agreeInApp.refusal.investor_cap_reached",
} as const;

/** Long enough to read a code out to somebody and have them write it down. */
const CODE_SHOWN_FOR_MS = 20_000;

/** One offer still waiting: on the Investor to agree, or on the Owner to approve. */
const OfferLine = ({ offer }: { offer: Offer }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(OFFER_REFUSALS);
  const nameOf = useInvestorNames();
  const approving = useMutation(
    orpc.ventures.approveOffer.mutationOptions({
      onError: refused,
      onSuccess: (done) =>
        toast.success(t("ventures.signedWithCode", { code: done.payInCode }), {
          description: t("ventures.payInCodeHint"),
          duration: CODE_SHOWN_FOR_MS,
        }),
    })
  );
  const withdrawing = useMutation(
    orpc.ventures.withdrawOffer.mutationOptions({
      onError: refused,
      onSuccess: () => toast.success(t("agreeInApp.withdrawn")),
    })
  );
  const agreed = offer.standing === "agreed";
  const busy = approving.isPending || withdrawing.isPending;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{nameOf(offer.investorId)}</span>
        <span className="text-muted-foreground text-sm">
          {t("agreeInApp.offerTerms", {
            units: formatNumber(offer.units, language),
            percent: formatNumber(offer.investorsPercent, language),
          })}
          {" · "}
          {agreed && offer.agreedAt
            ? t("agreeInApp.agreedOn", {
                on: formatDate(offer.agreedAt, language, "dateTime"),
              })
            : t("agreeInApp.offeredOn", {
                on: formatDate(offer.offeredAt, language, "dateTime"),
              })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={agreed ? "success" : "info"}>
          {agreed
            ? t("agreeInApp.standing.agreed")
            : t("agreeInApp.standing.offered")}
        </StatusBadge>
        <Button
          disabled={busy}
          onClick={() => withdrawing.mutate({ offerId: offer.id })}
          size="sm"
          type="button"
          variant="outline"
        >
          <Undo2 aria-hidden data-icon="inline-start" />
          {t("agreeInApp.withdraw")}
        </Button>
        {agreed ? (
          <Button
            disabled={busy}
            onClick={() => approving.mutate({ offerId: offer.id })}
            size="sm"
            type="button"
          >
            <Check aria-hidden data-icon="inline-start" />
            {t("agreeInApp.approve")}
          </Button>
        ) : null}
      </div>
    </li>
  );
};

/**
 * The Agreements offered on a Venture to agree to in the app that are still waiting — on the Investor to agree in the
 * portal, or on the Owner to approve — each to withdraw, and to approve once agreed. Nothing while none waits.
 */
export const OffersInApp = ({ ventureId }: { ventureId: string }) => {
  const { t } = useLanguage();
  const offers = useQuery(
    orpc.ventures.agreementOffers.queryOptions({ input: { ventureId } })
  );
  const waiting = (offers.data ?? []).filter(
    (one) => one.standing === "offered" || one.standing === "agreed"
  );
  if (waiting.length === 0) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-1">
      <h3 className="text-sm font-medium">{t("agreeInApp.waitingTitle")}</h3>
      <p className="text-muted-foreground text-sm">
        {t("agreeInApp.waitingHint")}
      </p>
      <ul className="divide-border divide-y">
        {waiting.map((one) => (
          <OfferLine key={one.id} offer={one} />
        ))}
      </ul>
    </div>
  );
};
