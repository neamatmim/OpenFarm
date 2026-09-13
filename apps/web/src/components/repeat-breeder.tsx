import type {
  FailedBecause,
  RepeatBreederDecision,
  ServiceMethod,
} from "@OpenFarm/domain";
import { REPEAT_BREEDER_DECISIONS } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
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
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [decision, setDecision] =
    useState<RepeatBreederDecision>("serve_again");
  const [note, setNote] = useState("");
  const answer = useMutation(
    orpc.breeding.answerRepeatBreeder.mutationOptions({
      onSuccess: async () => {
        setNote("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.breeding.key() }),
        ]);
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  return (
    <div className="space-y-1">
      <Link
        className="underline"
        params={{ tagNumber: row.tagNumber }}
        to="/animals/$tagNumber"
      >
        {row.tagNumber}
      </Link>{" "}
      ·{" "}
      {t("repeatBreeder.failedAttempts", {
        count: formatNumber(row.failedAttempts, language),
      })}
      <ul className="text-muted-foreground text-xs">
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
        <p className="text-muted-foreground text-xs">
          {t("repeatBreeder.lastAnswer", {
            decision: t(`repeatBreeder.${row.lastAnswer.decision}`),
            note: row.lastAnswer.note,
          })}
        </p>
      ) : null}
      {mayAnswer ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            answer.mutate({ tagNumber: row.tagNumber, decision, note });
          }}
        >
          <select
            aria-label={t("repeatBreeder.decision")}
            className="bg-background h-9 rounded-md border px-2 text-sm"
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
          </select>
          <Input
            aria-label={t("repeatBreeder.why")}
            className="w-48"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <Button
            disabled={!note.trim()}
            size="sm"
            type="submit"
            variant="outline"
          >
            {t("repeatBreeder.answer")}
          </Button>
        </form>
      ) : null}
    </div>
  );
};
