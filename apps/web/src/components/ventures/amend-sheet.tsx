import type { PaperDocument } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";

import { SegmentedControl } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import type { WordingSaid } from "@/components/ventures/paper-dialog";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import type { OwnWords } from "@/lib/saying";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The refusals only this sheet can meet, in the reader's own language. */
const WHY_NOT: OwnWords = {
  nobody_has_signed: "ventures.nobodyHasSigned",
  window_out_of_order: "ventures.windowOutOfOrder",
  agreements_in_app_off: "agreeInApp.refusal.agreements_in_app_off",
  investor_not_in_portal: "agreeInApp.refusal.someoneNotInPortal",
  amendment_already_proposed: "agreeInApp.refusal.amendment_already_proposed",
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

/** Clears the sheet's boxes, once saved or opened on another Venture. */
type Clear = () => void;

/** The sheet's two ways to save: amended on a paper everybody signed, its photograph with it, or offered to every
 *  Investor to agree to in the app. Either closes the sheet when done. */
const useAmendSaving = (done: Clear) => {
  const { t, language } = useLanguage();
  const refused = useRefused(WHY_NOT);
  const amending = useMutation(
    orpc.ventures.agreements.amend.mutationOptions({
      onError: refused,
      onSuccess: ({ agreements }) => {
        done();
        toast.success(
          t("ventures.amended", {
            count: formatNumber(agreements, language),
          })
        );
      },
    })
  );
  const offering = useMutation(
    orpc.ventures.agreements.amendments.propose.mutationOptions({
      onError: refused,
      onSuccess: () => {
        done();
        toast.success(t("agreeInApp.amendmentOffered"), {
          description: t("agreeInApp.amendmentOfferedHint"),
        });
      },
    })
  );
  return {
    amend: amending.mutate,
    offer: offering.mutate,
    pending: amending.isPending || offering.isPending,
  };
};

/** The signed paper's part of the sheet: the day everybody signed it, the paper to print, and its photograph. */
const ThePaperPart = ({
  amending,
  termsReady,
  signedOn,
  onSignedOn,
  paper,
  onPaper,
}: {
  amending: Amending;
  termsReady: boolean;
  signedOn: string;
  onSignedOn: (day: string) => void;
  paper: Photo | null;
  onPaper: (photo: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <FormField
        hint={t("ventures.amendSignedHint")}
        id="amend-signed"
        label={t("ventures.amendSignedOn")}
      >
        <Input
          id="amend-signed"
          onChange={(event) => onSignedOn(event.target.value)}
          type="date"
          value={signedOn}
        />
      </FormField>
      <PrintAmendment
        amending={amending}
        ready={termsReady && signedOn !== ""}
      />
      <FormField
        hint={t("ventures.amendPaperHint")}
        id="amend-paper"
        label={t("ventures.amendPaper")}
      >
        <PhotoField
          chosen={paper !== null}
          id="amend-paper"
          onPhoto={onPaper}
          takeLabel="ventures.paperTake"
        />
      </FormField>
    </>
  );
};

/** How it is agreed — on a paper everybody signs, or in the app — offered only while the farm's switch is on. */
const HowItIsAgreed = ({
  inApp,
  onChange,
}: {
  inApp: boolean;
  onChange: (inApp: boolean) => void;
}) => {
  const { t } = useLanguage();
  const investors = useQuery(orpc.investors.list.queryOptions());
  if (!(investors.data?.agreementsInApp ?? false)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" data-slot="form-label">
        {t("agreeInApp.how")}
      </span>
      <SegmentedControl
        label={t("agreeInApp.how")}
        name="amend-how"
        onChange={(how) => onChange(how === "in_app")}
        options={[
          { value: "paper", label: t("agreeInApp.onPaper") },
          { value: "in_app", label: t("agreeInApp.route") },
        ]}
        value={inApp ? "in_app" : "paper"}
      />
      {inApp ? (
        <p className="text-muted-foreground text-sm">
          {t("agreeInApp.amendSheetHint")}
        </p>
      ) : null}
    </div>
  );
};

/**
 * An Amendment to every Agreement on a Venture: the split and the Target Window it moves them to, why, and — signed on
 * paper — the day everybody signed it and its photograph; or, while the farm's switch is on, offered to every Investor
 * to agree to in the app instead.
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
  const { t } = useLanguage();
  const [percent, setPercent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [reason, setReason] = useState("");
  const [paper, setPaper] = useState<Photo | null>(null);
  const [inApp, setInApp] = useState(false);
  const clear = () => {
    setPercent("");
    setFrom("");
    setTo("");
    setSignedOn("");
    setReason("");
    setPaper(null);
    setInApp(false);
  };
  useFreshFor(venture?.id, clear);
  const saving = useAmendSaving(() => {
    clear();
    onOpenChange(false);
  });
  const share = Number(percent);
  // Said as two refusals rather than one chained comparison. A comparison written with an angle bracket
  // against a letter reads, to the guard that hunts for untranslated words, as a tag closing on text.
  const takesLessThanNothing = share < NONE;
  const takesMoreThanEverything = share > ALL;
  // What the paper needs; recording one signed needs the day and its photograph as well, one agreed in the app neither.
  const termsReady =
    venture !== null &&
    percent !== "" &&
    !Number.isNaN(share) &&
    !takesLessThanNothing &&
    !takesMoreThanEverything &&
    from !== "" &&
    to !== "" &&
    from <= to &&
    reason.trim() !== "";
  const signedReady = signedOn !== "" && paper !== null;
  const amending = {
    ventureId: venture?.id ?? "",
    investorsPercent: share,
    targetWindowStart: from,
    targetWindowEnd: to,
    signedOn,
    reason: reason.trim(),
  };
  return (
    <FormSheet
      description={t("ventures.amendHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (inApp) {
          saving.offer({
            ventureId: amending.ventureId,
            investorsPercent: share,
            targetWindowStart: from,
            targetWindowEnd: to,
            reason: amending.reason,
          });
          return;
        }
        if (paper) {
          saving.amend({ ...amending, ...paper });
        }
      }}
      open={open}
      pending={saving.pending}
      ready={termsReady && (inApp || signedReady)}
      submitLabel={inApp ? t("agreeInApp.offer") : t("ventures.amend")}
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
      <HowItIsAgreed inApp={inApp} onChange={setInApp} />
      {inApp ? null : (
        <ThePaperPart
          amending={amending}
          onPaper={setPaper}
          onSignedOn={setSignedOn}
          paper={paper}
          signedOn={signedOn}
          termsReady={termsReady}
        />
      )}
    </FormSheet>
  );
};
