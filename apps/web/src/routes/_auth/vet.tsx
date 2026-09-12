import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * The Vet's screen, and the only one they need: what the rounds have seen and nobody has
 * answered, and what they have concluded themselves.
 *
 * The Vet is off-site more often than on it — they read this on their own phone, from their
 * own practice, and a Diagnosis they record here is their act in law. So there is no form
 * anywhere else for anyone to record one on their behalf.
 */
const VetPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const [saw, setSaw] = useState("");

  const kinds = useQuery(orpc.observations.kinds.queryOptions());
  const waiting = useQuery(
    orpc.diagnoses.waiting.queryOptions({
      input: saw ? { saw } : {},
    })
  );
  const mine = useQuery(orpc.diagnoses.mine.queryOptions({ input: {} }));

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.diagnoses.key() });

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("vet.title")}</h1>

      <section className="space-y-3">
        <h2 className="font-medium">{t("vet.waiting")}</h2>
        {/* Every choice a round offers is written down, the ones that say she is well
            included, and nothing in an SOP says which of them wants a Vet. So the Vet
            narrows the list by the word the farm used. */}
        <div className="flex flex-wrap gap-2">
          <FilterButton
            chosen={saw === ""}
            label={t("observations.all")}
            onChoose={() => setSaw("")}
          />
          {(kinds.data ?? []).map((kind) => (
            <FilterButton
              chosen={saw === kind.saw}
              key={kind.saw}
              label={kind.label}
              onChoose={() => setSaw(kind.saw)}
            />
          ))}
        </div>

        {waiting.data?.length ? (
          <ul className="space-y-2">
            {waiting.data.map((seen) => (
              <Unanswered key={seen.id} onRecorded={refresh} seen={seen} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("vet.nothingWaiting")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("vet.mine")}</h2>
        {mine.data?.length ? (
          <ul className="space-y-2">
            {mine.data.map((one) => (
              <Concluded key={one.id} made={one} onCorrected={refresh} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("vet.noneMine")}</p>
        )}
      </section>
    </div>
  );
};

const FilterButton = ({
  chosen,
  label,
  onChoose,
}: {
  chosen: boolean;
  label: string;
  onChoose: () => void;
}) => (
  <button
    className={`rounded-md border px-3 py-1 text-sm ${chosen ? "bg-neutral-800 text-neutral-100" : ""}`}
    onClick={onChoose}
    type="button"
  >
    {label}
  </button>
);

/** One thing a round saw that nobody has answered, and the Vet's answer to it. */
const Unanswered = ({
  seen,
  onRecorded,
}: {
  seen: {
    id: string;
    saw: string;
    sawLabel: string;
    seenAt: Date;
    tagNumber: string;
    seenByName: string | null;
  };
  onRecorded: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const [condition, setCondition] = useState("");
  const [note, setNote] = useState("");

  const record = useMutation(
    orpc.diagnoses.record.mutationOptions({
      onSuccess: () => {
        setCondition("");
        setNote("");
        toast.success(t("vet.recorded"));
        onRecorded();
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          className="font-medium underline"
          params={{ tagNumber: seen.tagNumber }}
          to="/animals/$tagNumber"
        >
          {seen.tagNumber}
        </Link>
        <span className="text-muted-foreground">
          {formatDate(new Date(seen.seenAt), language, "dateTime")}
        </span>
      </div>
      <p>
        {seen.sawLabel}
        {seen.seenByName ? ` · ${seen.seenByName}` : ""}
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            animalTag: seen.tagNumber,
            answers: seen.id,
            condition: { bn: condition.trim() },
            ...(note.trim() ? { note: note.trim() } : {}),
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`condition-${seen.id}`}>{t("vet.condition")}</Label>
          <Input
            id={`condition-${seen.id}`}
            onChange={(event) => setCondition(event.target.value)}
            value={condition}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`note-${seen.id}`}>{t("vet.note")}</Label>
          <Input
            id={`note-${seen.id}`}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </div>
        <Button disabled={!condition.trim()} type="submit">
          {t("vet.record")}
        </Button>
      </form>
    </li>
  );
};

/** One of the Vet's own conclusions, and the form to put it right. Nothing is deleted: the
 *  correction carries a reason and the trail keeps what it said before. */
const Concluded = ({
  made,
  onCorrected,
}: {
  made: {
    id: string;
    condition: string;
    note: string | null;
    diagnosedAt: Date;
    tagNumber: string;
    answers: { sawLabel: string } | null;
  };
  onCorrected: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState(made.condition);
  const [note, setNote] = useState(made.note ?? "");
  const [reason, setReason] = useState("");

  const correct = useMutation(
    orpc.diagnoses.correct.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setReason("");
        toast.success(t("vet.corrected"));
        onCorrected();
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          className="font-medium underline"
          params={{ tagNumber: made.tagNumber }}
          to="/animals/$tagNumber"
        >
          {made.tagNumber}
        </Link>
        <span className="text-muted-foreground">
          {formatDate(new Date(made.diagnosedAt), language, "dateTime")}
        </span>
      </div>
      <p>
        {made.condition}
        {made.answers
          ? ` · ${t("vet.answering", { saw: made.answers.sawLabel })}`
          : ""}
      </p>
      {made.note ? <p className="text-muted-foreground">{made.note}</p> : null}

      {open ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            correct.mutate({
              id: made.id,
              condition: { bn: condition.trim() },
              ...(note.trim() ? { note: note.trim() } : {}),
              reason: reason.trim(),
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`fix-condition-${made.id}`}>
              {t("vet.condition")}
            </Label>
            <Input
              id={`fix-condition-${made.id}`}
              onChange={(event) => setCondition(event.target.value)}
              value={condition}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`fix-note-${made.id}`}>{t("vet.note")}</Label>
            <Input
              id={`fix-note-${made.id}`}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`fix-reason-${made.id}`}>{t("vet.reason")}</Label>
            <Input
              id={`fix-reason-${made.id}`}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </div>
          <Button disabled={!(condition.trim() && reason.trim())} type="submit">
            {t("vet.saveCorrection")}
          </Button>
        </form>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("vet.correct")}
        </Button>
      )}
    </li>
  );
};

export const Route = createFileRoute("/_auth/vet")({
  /** The Vet's own screen. Everyone else is sent away rather than shown forms that would
   *  refuse them — a Diagnosis is not a permission the farm can grant. */
  beforeLoad: ({ context }) => {
    if (!context.me.roles.includes("vet")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: VetPage,
});
