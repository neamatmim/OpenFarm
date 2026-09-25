import { ANSWER_LINE_MOST } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** What the Owner is answering: whose Request, for how many Units, and what a yes would make the Investor count. */
export interface Answering {
  requestId: string;
  name: string;
  units: number;
  /** Null for somebody already in a running Venture, whom signing adds nobody for. */
  ifYes: { countAfter: number; cap: number; atOrBeyondCap: boolean } | null;
}

/**
 * "Come and sign": the Units the farm will sign, the Units asked or fewer, with how many can still be promised said
 * beside the box — so the Owner never finds the ceiling by being refused — and, for somebody new, what signing them
 * would make the Investor count. At or past the Cap it warns and still lets her say yes: signing is what refuses.
 */
export const ComeAndSignSheet = ({
  answering,
  promisable,
  onOpenChange,
}: {
  answering: Answering;
  /** The Units still to be promised once the signed Agreements and the other yeses are counted. */
  promisable: number;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [units, setUnits] = useState(
    String(Math.min(answering.units, promisable))
  );
  const answer = useMutation(
    orpc.ventures.answerRequest.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("ventures.requests.answer.done"));
      },
    })
  );
  const asked = Number(units);
  // The most a yes can be: what they asked for, or what is left to promise, whichever is less.
  const most = Math.min(answering.units, promisable);
  const fits = Number.isInteger(asked) && asked >= 1 && most - asked >= 0;
  const { ifYes } = answering;
  return (
    <FormSheet
      description={answering.name}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        answer.mutate({
          requestId: answering.requestId,
          answer: { kind: "come_and_sign", units: asked },
        })
      }
      open
      pending={answer.isPending}
      ready={fits}
      submitLabel={t("ventures.requests.comeAndSign")}
      title={t("ventures.requests.comeAndSign")}
    >
      <FormField
        hint={`${t("ventures.requests.answer.askedFor", {
          units: formatNumber(answering.units, language),
        })} ${t("ventures.requests.answer.canPromise", {
          units: formatNumber(promisable, language),
        })}`}
        id="answer-units"
        label={t("ventures.requests.answer.units")}
      >
        <Input
          className="max-w-32"
          id="answer-units"
          inputMode="numeric"
          max={most}
          min={1}
          onChange={(event) => setUnits(event.target.value)}
          step={1}
          type="number"
          value={units}
        />
      </FormField>
      {ifYes === null ? null : (
        <Notice
          title={t("ventures.requests.comeAndSign")}
          tone={ifYes.atOrBeyondCap ? "warning" : "info"}
        >
          {t(
            ifYes.atOrBeyondCap
              ? "ventures.requests.answer.atTheCap"
              : "ventures.requests.answer.countAfter",
            {
              count: formatNumber(ifYes.countAfter, language),
              cap: formatNumber(ifYes.cap, language),
            }
          )}
        </Notice>
      )}
    </FormSheet>
  );
};

/** "Not this time", with a line to the Investor if the Owner likes: they read it on their own page, and nothing is
 *  sent to them. */
export const NotThisTimeSheet = ({
  answering,
  onOpenChange,
}: {
  answering: Answering;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [line, setLine] = useState("");
  const answer = useMutation(
    orpc.ventures.answerRequest.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("ventures.requests.answer.done"));
      },
    })
  );
  return (
    <FormSheet
      description={answering.name}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        answer.mutate({
          requestId: answering.requestId,
          answer: { kind: "not_this_time", line },
        })
      }
      open
      pending={answer.isPending}
      ready
      submitLabel={t("ventures.requests.notThisTime")}
      title={t("ventures.requests.notThisTime")}
    >
      <FormField
        hint={t("ventures.requests.answer.lineHint")}
        id="answer-line"
        label={t("ventures.requests.answer.line")}
      >
        <Textarea
          id="answer-line"
          maxLength={ANSWER_LINE_MOST}
          onChange={(event) => setLine(event.target.value)}
          rows={2}
          value={line}
        />
      </FormField>
    </FormSheet>
  );
};
