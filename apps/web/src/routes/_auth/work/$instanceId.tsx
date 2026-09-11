import type {
  Evidence,
  MilkDestination,
  SopContent,
  Step,
} from "@OpenFarm/domain";
import { MILK_DESTINATIONS, isClosingStep } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Check, Lock, SprayCan } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

interface Animal {
  id: string;
  tagNumber: string;
  photoUpdatedAt: Date | null;
  /** Her milk cannot go to the tank: the tile locks and the sheet offers Discard only. */
  underMilkWithdrawal: boolean;
}

/** What the server's effect decided, shown back to the person who recorded it — the tank
 *  reading against what the cows account for, and whether that needs the Manager. */
interface BulkOutcome {
  differenceLitres: number;
  flagged: boolean;
}
interface Completion {
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
}

const outOfRangeOf = (
  evidence: Evidence | undefined,
  value: number
): string | null => {
  if (!evidence) {
    return null;
  }
  if (evidence.min !== undefined && value < evidence.min) {
    return `below ${evidence.min}`;
  }
  if (evidence.max !== undefined && value > evidence.max) {
    return `above ${evidence.max}`;
  }
  return null;
};

/** The pen board: chips for the Steps that happen once, the Pen's animals as photo tiles in
 *  any order, and the closing Step only when everything else is done. */
