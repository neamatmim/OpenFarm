import type {
  FailedBecause,
  RepeatBreederDecision,
  ServiceMethod,
} from "@OpenFarm/domain";
import { REPEAT_BREEDER_DECISIONS } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge, TagChip } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** A Repeat Breeder as the queue reads her. */
export interface RepeatBreederRow {
  tagNumber: string;
  failedAttempts: number;
  failures: {
    serviceId: string;
    servedAt: Date;
    method: ServiceMethod;
    sire: string | null;
    servedBy: string | null;
    why: FailedBecause;
  }[];
  lastAnswer: { decision: RepeatBreederDecision; note: string } | null;
}

const isDecision = (value: string): value is RepeatBreederDecision =>
  (REPEAT_BREEDER_DECISIONS as readonly string[]).includes(value);

/** The decision about her, in a dialog: serve her again, treat her, or cull her — and why. */
const DecisionDialog = ({
  tagNumber,
  open,
  onOpenChange,
}: {
  tagNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const refused = useRefused();
  const [decision, setDecision] =
    useState<RepeatBreederDecision>("serve_again");
  const [note, setNote] = useState("");
  const answer = useMutation(
    orpc.breeding.answerRepeatBreeder.mutationOptions({
      onSuccess: () => {
        setNote("");
        toast.success(t("repeatBreeder.answered"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const decisionId = `decision-${tagNumber}`;
  const whyId = `decision-why-${tagNumber}`;
  return (
    <FormDialog
      onOpenChange={onOpenChange}
      onSubmit={() => answer.mutate({ tagNumber, decision, note })}
      open={open}
      pending={answer.isPending}
      ready={note.trim() !== ""}
      submitLabel={t("repeatBreeder.answer")}
      title={`${t("repeatBreeder.answer")} — ${tagNumber}`}
    >
      <FormField id={decisionId} label={t("repeatBreeder.decision")}>
        <NativeSelect
          id={decisionId}
          onChange={(event) => {
            const chosen = event.target.value;
            if (isDecision(chosen)) {
              setDecision(chosen);
            }
          }}
          value={decision}
        >
          {REPEAT_BREEDER_DECISIONS.map((one) => (
            <option key={one} value={one}>
              {t(`repeatBreeder.${one}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={whyId} label={t("repeatBreeder.why")}>
        <Input
          id={whyId}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * A cow somebody has to decide about: what she has failed at — each attempt's day, how she was
 * served and by what sire, and whether the Vet found her empty or she came back into heat — what was
 * decided last time, and, for whoever may give it, the answer. Serve her again, treat her, or cull her:
 * a decision recorded, never a State changed.
 */
export const RepeatBreeder = ({
  row,
  mayAnswer,
}: {
  row: RepeatBreederRow;
  mayAnswer: boolean;
}) => {
  const { t, language } = useLanguage();
  const [answering, setAnswering] = useState(false);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded-md outline-none hover:underline focus-visible:ring-2"
            params={{ tagNumber: row.tagNumber }}
            to="/animals/$tagNumber"
          >
            <TagChip>{row.tagNumber}</TagChip>
          </Link>
          <StatusBadge tone="warning">
            {t("repeatBreeder.failedAttempts", {
              count: formatNumber(row.failedAttempts, language),
            })}
          </StatusBadge>
        </div>
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {row.failures.map((one) => (
            <li key={one.serviceId}>
              {formatDate(one.servedAt, language)} ·{" "}
              {t(one.method === "ai" ? "service.ai" : "service.natural")}
              {one.sire ? ` · ${one.sire}` : ""}
              {one.servedBy ? ` · ${one.servedBy}` : ""} ·{" "}
              {t(`repeatBreeder.why.${one.why}`)}
            </li>
          ))}
        </ul>
        {row.lastAnswer ? (
          <p className="text-sm">
            {t("repeatBreeder.lastAnswer", {
              decision: t(`repeatBreeder.${row.lastAnswer.decision}`),
              note: row.lastAnswer.note,
            })}
          </p>
        ) : null}
      </div>
      {mayAnswer ? (
        <>
          <Button
            className="h-11 self-start md:h-8"
            onClick={() => setAnswering(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Gavel aria-hidden data-icon="inline-start" />
            {t("repeatBreeder.answer")}
          </Button>
          <DecisionDialog
            onOpenChange={setAnswering}
            open={answering}
            tagNumber={row.tagNumber}
          />
        </>
      ) : null}
    </div>
  );
};
