import type { PaperDocument } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import type { OwnWords } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** The two refusals only this sheet can meet, in the reader's own language. */
const WHY_NOT: OwnWords = {
  nobody_has_signed: "ventures.nobodyHasSigned",
  window_out_of_order: "ventures.windowOutOfOrder",
};

/** Nothing of the profit, and all of it: the two ends a split may honestly sit on. */
const NONE = 0;
const ALL = 100;

/** The terms an Amendment moves the Venture to, as the paper to sign is laid out from them. */
interface Amending {
  ventureId: string;
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  signedOn: string;
  reason: string;
}

/**
 * The Amendment laid out from the terms on the sheet in the farm's current wording — one paper naming every Investor
 * on the Venture — to print and have them all sign before its photograph is taken.
 */
const PrintAmendment = ({
  amending,
  ready,
}: {
  amending: Amending;
  ready: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(WHY_NOT);
  const [shown, setShown] = useState<{
    paper: PaperDocument;
    wording: WordingSaid;
  } | null>(null);
  const laying = useMutation(
    orpc.investorStatements.amendmentToSign.mutationOptions({
      onSuccess: (done) =>
        setShown({ paper: done.document, wording: done.wording }),
      onError: refused,
    })
  );
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={!ready || laying.isPending}
        onClick={() => laying.mutate(amending)}
        type="button"
        variant="outline"
      >
        <FileText aria-hidden data-icon="inline-start" />
        {t("ventures.printAmendment")}
      </Button>
      <p className="text-muted-foreground text-sm">
        {t("ventures.printAmendmentHint")}
      </p>
      <PaperDialog
        onClose={() => setShown(null)}
        paper={shown?.paper ?? null}
        title={t("ventures.amendmentTitle")}
        wording={shown?.wording ?? null}
      />
    </div>
  );
};

/**
 * One paper amending every Agreement on a Venture.
 *
 * One act because it is one piece of paper: the terms move for everybody or for nobody, which is what
 * "signed by every Investor in that Venture" means when it is written down. What each of them signed at
 * the start is never edited — it stays legible beside what it became, and the farm can still say what a
 * man had agreed to on the day a thing happened.
 *
 * Only the split and the Target Window. Units are fixed once a Venture starts buying, and the cap, the
 * capital already taken and every share worked out since all rest on them.
 */
export const AmendSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(WHY_NOT);
  const [percent, setPercent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [reason, setReason] = useState("");
  const [paper, setPaper] = useState<Photo | null>(null);
  useFreshFor(venture?.id, () => {
    setPercent("");
    setFrom("");
    setTo("");
    setSignedOn("");
    setReason("");
    setPaper(null);
  });
  const amending = useMutation(
    orpc.ventures.amend.mutationOptions({
      onError: refused,
      onSuccess: ({ agreements }) => {
        setPercent("");
        setFrom("");
        setTo("");
        setSignedOn("");
        setReason("");
        setPaper(null);
        onOpenChange(false);
        toast.success(
          t("ventures.amended", {
            count: formatNumber(agreements, language),
          })
        );
      },
    })
  );
  const share = Number(percent);
  // Said as two refusals rather than one chained comparison. A comparison written with an angle bracket
  // against a letter reads, to the guard that hunts for untranslated words, as a tag closing on text.
  const takesLessThanNothing = share < NONE;
  const takesMoreThanEverything = share > ALL;
  // What the paper to sign needs; recording it needs the photograph of it signed as well.
  const termsReady =
    venture !== null &&
    percent !== "" &&
    !Number.isNaN(share) &&
    !takesLessThanNothing &&
    !takesMoreThanEverything &&
    from !== "" &&
    to !== "" &&
    from <= to &&
    signedOn !== "" &&
    reason.trim() !== "";
  const ready = termsReady && paper !== null;
  return (
    <FormSheet
      description={t("ventures.amendHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!paper) {
          return;
        }
        amending.mutate({
          ventureId: venture?.id ?? "",
          investorsPercent: share,
          targetWindowStart: from,
          targetWindowEnd: to,
          signedOn,
          reason: reason.trim(),
          ...paper,
        });
      }}
      open={open}
      pending={amending.isPending}
      ready={ready}
      submitLabel={t("ventures.amend")}
      title={t("ventures.amend")}
    >
      <FormField
        hint={t("ventures.amendSplitHint")}
        id="amend-percent"
        label={t("ventures.amendShare")}
      >
        <Input
          id="amend-percent"
          inputMode="numeric"
          onChange={(event) => setPercent(event.target.value)}
          type="number"
          value={percent}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="amend-from" label={t("ventures.windowFrom")}>
          <Input
            id="amend-from"
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </FormField>
        <FormField id="amend-to" label={t("ventures.windowTo")}>
          <Input
            id="amend-to"
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </FormField>
      </div>
      <FormField
        hint={t("ventures.amendSignedHint")}
        id="amend-signed"
        label={t("ventures.amendSignedOn")}
      >
        <Input
          id="amend-signed"
          onChange={(event) => setSignedOn(event.target.value)}
          type="date"
          value={signedOn}
        />
      </FormField>
      <FormField
        hint={t("ventures.amendReasonHint")}
        id="amend-reason"
        label={t("ventures.amendReason")}
      >
        <Input
          id="amend-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </FormField>
      <PrintAmendment
        amending={{
          ventureId: venture?.id ?? "",
          investorsPercent: share,
          targetWindowStart: from,
          targetWindowEnd: to,
          signedOn,
          reason: reason.trim(),
        }}
        ready={termsReady}
      />
      <FormField
        hint={t("ventures.amendPaperHint")}
        id="amend-paper"
        label={t("ventures.amendPaper")}
      >
        <PhotoField
          chosen={paper !== null}
          id="amend-paper"
          onPhoto={setPaper}
          takeLabel="ventures.paperTake"
        />
      </FormField>
    </FormSheet>
  );
};
