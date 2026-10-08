import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Handshake, MessageSquareLock, Undo2 } from "lucide-react";
import { useState } from "react";

import { Notice } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { usePreviewing } from "@/components/portal/portal-source";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Offer = Awaited<ReturnType<typeof client.portal.agreementOffers>>[number];

/** Why the farm would not take their agreement, in the Investor's words. */
const REFUSALS = {
  agreements_in_app_off: "agreeInApp.refusal.agreements_in_app_off",
  offer_withdrawn: "agreeInApp.refusal.offer_withdrawn",
  // Canceled, buying or settled since it was offered: nothing agreed now could be approved.
  venture_wrong_state: "agreeInApp.refusal.venture_moved_on",
  already_approved: "agreeInApp.refusal.venture_moved_on",
  paper_changed_since: "agreeInApp.refusal.paper_changed_since",
  not_an_investor: "portal.refused.notAnInvestor",
  signed_in_too_long: "portal.endedHint",
  // The code that seals it (ADR 0022).
  wrong_code: "agreeInApp.refusal.wrong_code",
  code_expired: "agreeInApp.refusal.code_expired",
  code_used: "agreeInApp.refusal.code_used",
  too_many_codes: "agreeInApp.refusal.too_many_codes",
  code_sent_just_now: "agreeInApp.refusal.code_sent_just_now",
  code_not_sent: "agreeInApp.refusal.code_not_sent",
  no_signing_clause: "agreeInApp.refusal.no_signing_clause",
  no_way_to_send_a_code: "agreeInApp.refusal.no_way_to_send_a_code",
  already_agreed: "agreeInApp.refusal.already_agreed",
  // Approved by the farm a moment before, whichever paper it is.
  offer_already_approved: "agreeInApp.portal.alreadyApproved",
} as const;

type AmendmentOffer = Awaited<
  ReturnType<typeof client.portal.amendmentOffers>
>[number];

type NominationOffer = Awaited<
  ReturnType<typeof client.portal.nominationOffers>
>[number];

/** What a Signing Code seals: each kind of paper offered in the app, as the farm names them. */
type SignedKind = Parameters<typeof client.portal.withdrawAgreement>[0]["kind"];

/** Where the farm sent the codes for a paper, mostly hidden, and how long they work. */
type Sent = Awaited<ReturnType<typeof client.portal.sendSigningCode>>;

/** Where the codes went, mostly hidden: by text, by email, or both. */
const sentSaid = (sent: Sent, t: ReturnType<typeof useLanguage>["t"]) => {
  const { minutes } = sent;
  if (sent.bySms && sent.byEmail) {
    return t("agreeInApp.portal.codeSentBoth", {
      phone: sent.bySms,
      email: sent.byEmail,
      minutes,
    });
  }
  return sent.bySms
    ? t("agreeInApp.portal.codeSentSms", { phone: sent.bySms, minutes })
    : t("agreeInApp.portal.codeSentEmail", {
        email: sent.byEmail ?? "",
        minutes,
      });
};

/**
 * The paper offered, to read in full, and beneath its title the way to agree until they have: a code the farm sends by
 * text and to their confirmed email, entered here — which is their agreement, as their signature would be (ADR 0022).
 */
