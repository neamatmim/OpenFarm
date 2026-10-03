import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Handshake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/page";
import { usePreviewing } from "@/components/portal/portal-source";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Offer = Awaited<ReturnType<typeof client.portal.agreementOffers>>[number];

/** Why the farm would not take their agreement, in the Investor's words. */
const REFUSALS = {
  agreements_in_app_off: "agreeInApp.refusal.agreements_in_app_off",
  offer_withdrawn: "agreeInApp.refusal.offer_withdrawn",
  paper_changed_since: "agreeInApp.refusal.paper_changed_since",
  not_an_investor: "portal.refused.notAnInvestor",
  signed_in_too_long: "portal.endedHint",
} as const;

/** One Agreement offered to them: what it is, and the paper to read and agree to — or, agreed, that the farm will
 *  approve it. */
const OfferNotice = ({ offer }: { offer: Offer }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [reading, setReading] = useState(false);
  const agreeing = useMutation(
    orpc.portal.agreeToOffer.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setReading(false);
        toast.success(t("agreeInApp.portal.agreedDone"));
      },
    })
  );
  const agreed = offer.agreedAt !== null;
  return (
    <Notice
      icon={Handshake}
      title={t("agreeInApp.portal.title", { venture: offer.ventureName })}
      tone={agreed ? "success" : "info"}
    >
      <div className="flex flex-col gap-3">
        <p>
          {agreed
            ? t("agreeInApp.portal.agreedHint")
            : t("agreeInApp.portal.hint", {
                units: formatNumber(offer.units, language),
                percent: formatNumber(offer.investorsPercent, language),
              })}
        </p>
        <Button
          className="self-start"
          onClick={() => setReading(true)}
          size="sm"
          type="button"
          variant={agreed ? "outline" : "default"}
        >
          <Eye aria-hidden data-icon="inline-start" />
          {agreed
            ? t("agreeInApp.portal.readAgain")
            : t("agreeInApp.portal.read")}
        </Button>
      </div>
      <PaperDialog
        action={
          agreed ? undefined : (
            <Button
              disabled={agreeing.isPending}
              onClick={() =>
                agreeing.mutate({
                  offerId: offer.id,
                  paperHash: offer.paperHash,
                })
              }
              type="button"
            >
              <Handshake aria-hidden data-icon="inline-start" />
              {t("agreeInApp.portal.agree")}
            </Button>
          )
        }
        description={agreed ? undefined : t("agreeInApp.portal.agreeHint")}
        onClose={() => setReading(false)}
        paper={reading ? offer.paper : null}
        title={t("agreeInApp.portal.paperTitle")}
        wording={null}
      />
    </Notice>
  );
};

/**
 * The Agreements the farm has offered them to agree to in the app, at the top of their home: each to read in full and
 * agree to with one press, and, agreed, waiting on the Owner's approval. Nothing while none is offered, and nothing in
 * the Owner's preview of the portal — an Investor's agreement is theirs to give.
 */
export const AgreeInApp = () => {
  const previewing = usePreviewing() !== null;
  const offers = useQuery({
    ...orpc.portal.agreementOffers.queryOptions(),
    enabled: !previewing,
  });
  if (previewing) {
    return null;
  }
  return (
    <>
      {(offers.data ?? []).map((one) => (
        <OfferNotice key={one.id} offer={one} />
      ))}
    </>
  );
};