const WorkPage = () => {
  const { instanceId } = Route.useParams();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [openAnimal, setOpenAnimal] = useState<Animal | null>(null);
  const [openStep, setOpenStep] = useState<Step | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const instance = useQuery(
    orpc.instances.get.queryOptions({ input: { id: instanceId } })
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const claim = useMutation(
    orpc.instances.claim.mutationOptions({ onSuccess: refresh, onError })
  );
  const record = useMutation(
    orpc.instances.completeStep.mutationOptions({
      onSuccess: ({ effect }) => {
        setOutcome(effect?.kind === "bulk_total" ? effect : null);
        // The server, not this phone, decides where milk under a Withdrawal goes — so say
        // so when it has overruled what was asked for.
        if (effect?.kind === "milk_record" && effect.forced) {
          toast.warning(t("milk.forced"));
        }
        setOpenAnimal(null);
        setOpenStep(null);
        refresh();
      },
      onError,
    })
  );
  const finish = useMutation(
    orpc.instances.complete.mutationOptions({
      onSuccess: () => {
        toast.success(t("work.finished"));
        navigate({ to: "/today" });
      },
      onError,
    })
  );

  if (!instance.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }

  const { content, animals, completions, state } = instance.data as unknown as {
    content: SopContent;
    animals: Animal[];
    completions: Completion[];
    state: string;
  };
  const perAnimalStep = content.steps.find((step) => step.repeatPerAnimal);
  // The closing Step is the last one *and* not per-animal: a Playbook whose last Step
  // repeats per cow has no closing Step, and a one-Step SOP finishes on that Step.
  const closingStep = content.steps.find((step) =>
    isClosingStep(content, step)
  );
  const chipSteps = content.steps.filter(
    (step) => !step.repeatPerAnimal && step.id !== closingStep?.id
  );

  const doneFor = (stepId: string, animalId: string | null = null) =>
    completions.find((c) => c.stepId === stepId && c.animalId === animalId);

  const chipsDone = chipSteps.every((step) => doneFor(step.id));
  const animalsDone = perAnimalStep
    ? animals.every((beast) => doneFor(perAnimalStep.id, beast.id))
    : true;
  const readyToClose = chipsDone && animalsDone;

  if (state === "due") {
    return (
      <div className="mx-auto mt-10 w-full max-w-sm space-y-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{content.name.bn}</h1>
        <Button
          className="h-14 w-full text-lg"
          onClick={() => claim.mutate({ id: instanceId })}
        >
          {t("work.claim")}
        </Button>
      </div>
    );
  }

  if (openAnimal && perAnimalStep) {
    return (
      <EvidenceSheet
        key={openAnimal.id}
        step={perAnimalStep}
        animal={openAnimal}
        onCancel={() => setOpenAnimal(null)}
        onRecord={(payload) =>
          record.mutate({
            instanceId,
            stepId: perAnimalStep.id,
            animalTag: openAnimal.tagNumber,
            ...payload,
          })
        }
      />
    );
  }

  if (openStep) {
    return (
      <EvidenceSheet
        step={openStep}
        onCancel={() => setOpenStep(null)}
        onRecord={(payload) =>
          record.mutate({ instanceId, stepId: openStep.id, ...payload })
        }
      />
    );
  }

  return (
    <div className="container mx-auto max-w-xl space-y-4 px-3 py-4">
      <header>
        <h1 className="text-xl font-bold">{content.name.bn}</h1>
        <p className="text-muted-foreground text-sm">
          {t("work.progress", {
            done: animals.filter(
              (b) => perAnimalStep && doneFor(perAnimalStep.id, b.id)
            ).length,
            total: animals.length,
          })}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {chipSteps.map((step) => {
          const done = Boolean(doneFor(step.id));
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setOpenStep(step)}
              className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm ${
                done ? "bg-emerald-700" : "bg-neutral-800"
              }`}
            >
              {done ? <Check size={14} /> : <SprayCan size={14} />}{" "}
              {step.text.bn}
            </button>
          );
        })}
      </div>

      {perAnimalStep ? (
        <ul className="grid grid-cols-3 gap-3">
          {animals.map((beast) => {
            const completion = doneFor(perAnimalStep.id, beast.id);
            return (
              <li key={beast.id}>
                <button
                  type="button"
                  onClick={() => setOpenAnimal(beast)}
                  className={`relative flex w-full flex-col items-center gap-1 rounded-2xl p-3 ${
                    completion ? "bg-neutral-900 opacity-70" : "bg-neutral-800"
                  }`}
                >
                  <AnimalPhoto
                    tagNumber={beast.tagNumber}
                    photoUpdatedAt={beast.photoUpdatedAt}
                  />
                  <span className="font-bold">{beast.tagNumber}</span>
                  <span className="text-muted-foreground text-xs">
                    {completion?.status === "skipped"
                      ? completion.skipReason
                      : ""}
                  </span>
                  {beast.underMilkWithdrawal ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                      <Lock size={12} /> {t("milk.withdrawalShort")}
                    </span>
                  ) : null}
                  {completion ? (
                    <Check
                      size={16}
                      className="absolute top-2 left-2 text-emerald-400"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {outcome ? <BulkOutcomeBanner outcome={outcome} /> : null}

      <ClosingAction
        ready={readyToClose}
        closingStep={closingStep}
        done={Boolean(closingStep && doneFor(closingStep.id))}
        pending={finish.isPending}
        onOpen={(step) => setOpenStep(step)}
        onFinish={() => finish.mutate({ id: instanceId })}
      />
    </div>
  );
};

/** What the tank reading came to. A difference beyond the farm's tolerance has already been
 *  flagged for the Manager server-side; this says so, rather than asking the person to fix
 *  it in the parlour. */
const BulkOutcomeBanner = ({ outcome }: { outcome: BulkOutcome }) => {
  const { t, language } = useLanguage();
  const litres = new Intl.NumberFormat(
    language === "bn" ? "bn-BD" : "en-GB"
  ).format(Math.abs(outcome.differenceLitres));
  return (
    <div
      className={`rounded-xl p-3 text-sm ${
        outcome.flagged ? "bg-amber-900 text-amber-100" : "bg-neutral-800"
      }`}
    >
      <p>
        {outcome.differenceLitres === 0
          ? t("milk.matched")
          : t("milk.difference", { litres })}
      </p>
      {outcome.flagged ? <p>{t("milk.flagged")}</p> : null}
    </div>
  );
};

/** The closing Step — the bulk total — appears only when every chip and tile is done. */
const ClosingAction = ({
  ready,
  closingStep,
  done,
  pending,
  onOpen,
  onFinish,
}: {
  ready: boolean;
  closingStep: Step | undefined;
  done: boolean;
  pending: boolean;
  onOpen: (step: Step) => void;
  onFinish: () => void;
}) => {
  const { t } = useLanguage();
  if (!ready) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        {t("work.notFinished")}
      </p>
    );
  }
  // An SOP with no closing Step — one Step, or a last Step that repeats per animal —
  // finishes as soon as everything else is done.
  if (!(closingStep && !done)) {
    return (
      <Button
        className="h-14 w-full text-lg"
        disabled={pending}
        onClick={onFinish}
      >
        {t("work.finish")}
      </Button>
    );
  }
  return (
    <Button
      className="h-14 w-full text-lg"
      variant="outline"
      onClick={() => onOpen(closingStep)}
    >
      {closingStep.text.bn}
    </Button>
  );
};

interface RecordPayload {
  evidence: (boolean | number | string)[];
  skipReason?: string;
  outOfRange?: string;
  destination?: MilkDestination;
  photo?: { contentType: "image/jpeg" | "image/png"; data: string };
}

/** A camera JPEG is easily 3 MB, which is ~4 MB once base64-encoded — more than the server
 *  accepts, and a lot of string for a cheap phone to build. */
const PHOTO_MAX_BYTES = 1_500_000;

/** The full-screen sheet: one control per piece of Evidence the Version asks for, skip with
 *  a reason for a per-animal Step, and a warning that must be acknowledged for an odd figure. */
const EvidenceSheet = ({
  step,
  animal,
  onCancel,
  onRecord,
}: {
  step: Step;
  animal?: Animal;
  onCancel: () => void;
  onRecord: (payload: RecordPayload) => void;
}) => {
  const { t, language } = useLanguage();
  const [values, setValues] = useState<
    Record<number, boolean | number | string>
  >({});
  const [skipping, setSkipping] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [photo, setPhoto] = useState<RecordPayload["photo"]>();
  // A cow under Withdrawal has no choice to make. The server decides again when the entry
  // lands — this phone may have been offline since before she was treated.
  const locked = Boolean(animal?.underMilkWithdrawal);
  const [destination, setDestination] = useState<MilkDestination>(
    locked ? "discard" : "bulk"
  );
  const recordsMilk = step.effect?.kind === "milk_record";

  const setValue = (index: number, value: boolean | number | string) => {
    setValues((current) => ({ ...current, [index]: value }));
    setWarning(null);
  };

  const assembled = step.evidence.map((item, index) => {
    if (item.type === "tick") {
      return true;
    }
    return values[index] ?? "";
  });

  const firstOutOfRange = (): string | null => {
    for (const [index, item] of step.evidence.entries()) {
      if (item.type !== "number") {
        continue;
      }
      const typed = Number(values[index]);
      if (!Number.isNaN(typed)) {
        const outside = outOfRangeOf(item, typed);
        if (outside) {
          return outside;
        }
      }
    }
    return null;
  };

  const ready = step.evidence.every((item, index) => {
    if (!item.required || item.type === "tick") {
      return true;
    }
    if (item.type === "photo") {
      return Boolean(photo);
    }
    return values[index] !== undefined && values[index] !== "";
  });

  const submit = (force: boolean) => {
    const outside = firstOutOfRange();
    if (outside && !force) {
      setWarning(outside);
      return;
    }
    onRecord({
      evidence: assembled.map((value, index) =>
        step.evidence[index]?.type === "number" ? Number(value) : value
      ),
      outOfRange: outside ?? undefined,
      destination: recordsMilk ? destination : undefined,
      photo,
    });
  };

  if (skipping) {
    return (
      <div className="mx-auto mt-8 w-full max-w-sm space-y-3 p-4">
        <p className="text-lg">{t("work.skipWhy")}</p>
        {step.skipReasons.map((reason) => (
          <Button
            key={reason.bn}
            variant="outline"
            className="h-14 w-full text-lg"
            onClick={() => onRecord({ evidence: [], skipReason: reason.bn })}
          >
            {reason.bn}
          </Button>
        ))}
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setSkipping(false)}
        >
          {t("work.back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-sm space-y-4 p-4">
      <header className="flex items-center gap-3">
        {animal ? (
          <AnimalPhoto
            tagNumber={animal.tagNumber}
            photoUpdatedAt={animal.photoUpdatedAt}
            size={64}
          />
        ) : null}
        <div>
          <p className="text-2xl font-bold">
            {animal?.tagNumber ?? step.text.bn}
          </p>
          {animal ? (
            <p className="text-muted-foreground">{step.text.bn}</p>
          ) : null}
        </div>
      </header>

      {step.evidence.map((item, index) => (
        <EvidenceControl
          key={`${step.id}-${index}`}
          evidence={item}
          language={language}
          value={values[index]}
          hasPhoto={Boolean(photo)}
          onValue={(value) => setValue(index, value)}
          onPhoto={setPhoto}
        />
      ))}

      {recordsMilk ? (
        <DestinationChoice
          value={destination}
          locked={locked}
          onChange={setDestination}
        />
      ) : null}

      {warning ? (
        <div className="space-y-2 rounded-xl border-2 border-amber-500 p-3">
          <p className="flex items-center gap-2 text-amber-300">
            <Lock size={16} /> {t("work.outOfRange")}
          </p>
          <Button className="w-full" onClick={() => submit(true)}>
            {t("work.keepAnyway")}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" className="h-14" onClick={onCancel}>
          {t("work.back")}
        </Button>
        {step.repeatPerAnimal ? (
          <Button
            variant="outline"
            className="h-14"
            onClick={() => setSkipping(true)}
          >
            {t("work.skip")}
          </Button>
        ) : null}
        <Button
          className={`h-14 text-lg ${step.repeatPerAnimal ? "" : "col-span-2"}`}
          disabled={!ready}
          onClick={() => submit(false)}
        >
          {t("work.confirm")}
        </Button>
      </div>
    </div>
  );
};

/** Where the milk goes. Three buttons, because that is the whole vocabulary — and none at
 *  all when a Withdrawal has already decided it. */
const DestinationChoice = ({
  value,
  locked,
  onChange,
}: {
  value: MilkDestination;
  locked: boolean;
  onChange: (next: MilkDestination) => void;
}) => {
  const { t } = useLanguage();
  if (locked) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-amber-900 p-3 text-amber-100">
        <Lock size={16} /> {t("milk.withdrawal")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{t("milk.destination")}</p>
      <div className="grid grid-cols-3 gap-2">
        {MILK_DESTINATIONS.map((option) => (
          <Button
            key={option}
            variant={value === option ? "default" : "outline"}
            className="h-12"
            onClick={() => onChange(option)}
          >
            {t(`milk.${option}`)}
          </Button>
        ))}
      </div>
    </div>
  );
};

/** One piece of Evidence: a big number pad, a note, a choice, or the camera. A tick needs no
 *  control — confirming the Step is the tick. */
const EvidenceControl = ({
  evidence,
  language,
  value,
  hasPhoto,
  onValue,
  onPhoto,
}: {
  evidence: Evidence;
  language: string;
  value: boolean | number | string | undefined;
  hasPhoto: boolean;
  onValue: (value: string) => void;
  onPhoto: (photo: RecordPayload["photo"]) => void;
}) => {
  const { t } = useLanguage();

  if (evidence.type === "tick") {
    return null;
  }

  if (evidence.type === "number") {
    const typed = String(value ?? "");
    return (
      <div className="space-y-2">
        <p className="text-center text-5xl font-bold tabular-nums">
          {typed === ""
            ? "০"
            : new Intl.NumberFormat(
                language === "bn" ? "bn-BD" : "en-GB"
              ).format(Number(typed))}{" "}
          <span className="text-xl">{evidence.unit?.bn}</span>
        </p>
        <Input
          inputMode="decimal"
          value={typed}
          onChange={(event) =>
            onValue(event.target.value.replaceAll(/[^\d.]/gu, ""))
          }
          className="text-center text-2xl"
          aria-label={evidence.unit?.bn ?? t("work.confirm")}
        />
      </div>
    );
  }

  if (evidence.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {(evidence.choices ?? []).map((choice) => (
          <Button
            key={choice.value}
            variant={value === choice.value ? "default" : "outline"}
            className="h-12"
            onClick={() => onValue(choice.value)}
          >
            {choice.label.bn}
          </Button>
        ))}
      </div>
    );
  }

  if (evidence.type === "note") {
    return (
      <Input
        value={String(value ?? "")}
        onChange={(event) => onValue(event.target.value)}
        placeholder={t("work.note")}
        aria-label={t("work.note")}
      />
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-xl bg-neutral-800 p-3 text-base">
      <Camera size={20} /> {hasPhoto ? t("work.saved") : t("work.photo")}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          if (file.size > PHOTO_MAX_BYTES) {
            toast.error(t("common.error"));
            return;
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          const binary = Array.from(bytes, (byte) =>
            String.fromCodePoint(byte)
          ).join("");
          onPhoto({
            contentType: file.type === "image/png" ? "image/png" : "image/jpeg",
            data: btoa(binary),
          });
        }}
      />
    </label>
  );
};

export const Route = createFileRoute("/_auth/work/$instanceId")({
  component: WorkPage,
});