const ReadAndAgree = ({
  kind,
  offerId,
  title,
  paper,
  agreed,
  pending,
  onAgree,
  onClose,
}: {
  kind: SignedKind;
  offerId: string;
  title: string;
  paper: Offer["paper"] | null;
  agreed: boolean;
  pending: boolean;
  onAgree: (code: string) => void;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const sending = useMutation(
    orpc.portal.sendSigningCode.mutationOptions({
      onError: refused,
      onSuccess: setSent,
    })
  );
  const send = () => sending.mutate({ kind, offerId });
  const asking = sent ? (
    <form
      className="flex flex-wrap items-center gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim() !== "") {
          onAgree(code);
        }
      }}
    >
      <Input
        aria-label={t("agreeInApp.portal.code")}
        autoComplete="one-time-code"
        className="w-32 tracking-widest tabular-nums"
        inputMode="numeric"
        maxLength={12}
        onChange={(event) => setCode(event.target.value)}
        placeholder={t("agreeInApp.portal.code")}
        value={code}
      />
      <Button disabled={pending || code.trim() === ""} type="submit">
        <Handshake aria-hidden data-icon="inline-start" />
        {t("agreeInApp.portal.agree")}
      </Button>
      <Button
        disabled={sending.isPending}
        onClick={send}
        type="button"
        variant="outline"
      >
        {t("agreeInApp.portal.sendAgain")}
      </Button>
    </form>
  ) : (
    <Button disabled={sending.isPending} onClick={send} type="button">
      <MessageSquareLock aria-hidden data-icon="inline-start" />
      {t("agreeInApp.portal.sendCode")}
    </Button>
  );
  // Where the codes went once sent; until then, how agreeing works.
  const description = sent
    ? sentSaid(sent, t)
    : t("agreeInApp.portal.agreeHint");
  return (
    <PaperDialog
      action={agreed ? undefined : asking}
      description={agreed ? undefined : description}
      onClose={() => {
        setSent(null);
        setCode("");
        onClose();
      }}
      paper={paper}
      title={title}
      wording={null}
    />
  );
};

/** Why the farm would not take back their agreement, in their words: approved already, it is theirs to keep. */
const WITHDRAW_REFUSALS = {
  offer_withdrawn: "agreeInApp.refusal.offer_withdrawn",
  not_an_investor: "portal.refused.notAnInvestor",
  signed_in_too_long: "portal.endedHint",
} as const;

/**
 * Taking back their agreement to a paper before the farm approves it: with the farm's approval last, their agreement is
 * their offer, theirs to withdraw (ADR 0022). Asked about first; withdrawn, the paper waits on them again.
 */
const WithdrawAgreement = ({
  kind,
  offerId,
}: {
  kind: SignedKind;
  offerId: string;
}) => {
  const { t } = useLanguage();
  // Approved already, it is part of what they signed — or, a মনোনয়নপত্র, their list in force.
  const refused = useRefused({
    ...WITHDRAW_REFUSALS,
    offer_already_approved:
      kind === "nomination_offer"
        ? "agreeInApp.portal.nominationApproved"
        : "agreeInApp.portal.withdrawTooLate",
  });
  const [asking, setAsking] = useState(false);
  const withdrawing = useMutation(
    orpc.portal.withdrawAgreement.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("agreeInApp.portal.withdrawn"));
      },
    })
  );
  return (
    <>
      <Button
        className="self-start"
        onClick={() => setAsking(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Undo2 aria-hidden data-icon="inline-start" />
        {t("agreeInApp.portal.withdraw")}
      </Button>
      <ConfirmDialog
        confirmLabel={t("agreeInApp.portal.withdraw")}
        description={t("agreeInApp.portal.withdrawWhy")}
        onConfirm={() => withdrawing.mutate({ kind, offerId })}
        onOpenChange={setAsking}
        open={asking}
        pending={withdrawing.isPending}
        title={t("agreeInApp.portal.withdrawTitle")}
      />
    </>
  );
};

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
        {agreed ? (
          <WithdrawAgreement kind="agreement_offer" offerId={offer.id} />
        ) : null}
      </div>
      <ReadAndAgree
        agreed={agreed}
        kind="agreement_offer"
        offerId={offer.id}
        onAgree={(code) =>
          agreeing.mutate({
            offerId: offer.id,
            paperHash: offer.paperHash,
            code,
          })
        }
        onClose={() => setReading(false)}
        paper={reading ? offer.paper : null}
        pending={agreeing.isPending}
        title={t("agreeInApp.portal.paperTitle")}
      />
    </Notice>
  );
};

