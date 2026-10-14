import {
  OBSERVATION_WORD_NEEDING_A_NOTE,
  OBSERVATION_WORDS,
  SIDES,
  choiceSaid,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import {
  WindowChoice,
  NEXT_EID,
  windowOf,
  windowReady,
} from "@/components/fattening/window-choice";
import type { WindowPick } from "@/components/fattening/window-choice";
import { Loaded, Notice, Page } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { SightingFields } from "@/components/report-sighting";
import { EvidenceSheet } from "@/components/work/evidence-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { entryRefusalMessage } from "@/lib/correction-refusal";
import { cachedWithdrawal, herdCacheQuery } from "@/lib/herd-cache";
import type {
  EntryBody,
  EntryDraft,
  Held,
  EntryOf,
  WorkRecoveryEntry,
  ActionRecoveryEntry,
  RecoveryPhoto,
} from "@/lib/outbox";
import { phoneOutbox } from "@/lib/outbox-client";
import { RecoveryError } from "@/lib/outbox-recovery";
import { usePenNames } from "@/lib/pen-names";
import { keptOnThePhone } from "@/lib/record-offline";
import {
  completionForAnswer as shownAnswer,
  recoveryOnBoard,
} from "@/lib/recovery-board";
import type { RecoveryBoard } from "@/lib/recovery-board";
import { sayWhy } from "@/lib/saying";
import type { StepAnswer } from "@/lib/step-answer";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Save = (draft: EntryDraft, photos?: RecoveryPhoto[]) => Promise<void>;
interface EditorProps {
  save: Save;
  pending: boolean;
  onClose: () => void;
  hint: ReactNode;
  record: (draft: EntryDraft, photos?: RecoveryPhoto[]) => void;
}

const RecoveryDialog = ({
  children,
  ready,
  submit,
  pending,
  hint,
  onClose,
}: EditorProps & {
  children?: ReactNode;
  ready: boolean;
  submit: () => Promise<void>;
}) => {
  const { t } = useLanguage();
  return (
    <FormDialog
      open
      title={t("outbox.recover")}
      submitLabel={t("outbox.resend")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      pending={pending}
      ready={ready}
      onSubmit={submit}
    >
      {hint}
      {children}
    </FormDialog>
  );
};

const TagField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const { t } = useLanguage();
  const id = useId();
  return (
    <FormField id={id} label={t("animals.col.tag")}>
      <Input
        id={id}
        required
        maxLength={32}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
};

const SightingRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: EntryOf<"observation"> }) => {
  const [tag, setTag] = useState(entry.body.tagNumber);
  const [saw, setSaw] = useState(entry.body.saw);
  const [note, setNote] = useState(entry.body.note ?? "");
  const ready =
    Boolean(tag.trim()) &&
    OBSERVATION_WORDS.some((one) => one.value === saw) &&
    (saw !== OBSERVATION_WORD_NEEDING_A_NOTE || Boolean(note.trim()));
  return (
    <RecoveryDialog
      {...props}
      ready={ready}
      submit={() =>
        props.save({
          kind: "observation",
          body: { tagNumber: tag.trim(), saw, note: note.trim() || undefined },
        })
      }
    >
      <TagField value={tag} onChange={setTag} />
      <SightingFields saw={saw} note={note} onSaw={setSaw} onNote={setNote} />
    </RecoveryDialog>
  );
};

/** An animal's photo the farm could not take: which animal it was of, put right, or the picture taken again. The thumbnail
 *  goes with the picture it was made from, and not with a new one. */
const AnimalPhotoRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: EntryOf<"animal_photo"> }) => {
  const { t } = useLanguage();
  const [tag, setTag] = useState(entry.body.tagNumber);
  const [photo, setPhoto] = useState<EntryBody<"animal_photo">>(entry.body);
  const id = useId();
  return (
    <RecoveryDialog
      {...props}
      ready={Boolean(tag.trim() && photo.data)}
      submit={() =>
        props.save({
          kind: "animal_photo",
          body: { ...photo, tagNumber: tag.trim() },
        })
      }
    >
      <TagField value={tag} onChange={setTag} />
      <FormField id={id} label={t("review.held.animal_photo")}>
        <PhotoField
          id={id}
          takeLabel="animals.photoTake"
          chosen={Boolean(photo.data)}
          onPhoto={(value) => {
            if (value) {
              setPhoto({ tagNumber: tag, ...value });
            }
          }}
        />
      </FormField>
    </RecoveryDialog>
  );
};

const MoveRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: EntryOf<"animal_move"> }) => {
  const { t } = useLanguage();
  const names = usePenNames();
  const [tag, setTag] = useState(entry.body.tagNumber);
  const [pen, setPen] = useState(entry.body.toPenId);
  const [side, setSide] = useState(entry.body.toSide ?? "");
  const [reason, setReason] = useState(entry.body.reason ?? "");
  const [windowPick, setWindowPick] = useState<WindowPick>(
    entry.body.targetWindow
      ? { kind: "other", ...entry.body.targetWindow }
      : NEXT_EID
  );
  const id = useId();
  return (
    <RecoveryDialog
      {...props}
      ready={
        Boolean(tag.trim() && pen && names.has(pen)) && windowReady(windowPick)
      }
      submit={() =>
        props.save({
          kind: "animal_move",
          body: {
            tagNumber: tag.trim(),
            toPenId: pen,
            reason: reason.trim() || undefined,
            toSide: side === "dairy" || side === "fattening" ? side : undefined,
            targetWindow: windowOf(windowPick),
          },
        })
      }
    >
      <TagField value={tag} onChange={setTag} />
      <FormField id={`${id}-pen`} label={t("animals.moveTo")}>
        <NativeSelect
          id={`${id}-pen`}
          required
          value={pen}
          onChange={(event) => setPen(event.target.value)}
        >
          <option value="">—</option>
          {names.has(entry.body.toPenId) ? null : (
            <option value={entry.body.toPenId} disabled>
              {t("outbox.recoveryOldPen")}
            </option>
          )}
          {[...names].map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={`${id}-side`} label={t("correct.toSide")}>
        <NativeSelect
          id={`${id}-side`}
          value={side}
          onChange={(event) => setSide(event.target.value)}
        >
          <option value="">—</option>
          {SIDES.map((value) => (
            <option key={value} value={value}>
              {t(`animals.side.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={`${id}-reason`} label={t("animals.reason")}>
        <Input
          id={`${id}-reason`}
          maxLength={200}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
      {side === "fattening" || entry.body.targetWindow ? (
        <WindowChoice
          id={`${id}-window`}
          pick={windowPick}
          onPick={setWindowPick}
        />
      ) : null}
    </RecoveryDialog>
  );
};

type Work = Awaited<ReturnType<typeof orpc.work.get.call>>;
type WorkEntry = WorkRecoveryEntry;
const targetFor = (entry: WorkEntry, work: Work) =>
  entry.kind === "step_correction"
    ? work.completions.find((one) => one.id === entry.body.completionId)
    : undefined;
const answerFor = (
  entry: WorkEntry,
  target: Work["completions"][number] | undefined
): StepAnswer =>
  entry.kind === "step_completion"
    ? entry.body
    : {
        ...target?.facts,
        ...entry.body.changes?.answer?.to,
        evidence: entry.body.changes?.answer?.to.evidence ?? [],
      };
const missingFacts = (answer: StepAnswer, work: Work): boolean =>
  Boolean(
    answer.feeding?.some(
      (line) =>
        !work.feeding?.items.some((one) => one.feedItemId === line.feedItemId)
    ) ||
    answer.counts?.some(
      (line) =>
        !work.stockCount?.items.some(
          (one) => one.feedItemId === line.feedItemId
        )
    ) ||
    answer.medicineCounts?.some(
      (line) =>
        !work.medicineCount?.items.some(
          (one) => one.drugProductId === line.drugProductId
        )
    )
  );
const countBoard = (work: Work, answer: StepAnswer) =>
  work.stockCount
    ? {
        ...work.stockCount,
        counted: (answer.counts ?? []).map((line) => ({
          ...line,
          reason: line.reason ?? null,
        })),
      }
    : null;
const medicineBoard = (work: Work, answer: StepAnswer) =>
  work.medicineCount
    ? {
        ...work.medicineCount,
        counted: (answer.medicineCounts ?? []).map((line) => ({
          ...line,
          reason: line.reason ?? null,
        })),
      }
    : null;

const WorkRecoveryUnavailable = ({ onClose }: { onClose: () => void }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="warning" title={t("outbox.recoveryContext")} />
      <Button variant="outline" onClick={onClose}>
        {t("work.back")}
      </Button>
    </div>
  );
};

/** The current record sits beside the proposed changes, so changing a stale Correction is an informed action. */
const CurrentAnswer = ({
  target,
  work,
}: {
  target: Work["completions"][number];
  work: Work;
}) => {
  const { t, language } = useLanguage();
  const values = (target.evidence as (boolean | number | string)[]).map(
    (value, slot) => {
      if (typeof value === "number") {
        return formatNumber(value, language);
      }
      if (typeof value === "boolean") {
        return t(value ? "outbox.ticked" : "outbox.notTicked");
      }
      const evidence = work.content.steps.find(
        (one) => one.id === target.stepId
      )?.evidence[slot];
      if (evidence?.type === "datetime" && value) {
        return formatDate(new Date(value), language, "dateTime");
      }
      const choice = choiceSaid(work.content, target.stepId, slot, value);
      if (!choice) {
        return value;
      }
      return language === "en" ? (choice.en ?? choice.bn) : choice.bn;
    }
  );
  const facts = [
    ...(target.facts.feeding ?? []).map(
      (line) =>
        `${work.feeding?.items.find((one) => one.feedItemId === line.feedItemId)?.nameBn ?? t("feed.items")} · ${t("work.given")}: ${formatNumber(line.givenKg, language)} · ${t("work.leftover")}: ${formatNumber(line.leftoverKg, language)}`
    ),
    ...(target.facts.counts ?? []).map(
      (line) =>
        `${work.stockCount?.items.find((one) => one.feedItemId === line.feedItemId)?.nameBn ?? t("feed.items")} · ${formatNumber(line.counted, language)} ${line.reason ?? ""}`
    ),
    ...(target.facts.medicineCounts ?? []).map(
      (line) =>
        `${work.medicineCount?.items.find((one) => one.drugProductId === line.drugProductId)?.nameBn ?? t("drugs.doseWord")} · ${formatNumber(line.counted, language)} ${line.reason ?? ""}`
    ),
  ];
  return (
    <section
      className="surface flex flex-col gap-2 p-3 text-sm"
      aria-label={t("outbox.recoveryCurrent")}
    >
      <h2 className="font-semibold">{t("outbox.recoveryCurrent")}</h2>
      <p className="break-words">
        {target.skipReason || values.filter(Boolean).join(", ")}
      </p>
      {target.destination ? <p>{t(`milk.${target.destination}`)}</p> : null}
      {facts.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {target.facts.renewal ? <p>{target.facts.renewal.expiresOn}</p> : null}
    </section>
  );
};

const WorkRecoveryForm = ({
  entry,
  work,
  photos,
  ...props
}: EditorProps & { entry: WorkEntry; work: Work; photos: RecoveryPhoto[] }) => {
  const { t } = useLanguage();
  const herd = useQuery(herdCacheQuery);
  const [tag, setTag] = useState(
    entry.kind === "step_completion" ? (entry.body.animalTag ?? "") : ""
  );
  // Keep the exact version shown when this editor opened. A background refresh cannot silently rebase the Correction.
  // This is an immutable editing snapshot; a refetch must not change the version being corrected.
  // oxlint-disable-next-line react/hook-use-state
  const [target] = useState(() => targetFor(entry, work));
  const stepId =
    entry.kind === "step_completion" ? entry.body.stepId : target?.stepId;
  const step = work.content.steps.find((one) => one.id === stepId);
  const answer = answerFor(entry, target);
  const animal =
    entry.kind === "step_completion"
      ? work.animals.find((one) => one.tagNumber === tag)
      : work.animals.find((one) => one.id === target?.animalId);
  if (!step || missingFacts(answer, work)) {
    return <WorkRecoveryUnavailable onClose={props.onClose} />;
  }
  const submit = (payload: StepAnswer) => {
    const { photos: pictures = [], reason, ...said } = payload;
    if (entry.kind === "step_completion") {
      props.record(
        {
          kind: "step_completion",
          body: {
            instanceId: entry.body.instanceId,
            stepId: entry.body.stepId,
            animalTag: tag || undefined,
            ...said,
            photoSlots: pictures.map((photo) => photo.slot),
          },
        },
        pictures
      );
    } else if (target) {
      props.record({
        kind: "step_correction",
        body: {
          completionId: entry.body.completionId,
          reason: reason ?? entry.body.reason,
          changes: {
            answer: {
              from: {
                skipReason: target.skipReason,
                evidence: target.evidence as (boolean | number | string)[],
                destination: target.destination,
                outOfRange: target.outOfRange,
                ...target.facts,
              },
              to: said,
            },
          },
        },
      });
    }
  };
  return (
    <>
      {target ? <CurrentAnswer target={target} work={work} /> : null}
      {entry.kind === "step_completion" && step.repeatPerAnimal ? (
        <FormField id="recover-animal" label={t("animals.col.tag")}>
          <NativeSelect
            id="recover-animal"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            {work.animals.some((one) => one.tagNumber === tag) ? null : (
              <option value={tag}>{tag || "—"}</option>
            )}
            {work.animals.map((one) => (
              <option key={one.id} value={one.tagNumber}>
                {one.tagNumber}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
      <EvidenceSheet
        step={step}
        content={work.content}
        animal={
          animal
            ? {
                ...animal,
                underMilkWithdrawal:
                  animal.underMilkWithdrawal ||
                  cachedWithdrawal(
                    herd.data?.animals.find((one) => one.id === animal.id),
                    new Date()
                  ),
              }
            : undefined
        }
        correcting={entry.kind === "step_correction"}
        existing={shownAnswer(entry.id, step.id, animal?.id ?? null, answer)}
        initialReason={
          entry.kind === "step_correction" ? entry.body.reason : undefined
        }
        feeding={work.feeding}
        renewal={work.renewal}
        initialRenewal={answer.renewal}
        initialPhotos={Object.fromEntries(
          photos.map(({ slot, ...photo }) => [slot, photo])
        )}
        stockCount={countBoard(work, answer)}
        medicineCount={medicineBoard(work, answer)}
        pending={props.pending}
        submitLabel={t("outbox.resend")}
        onCancel={props.onClose}
        onRecord={submit}
      />
    </>
  );
};

const WorkRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: WorkEntry }) => {
  const { t } = useLanguage();
  const work = useQuery(
    orpc.work.get.queryOptions({
      input:
        entry.kind === "step_completion"
          ? { id: entry.body.instanceId }
          : { completionId: entry.body.completionId },
    })
  );
  const photos = useQuery({
    queryKey: ["outbox", "photos", entry.id],
    queryFn: () => phoneOutbox()?.photosFor(entry.id) ?? Promise.resolve([]),
    networkMode: "always",
  });
  return (
    <Page width="narrow">
      {props.hint}
      {entry.kind === "step_correction" ? (
        <p className="text-muted-foreground text-sm">
          {t("outbox.recoveryCorrection")}
        </p>
      ) : null}
      <Loaded query={work}>
        <Loaded query={photos}>
          {work.data && photos.data ? (
            <WorkRecoveryForm
              {...props}
              entry={entry}
              work={work.data}
              photos={photos.data}
            />
          ) : null}
        </Loaded>
      </Loaded>
      {work.data ? null : (
        <Button variant="outline" onClick={props.onClose}>
          {t("work.back")}
        </Button>
      )}
    </Page>
  );
};

const ActionRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: ActionRecoveryEntry }) => {
  const { t, language } = useLanguage();
  const work = useQuery(
    orpc.work.get.queryOptions({ input: { id: entry.body.instanceId } })
  );
  return (
    <RecoveryDialog
      {...props}
      ready={Boolean(work.data)}
      submit={() =>
        props.save(
          entry.kind === "instance_claim"
            ? { kind: entry.kind, body: entry.body }
            : { kind: entry.kind, body: entry.body }
        )
      }
    >
      <Loaded query={work}>
        {work.data ? (
          <p className="font-medium">
            {language === "en"
              ? (work.data.content.name.en ?? work.data.content.name.bn)
              : work.data.content.name.bn}
          </p>
        ) : null}
      </Loaded>
      <p>
        {t(
          entry.kind === "instance_claim"
            ? "outbox.recoveryClaim"
            : "outbox.recoveryFinish"
        )}
      </p>
    </RecoveryDialog>
  );
};

const PhotoRecovery = ({
  entry,
  ...props
}: EditorProps & { entry: EntryOf<"completion_photo"> }) => {
  const { t } = useLanguage();
  const [photo, setPhoto] = useState<
    Pick<EntryBody<"completion_photo">, "contentType" | "data">
  >(entry.body);
  const work = useQuery(
    orpc.work.get.queryOptions({
      input: { completionId: entry.body.completionId },
    })
  );
  const id = useId();
  return (
    <RecoveryDialog
      {...props}
      ready={Boolean(work.data && photo.data)}
      submit={() =>
        props.save({
          kind: "completion_photo",
          body: {
            completionId: entry.body.completionId,
            slot: entry.body.slot,
            ...photo,
          },
        })
      }
    >
      <Loaded query={work}>
        {work.data ? <p>{work.data.content.name.bn}</p> : null}
      </Loaded>
      <FormField id={id} label={t("review.held.completion_photo")}>
        <PhotoField
          id={id}
          takeLabel="work.photo"
          chosen={Boolean(photo.data)}
          onPhoto={(value) => {
            if (value) {
              setPhoto(value);
            }
          }}
        />
      </FormField>
    </RecoveryDialog>
  );
};
/** A rejected entry is still its author's record. The date and proof are retained by Outbox.recover, rather than
 * passing through the ordinary "record now" flow or silently turning old work into today's work. */
export const RecoverEntry = ({
  held,
  onClose,
}: {
  held: Held;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const recovery = useMutation({
    ...keptOnThePhone,
    mutationFn: async ({
      draft,
      photos,
    }: {
      draft: EntryDraft;
      photos?: RecoveryPhoto[];
    }) => {
      const outbox = phoneOutbox();
      if (!outbox) {
        throw new Error(t("common.cannotKeepWork"));
      }
      const result = await outbox.recover(held.entry.id, draft, photos);
      const pending = await outbox.pending();
      const saved = pending.find((entry) => entry.id === result.id);
      return { ...result, saved };
    },
    onSuccess: async ({ id, created, saved }) => {
      if (saved) {
        queryClient.setQueriesData<RecoveryBoard>(
          { queryKey: orpc.work.get.key() },
          (board) => recoveryOnBoard(board, held.entry.id, id, saved)
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["outbox"] });
      if (created) {
        toast.success(t("outbox.recoveryQueued"));
      } else {
        toast.info(t("outbox.recoveryAlready"));
      }
      onClose();
    },
  });
  const { error } = recovery;
  const recoveryErrors: Record<RecoveryError["why"], MessageKey> = {
    not_yours: "outbox.recoveryAuthor",
    not_rejected: "outbox.recoveryGone",
    sending: "outbox.recoverySending",
    missing_photos: "outbox.recoveryPhotos",
  };
  let errorText: string | null = null;
  if (error instanceof RecoveryError) {
    errorText = t(recoveryErrors[error.why]);
  } else if (error) {
    errorText = sayWhy(error, t);
  }
  const hint = (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {t("outbox.recoveryHint", {
          when: formatDate(
            new Date(held.entry.recordedAt),
            language,
            "dateTime"
          ),
        })}
      </p>
      <Notice
        title={entryRefusalMessage(held.refusal, t) ?? t("outbox.wrong")}
        tone="warning"
      />
      {errorText ? <Notice title={errorText} tone="danger" /> : null}
    </div>
  );
  const props: EditorProps = {
    pending: recovery.isPending,
    onClose,
    hint,
    record: (draft, photos) => {
      if (!recovery.isPending) {
        recovery.mutate({ draft, photos });
      }
    },
    save: async (draft, photos) => {
      await recovery.mutateAsync({ draft, photos });
    },
  };
  const { entry } = held;
  switch (entry.kind) {
    case "observation": {
      return <SightingRecovery {...props} entry={entry} />;
    }
    case "animal_move": {
      return <MoveRecovery {...props} entry={entry} />;
    }
    case "step_completion":
    case "step_correction": {
      return <WorkRecovery {...props} entry={entry} />;
    }
    case "completion_photo": {
      return <PhotoRecovery {...props} entry={entry} />;
    }
    case "animal_photo": {
      return <AnimalPhotoRecovery {...props} entry={entry} />;
    }
    case "instance_claim":
    case "instance_complete": {
      return <ActionRecovery {...props} entry={entry} />;
    }
    default: {
      return null;
    }
  }
};
