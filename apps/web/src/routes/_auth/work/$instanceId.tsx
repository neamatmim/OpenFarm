import type { Evidence, SopContent, Step } from "@OpenFarm/domain";
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
}
interface Completion {
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
}

const numberEvidence = (step: Step): Evidence | undefined =>
  step.evidence.find((item) => item.type === "number");

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
      onSuccess: () => {
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
  const chipSteps = content.steps.filter(
    (step) => !step.repeatPerAnimal && step.id !== content.steps.at(-1)?.id
  );
  const closingStep =
    content.steps.length > 1 ? content.steps.at(-1) : undefined;

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

      <ClosingAction
        closingStep={readyToClose ? closingStep : undefined}
        done={Boolean(closingStep && doneFor(closingStep.id))}
        pending={finish.isPending}
        onOpen={(step) => setOpenStep(step)}
        onFinish={() => finish.mutate({ id: instanceId })}
      />
    </div>
  );
};

/** The closing Step — the bulk total — appears only when every chip and tile is done. */
const ClosingAction = ({
  closingStep,
  done,
  pending,
  onOpen,
  onFinish,
}: {
  closingStep: Step | undefined;
  done: boolean;
  pending: boolean;
  onOpen: (step: Step) => void;
  onFinish: () => void;
}) => {
  const { t } = useLanguage();
  if (!closingStep) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        {t("work.notFinished")}
      </p>
    );
  }
  if (done) {
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
  photo?: { contentType: "image/jpeg" | "image/png"; data: string };
}

/** The full-screen sheet: a big keypad for a number, a tick for the rest, skip with a reason
 *  for a per-animal Step, and a warning that must be acknowledged for an odd figure. */
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
  const [value, setValue] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const number = numberEvidence(step);
  const wantsPhoto = step.evidence.some((item) => item.type === "photo");
  const [photo, setPhoto] = useState<RecordPayload["photo"]>();

  const submit = (force = false) => {
    if (!number) {
      onRecord({ evidence: [true], photo });
      return;
    }
    const typed = Number(value);
    const outside = outOfRangeOf(number, typed);
    if (outside && !force) {
      setWarning(outside);
      return;
    }
    onRecord({ evidence: [typed], outOfRange: outside ?? undefined, photo });
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

      {number ? (
        <>
          <p className="text-center text-5xl font-bold tabular-nums">
            {value === ""
              ? "০"
              : new Intl.NumberFormat(
                  language === "bn" ? "bn-BD" : "en-GB"
                ).format(Number(value))}{" "}
            <span className="text-xl">{number.unit?.bn}</span>
          </p>
          <Input
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value.replaceAll(/[^\d.]/gu, ""));
              setWarning(null);
            }}
            className="text-center text-2xl"
            aria-label={step.text.bn}
          />
        </>
      ) : null}

      {wantsPhoto ? (
        <label className="flex items-center gap-2 rounded-xl bg-neutral-800 p-3 text-base">
          <Camera size={20} /> {t("work.photo")}
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
              const bytes = new Uint8Array(await file.arrayBuffer());
              const binary = Array.from(bytes, (byte) =>
                String.fromCodePoint(byte)
              ).join("");
              setPhoto({
                contentType:
                  file.type === "image/png" ? "image/png" : "image/jpeg",
                data: btoa(binary),
              });
            }}
          />
        </label>
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
        {step.repeatPerAnimal ? (
          <Button
            variant="outline"
            className="h-14"
            onClick={() => setSkipping(true)}
          >
            {t("work.skip")}
          </Button>
        ) : (
          <Button variant="ghost" className="h-14" onClick={onCancel}>
            {t("work.back")}
          </Button>
        )}
        <Button
          className="col-span-2 h-14 text-lg"
          disabled={Boolean(number) && value === ""}
          onClick={() => submit(false)}
        >
          {t("work.confirm")}
        </Button>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_auth/work/$instanceId")({
  component: WorkPage,
});
