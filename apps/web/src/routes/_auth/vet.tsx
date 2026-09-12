import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SawFilter } from "@/components/saw-filter";
import { useLanguage, useT } from "@/i18n/language-provider";
import { refusalMessage } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

/** What the Vet types either way: the disease, and what they found. */
interface Conclusion {
  disease: string;
  note: string;
}

const emptyConclusion: Conclusion = { disease: "", note: "" };

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
    orpc.diagnoses.waiting.queryOptions({ input: saw ? { saw } : {} })
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
        <SawFilter chosen={saw} kinds={kinds.data ?? []} onChoose={setSaw} />

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

      <OnItsOwn onRecorded={refresh} />

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

/** The refusal in the reader's own language where the server gave the facts to say it with,
 *  and the server's own words only when it did not. */
const useRefusal = () => {
  const t = useT();
  return (error: Error) =>
    toast.error(refusalMessage(error, t) ?? error.message ?? t("common.error"));
};

/** The disease and what was found — the two fields a Diagnosis is, wherever it is typed. */
const ConclusionFields = ({
  conclusion,
  idPrefix,
  onChange,
}: {
  conclusion: Conclusion;
  idPrefix: string;
  onChange: (next: Conclusion) => void;
}) => {
  const t = useT();
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`disease-${idPrefix}`}>{t("vet.disease")}</Label>
        <Input
          id={`disease-${idPrefix}`}
          onChange={(event) =>
            onChange({ ...conclusion, disease: event.target.value })
          }
          value={conclusion.disease}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`note-${idPrefix}`}>{t("vet.note")}</Label>
        <Input
          id={`note-${idPrefix}`}
          onChange={(event) =>
            onChange({ ...conclusion, note: event.target.value })
          }
          value={conclusion.note}
        />
      </div>
    </>
  );
};

/** What the server wants: the typed disease and note, trimmed, the note left out when blank. */
const asRecorded = (conclusion: Conclusion) => ({
  disease: { bn: conclusion.disease.trim() },
  ...(conclusion.note.trim() ? { note: conclusion.note.trim() } : {}),
});

/** One thing a round saw that nobody has answered, and the Vet's answer to it. */
const Unanswered = ({
  seen,
  onRecorded,
}: {
  seen: {
    id: string;
    sawLabel: string;
    seenAt: Date;
    tagNumber: string;
    seenByName: string | null;
  };
  onRecorded: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const onError = useRefusal();
  const [conclusion, setConclusion] = useState(emptyConclusion);

  const record = useMutation(
    orpc.diagnoses.record.mutationOptions({
      onSuccess: () => {
        setConclusion(emptyConclusion);
        toast.success(t("vet.recorded"));
        onRecorded();
      },
      onError,
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
            ...asRecorded(conclusion),
          });
        }}
      >
        <ConclusionFields
          conclusion={conclusion}
          idPrefix={seen.id}
          onChange={setConclusion}
        />
        <Button disabled={!conclusion.disease.trim()} type="submit">
          {t("vet.record")}
        </Button>
      </form>
    </li>
  );
};

/** The Vet came for one cow and found something on another: a Diagnosis that answers no
 *  Observation, on whichever animal they name. */
const OnItsOwn = ({ onRecorded }: { onRecorded: () => void }) => {
  const t = useT();
  const onError = useRefusal();
  const [tagNumber, setTagNumber] = useState("");
  const [conclusion, setConclusion] = useState(emptyConclusion);

  const record = useMutation(
    orpc.diagnoses.record.mutationOptions({
      onSuccess: () => {
        setTagNumber("");
        setConclusion(emptyConclusion);
        toast.success(t("vet.recorded"));
        onRecorded();
      },
      onError,
    })
  );

  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">{t("vet.onItsOwn")}</h2>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            animalTag: tagNumber.trim(),
            ...asRecorded(conclusion),
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="own-tag">{t("vet.tagNumber")}</Label>
          <Input
            id="own-tag"
            onChange={(event) => setTagNumber(event.target.value)}
            value={tagNumber}
          />
        </div>
        <ConclusionFields
          conclusion={conclusion}
          idPrefix="own"
          onChange={setConclusion}
        />
        <Button
          disabled={!(tagNumber.trim() && conclusion.disease.trim())}
          type="submit"
        >
          {t("vet.record")}
        </Button>
      </form>
    </section>
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
    disease: string;
    note: string | null;
    diagnosedAt: Date;
    tagNumber: string;
    answers: { sawLabel: string } | null;
  };
  onCorrected: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const onError = useRefusal();
  const [open, setOpen] = useState(false);
  const [conclusion, setConclusion] = useState<Conclusion>({
    disease: made.disease,
    note: made.note ?? "",
  });
  const [reason, setReason] = useState("");

  const correct = useMutation(
    orpc.diagnoses.correct.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setReason("");
        toast.success(t("vet.corrected"));
        onCorrected();
      },
      onError,
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
        {made.disease}
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
              ...asRecorded(conclusion),
              reason: reason.trim(),
            });
          }}
        >
          <ConclusionFields
            conclusion={conclusion}
            idPrefix={`fix-${made.id}`}
            onChange={setConclusion}
          />
          <div className="space-y-1">
            <Label htmlFor={`fix-reason-${made.id}`}>{t("vet.reason")}</Label>
            <Input
              id={`fix-reason-${made.id}`}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </div>
          <Button
            disabled={!(conclusion.disease.trim() && reason.trim())}
            type="submit"
          >
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