/** One Amendment offered on a Venture they are in: what it moves their terms to, and the paper to read and agree to. */
const AmendmentNotice = ({ offer }: { offer: AmendmentOffer }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [reading, setReading] = useState(false);
  const agreeing = useMutation(
    orpc.portal.agreeToAmendment.mutationOptions({
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
      title={t("agreeInApp.portal.amendmentTitle", {
        venture: offer.ventureName,
      })}
      tone={agreed ? "success" : "info"}
    >
      <div className="flex flex-col gap-3">
        <p>
          {agreed
            ? t("agreeInApp.portal.amendmentAgreedHint")
            : t("agreeInApp.portal.amendmentHint", {
                percent: formatNumber(offer.investorsPercent, language),
                from: formatDate(new Date(offer.targetWindowStart), language),
                to: formatDate(new Date(offer.targetWindowEnd), language),
                reason: offer.reason,
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
            : t("agreeInApp.portal.readAmendment")}
        </Button>
        {agreed ? (
          <WithdrawAgreement kind="amendment_offer" offerId={offer.id} />
        ) : null}
      </div>
      <ReadAndAgree
        agreed={agreed}
        kind="amendment_offer"
        offerId={offer.id}
        onAgree={(code) =>
          agreeing.mutate({
            offerId: offer.id,
            paperHash: offer.paperHash,
            code,
          })
        }
        onClose={() => setReading(false)}
        paper={reading ? offer.paper : null}
        pending={agreeing.isPending}
        title={t("agreeInApp.portal.amendmentPaperTitle")}
      />
    </Notice>
  );
};

/** The মনোনয়নপত্র the farm has offered them: their new list of Nominees, to read and agree to, or — agreed — waiting on
 *  the farm's approval. */
const NominationNotice = ({ offer }: { offer: NominationOffer }) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [reading, setReading] = useState(false);
  const agreeing = useMutation(
    orpc.portal.agreeToNomination.mutationOptions({
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
      title={t("agreeInApp.portal.nominationTitle")}
      tone={agreed ? "success" : "info"}
    >
      <div className="flex flex-col gap-3">
        <p>
          {t(
            agreed
              ? "agreeInApp.portal.nominationAgreedHint"
              : "agreeInApp.portal.nominationHint"
          )}
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
            : t("agreeInApp.portal.readNomination")}
        </Button>
        {agreed ? (
          <WithdrawAgreement kind="nomination_offer" offerId={offer.id} />
        ) : null}
      </div>
      <ReadAndAgree
        agreed={agreed}
        kind="nomination_offer"
        offerId={offer.id}
        onAgree={(code) =>
          agreeing.mutate({
            offerId: offer.id,
            paperHash: offer.paperHash,
            code,
          })
        }
        onClose={() => setReading(false)}
        paper={reading ? offer.paper : null}
        pending={agreeing.isPending}
        title={t("agreeInApp.portal.nominationPaperTitle")}
      />
    </Notice>
  );
};

/**
 * The Agreements the farm has offered them to agree to in the app, at the top of their home: each to read in full and
 * agree to with a code the farm sends them, and, agreed, waiting on the Owner's approval. Nothing while none is offered, and nothing in
 * the Owner's preview of the portal — an Investor's agreement is theirs to give.
 */
export const AgreeInApp = () => {
  const previewing = usePreviewing() !== null;
  const offers = useQuery({
    ...orpc.portal.agreementOffers.queryOptions(),
    enabled: !previewing,
  });
  const amendments = useQuery({
    ...orpc.portal.amendmentOffers.queryOptions(),
    enabled: !previewing,
  });
  const nominations = useQuery({
    ...orpc.portal.nominationOffers.queryOptions(),
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
      {(amendments.data ?? []).map((one) => (
        <AmendmentNotice key={one.id} offer={one} />
      ))}
      {(nominations.data ?? []).map((one) => (
        <NominationNotice key={one.id} offer={one} />
      ))}
    </>
  );
};
