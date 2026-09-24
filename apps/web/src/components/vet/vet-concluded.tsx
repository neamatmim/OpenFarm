import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ClipboardList, Pill } from "lucide-react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import type { Course as CourseOfTreatment } from "@/components/course";
import { CourseLine, DoseLine } from "@/components/course";
import { EmptyState, Loaded } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { bilingual, note as writtenNote } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

import type { Made } from "./vet-types";
import { AnimalLink } from "./vet-types";

/** A course that followed a conclusion: the one sentence about it, and its doses opened beneath when asked for. */
const CourseOfDoses = ({ course }: { course: CourseOfTreatment }) => (
  <details className="group bg-muted/40 rounded-lg border">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm md:min-h-9 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <CourseLine course={course} />
      </span>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
      />
    </summary>
    <ul className="flex flex-col gap-1 border-t px-3 py-2">
      {course.doses.map((dose) => (
        <DoseLine dose={dose} key={dose.id} />
      ))}
    </ul>
  </details>
);

/** Putting a conclusion right. Nothing is deleted: the correction carries a reason and the trail keeps what it said
 *  before. */
const CorrectConclusion = ({ made }: { made: Made }) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    disease: bilingual(made.disease),
    note: writtenNote(made.note),
  });
  const correct = useMutation(orpc.diagnoses.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: made.id,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("vet.correct")}
      trigger={t("vet.correct")}
    >
      <CorrectionAnswer
        label={t("vet.disease")}
        onChange={(value) => correcting.set("disease", value)}
        value={correcting.typed.disease ?? ""}
      />
      <CorrectionAnswer
        label={t("vet.note")}
        onChange={(value) => correcting.set("note", value)}
        value={correcting.typed.note ?? ""}
      />
    </CorrectionDialog>
  );
};

/** One of the Vet's own conclusions: the animal and the disease, what it answered and what was found, the courses that
 *  followed, and the two things the Vet does with it — treat, or put it right. */
const Concluded = ({
  made,
  onPrescribe,
}: {
  made: Made;
  onPrescribe: (made: Made) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <AnimalLink tagNumber={made.tagNumber} />
            <span className="font-medium">{made.disease}</span>
          </div>
          <span className="text-muted-foreground text-sm">
            {formatDate(new Date(made.diagnosedAt), language, "dateTime")}
            {made.answers
              ? ` · ${t("vet.answering", { saw: made.answers.sawLabel })}`
              : ""}
          </span>
          {made.note ? <p className="text-sm">{made.note}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* A course is written for an animal still here; the conclusion about one who left is still hers to put
              right. A list kept from before the farm said so offers it, as it always did. */}
          {made.stillHere === false ? null : (
            <Button
              className="h-11 md:h-8"
              onClick={() => onPrescribe(made)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Pill aria-hidden data-icon="inline-start" />
              {t("prescribe.write")}
            </Button>
          )}
          <CorrectConclusion made={made} />
        </div>
      </div>
      {made.prescriptions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {made.prescriptions.map((course) => (
            <li key={course.id}>
              <CourseOfDoses course={course} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

/** What the Vet has concluded lately, newest first, with what they ordered for each. */
export const ConcludedTab = ({
  mine,
  onPrescribe,
}: {
  mine: { data: Made[] | undefined; isError: boolean; refetch: () => unknown };
  onPrescribe: (made: Made) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="surface p-4 md:p-5">
      <Loaded query={mine}>
        {mine.data?.length ? (
          <ul className="divide-border flex flex-col divide-y">
            {mine.data.map((made) => (
              <Concluded key={made.id} made={made} onPrescribe={onPrescribe} />
            ))}
          </ul>
        ) : (
          <EmptyState bare icon={ClipboardList} title={t("vet.noneMine")} />
        )}
      </Loaded>
    </div>
  );
};
