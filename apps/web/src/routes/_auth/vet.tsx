import type { DoseRoute } from "@OpenFarm/domain";
import { MAX_COURSE_DAYS, ROUTES, farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import type { Course as CourseOfTreatment } from "@/components/course";
import { CourseLine, DoseLine } from "@/components/course";
import { RepeatBreeder } from "@/components/repeat-breeder";
import { SawFilter } from "@/components/saw-filter";
import { useLanguage, useT } from "@/i18n/language-provider";
import { refusalMessage, wordedRefusal } from "@/lib/correction-refusal";
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

      <RepeatBreeders />

      <VisitFee />

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

/**
 * The Vet's own fee for a visit: how much, the day, and the animals seen. The only money the Vet enters,
 * and the only money the Vet sees.
 */
const VisitFee = () => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [visitedOn, setVisitedOn] = useState(() => farmDayOf(new Date()));
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const fees = useQuery(orpc.money.myFees.queryOptions());
  const record = useMutation(
    orpc.money.vetFee.mutationOptions({
      onSuccess: async () => {
        setAmount("");
        setTags("");
        setNote("");
        toast.success(t("vetFee.recorded"));
        await queryClient.invalidateQueries({ queryKey: orpc.money.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("vetFee.title")}</h2>
      <form
        className="space-y-2 rounded-lg border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            amountBdt: Number(amount),
            visitedOn,
            // Tags as the Vet types them: separated by commas or spaces.
            animalTags: tags.split(/[\s,]+/u).filter(Boolean),
            note: note.trim() || undefined,
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="fee-amount">{t("vetFee.amount")}</Label>
          <Input
            id="fee-amount"
            min={0}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            value={amount}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fee-on">{t("vetFee.visitedOn")}</Label>
          <Input
            id="fee-on"
            onChange={(event) => setVisitedOn(event.target.value)}
            type="date"
            value={visitedOn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fee-tags">{t("vetFee.animals")}</Label>
          <Input
            id="fee-tags"
            onChange={(event) => setTags(event.target.value)}
            placeholder="D-0001, F-0002"
            value={tags}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fee-note">{t("vetFee.note")}</Label>
          <Input
            id="fee-note"
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </div>
        <Button
          disabled={!(Number(amount) > 0) || record.isPending}
          type="submit"
          variant="outline"
        >
          {t("vetFee.record")}
        </Button>
      </form>
      {fees.data?.length ? (
        <ul className="space-y-1 text-sm">
          {fees.data.map((fee) => (
            <li className="rounded-lg border p-2" key={fee.id}>
              {formatDate(fee.visitedOn, language)} · ৳
              {formatNumber(fee.amountBdt, language)}
              {fee.tagNumbers.length > 0
                ? ` · ${fee.tagNumbers.join(", ")}`
                : ""}
              {fee.note ? ` · ${fee.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

/** The cows that will not settle, for the Vet to decide on as well as the Manager. */
const RepeatBreeders = () => {
  const t = useT();
  const rows = useQuery(orpc.breeding.repeatBreeders.queryOptions());
  if (!rows.data?.length) {
    return null;
  }
  return (
    <section className="space-y-3">
      <h2 className="font-medium">{t("repeatBreeder.title")}</h2>
      <ul className="space-y-2">
        {rows.data.map((row) => (
          <li className="rounded-lg border p-2 text-sm" key={row.animalId}>
            <RepeatBreeder mayAnswer row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
};

/** The refusals a health screen has something of its own to say about. */
const REFUSALS: Record<string, MessageKey> = {
  no_treatment_sop: "prescribe.noTreatmentSop",
};

const reasonGiven = (error: unknown): string | null => {
  const refusal = (error as { data?: { refusal?: unknown } })?.data?.refusal;
  return typeof refusal === "string" ? refusal : null;
};

/** The refusal in the reader's own language where the server gave the facts to say it with,
 *  and the server's own words only when it did not. */
const useRefusal = () => {
  const t = useT();
  return (error: Error) => {
    const named = REFUSALS[reasonGiven(error) ?? ""];
    toast.error(
      named
        ? t(named)
        : (refusalMessage(error, t) ?? error.message ?? t("common.error"))
    );
  };
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

/**
 * The order itself: which product, how much, how it goes in, at what times and for how many
 * days. The farm turns it into one piece of work per dose, so the times are what somebody in
 * the shed will be asked to do something at.
 */
const Prescribe = ({
  diagnosisId,
  tagNumber,
  onPrescribed,
}: {
  diagnosisId: string;
  tagNumber: string;
  onPrescribed: () => void;
}) => {
  const t = useT();
  const onError = useRefusal();
  const [productId, setProductId] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState<DoseRoute>("intramuscular");
  const [times, setTimes] = useState("08:00");
  const [days, setDays] = useState("3");
  const drugs = useQuery(orpc.drugs.list.queryOptions());

  const write = useMutation(
    orpc.prescriptions.prescribe.mutationOptions({
      onSuccess: ({ doses }) => {
        setDose("");
        toast.success(t("prescribe.written", { doses: String(doses) }));
        onPrescribed();
      },
      onError,
    })
  );
  // Only what may actually be prescribed: a product whose withdrawal days nobody has written
  // is milk nobody could call safe afterwards, and offering it would only end in a refusal.
  const prescribable = (drugs.data ?? []).filter((one) => one.prescribable);

  return (
    <form
      className="space-y-2 border-t pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        write.mutate({
          animalTag: tagNumber,
          diagnosisId,
          productId,
          dose: dose.trim(),
          route,
          times: times
            .split(",")
            .map((time) => time.trim())
            .filter(Boolean),
          days: Number(days),
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`product-${diagnosisId}`}>
          {t("prescribe.product")}
        </Label>
        <select
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          id={`product-${diagnosisId}`}
          onChange={(event) => setProductId(event.target.value)}
          value={productId}
        >
          <option value="">—</option>
          {prescribable.map((one) => (
            <option key={one.id} value={one.id}>
              {one.nameBn}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`dose-${diagnosisId}`}>{t("prescribe.dose")}</Label>
        <Input
          id={`dose-${diagnosisId}`}
          onChange={(event) => setDose(event.target.value)}
          value={dose}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`route-${diagnosisId}`}>{t("prescribe.route")}</Label>
        <select
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          id={`route-${diagnosisId}`}
          onChange={(event) => setRoute(event.target.value as DoseRoute)}
          value={route}
        >
          {ROUTES.map((one) => (
            <option key={one} value={one}>
              {t(`route.${one}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`times-${diagnosisId}`}>{t("prescribe.times")}</Label>
          <Input
            id={`times-${diagnosisId}`}
            onChange={(event) => setTimes(event.target.value)}
            value={times}
          />
        </div>
        <div className="w-24 space-y-1">
          <Label htmlFor={`days-${diagnosisId}`}>{t("prescribe.days")}</Label>
          <Input
            id={`days-${diagnosisId}`}
            max={MAX_COURSE_DAYS}
            min={1}
            onChange={(event) => setDays(event.target.value)}
            step="1"
            type="number"
            value={days}
          />
        </div>
      </div>
      <Button disabled={!(productId && dose.trim())} type="submit">
        {t("prescribe.write")}
      </Button>
    </form>
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
    prescriptions: CourseOfTreatment[];
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

      {made.prescriptions.length > 0 ? (
        <ul className="space-y-2">
          {made.prescriptions.map((course) => (
            <li className="space-y-1 rounded-lg border p-2" key={course.id}>
              <p>
                <CourseLine course={course} />
              </p>
              <ul className="space-y-1">
                {course.doses.map((dose) => (
                  <DoseLine dose={dose} key={dose.id} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      <Prescribe
        diagnosisId={made.id}
        onPrescribed={onCorrected}
        tagNumber={made.tagNumber}
      />

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
