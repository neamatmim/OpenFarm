import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import type { Photo } from "@/lib/photo";
import { sayWhy } from "@/lib/saying";
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
  const queryClient = useQueryClient();
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
      onError: (error) => toast.error(sayWhy(error, t, WHY_NOT)),
      onSuccess: async ({ agreements }) => {
        setPercent("");
        setFrom("");
        setTo("");
        setSignedOn("");
        setReason("");
        setPaper(null);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
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
  const ready =
    venture !== null &&
    percent !== "" &&
    !Number.isNaN(share) &&
    !takesLessThanNothing &&
    !takesMoreThanEverything &&
    from !== "" &&
    to !== "" &&
    from <= to &&
    signedOn !== "" &&
    reason.trim() !== "" &&
    paper !== null;
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
