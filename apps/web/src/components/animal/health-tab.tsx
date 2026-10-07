import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardPlus, Eye, Stethoscope } from "lucide-react";
import { useState } from "react";

import { DoseTable } from "@/components/animal-histories";
import { TakeItBack, WithdrawSighting } from "@/components/animal/take-it-back";
import type { Course } from "@/components/course";
import { CourseLine } from "@/components/course";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { VetCases } from "@/components/vet-cases";
import { DiagnosisSheet } from "@/components/vet/diagnosis-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { AnimalDetail, AnimalPowers } from "./animal-types";

/** Where a sighting came from: the round's work, or somebody reporting it — with what they said. */
const SeenWhere = ({
  instanceId,
  note,
}: {
  instanceId: string | null;
  note: string | null;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {instanceId ? (
        <Link
          className="font-medium underline-offset-4 hover:underline"
          params={{ instanceId }}
          to="/work/$instanceId"
        >
          {t("animals.moveFromWork")}
        </Link>
      ) : (
        <span>{t("sighting.reported")}</span>
      )}
      {note ? <span>“{note}”</span> : null}
    </>
  );
};

/** How it ended, when the Vet has said; the two words to say it with, for the Vet, while nobody has. */
const HowItEnded = ({
  made,
  mayClose,
}: {
  made: {
    id: string;
    /** Missing from an answer a phone kept from before an outcome was kept. */
    outcome?: "recovered" | "not_recovered" | null;
    closedAt?: Date | null;
  };
  mayClose: boolean;
}) => {
  const { t, language } = useLanguage();
  // Said as it went: a refusal — said already on another screen, or she has gone — is told, not swallowed.
  const refused = useRefused();
  const close = useMutation(
    orpc.diagnoses.close.mutationOptions({
      onSuccess: () => toast.success(t("animals.outcomeSaid")),
      onError: refused,
    })
  );
  if (made.outcome) {
    return (
      <p className="text-sm">
        <StatusBadge tone={made.outcome === "recovered" ? "success" : "danger"}>
          {t(`animals.outcome.${made.outcome}`)}
        </StatusBadge>
        {made.closedAt ? (
          <span className="text-muted-foreground ms-2 text-xs">
            {formatDate(new Date(made.closedAt), language, "date")}
          </span>
        ) : null}
      </p>
    );
  }
  if (!mayClose) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(["recovered", "not_recovered"] as const).map((outcome) => (
        <Button
          disabled={close.isPending}
          key={outcome}
          onClick={() => close.mutate({ id: made.id, outcome })}
          size="sm"
          type="button"
          variant="outline"
        >
          {t(`animals.outcome.${outcome}`)}
        </Button>
      ))}
    </div>
  );
};

/** What the Vet made of it, and what was ordered because of it: the rest of the chain, in their name, because the acts
 *  are theirs. */
const Conclusion = ({
  made,
  mayClose,
}: {
  made: {
    id: string;
    disease: string;
    note: string | null;
    diagnosedAt: Date;
    diagnosedByName: string;
    prescriptions: Course[];
    outcome?: "recovered" | "not_recovered" | null;
    closedAt?: Date | null;
  };
  mayClose: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="border-primary/30 flex flex-col gap-1 border-l-2 pl-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Stethoscope aria-hidden className="text-primary size-4" />
        <span className="text-muted-foreground">{t("animals.diagnosis")}:</span>
        <span className="font-medium">{made.disease}</span>
      </p>
      {made.note ? <p className="text-sm">{made.note}</p> : null}
      <p className="text-muted-foreground text-xs">
        {t("animals.diagnosedBy", {
          name: made.diagnosedByName,
          date: formatDate(new Date(made.diagnosedAt), language, "dateTime"),
        })}
      </p>
      <HowItEnded made={made} mayClose={mayClose} />
      {made.prescriptions.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {made.prescriptions.map((course) => (
            <li className="text-sm" key={course.id}>
              <span className="text-muted-foreground">
                {t("prescribe.course")}:{" "}
              </span>
              <CourseLine course={course} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

/**
 * One chain, not two lists: what the round saw, and under it what the Vet made of it. A Diagnosis that answers no
 * Observation stands on its own at the end.
 */
const HealthChain = ({
  detail,
  mayClose,
}: {
  detail: AnimalDetail;
  /** The Vet may say how each ended. */
  mayClose: boolean;
}) => {
  const { t, language } = useLanguage();
  if (detail.observations.length === 0 && detail.diagnoses.length === 0) {
    return null;
  }
  return (
    <Section title={t("animals.healthChain")}>
      <ul className="divide-border flex flex-col divide-y">
        {detail.observations.map((seen) => (
          <li
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
            key={seen.id}
          >
            <div className="flex items-start gap-3">
              <Eye
                aria-hidden
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      seen.withdrawn && "text-muted-foreground line-through"
                    )}
                  >
                    {seen.sawLabel}
                  </span>
                  {seen.withdrawn ? (
                    <StatusBadge tone="neutral">
                      {t("animals.observationWithdrawn")}
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                  <span>
                    {formatDate(new Date(seen.seenAt), language, "dateTime")}
                  </span>
                  {seen.seenByName ? <span>{seen.seenByName}</span> : null}
                  <SeenWhere instanceId={seen.instanceId} note={seen.note} />
                </p>
              </div>
              {/* One seen on the round is put right on its Step; one seen off it is withdrawn here. */}
              {seen.withdrawn || seen.instanceId !== null ? null : (
                <WithdrawSighting id={seen.id} />
              )}
            </div>
            {seen.diagnoses.length > 0 ? (
              <ul className="ml-7 flex flex-col gap-2">
                {seen.diagnoses.map((made) => (
                  <Conclusion key={made.id} made={made} mayClose={mayClose} />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {detail.diagnoses.length > 0 ? (
          <li className="py-3 last:pb-0">
            <ul className="flex flex-col gap-2">
              {detail.diagnoses.map((made) => (
                <Conclusion key={made.id} made={made} mayClose={mayClose} />
              ))}
            </ul>
          </li>
        ) : null}
      </ul>
    </Section>
  );
};

/** Her health, by what somebody came to it for: what was seen and what the Vet made of it, what she has been given —
 *  per animal, not per campaign, the list a slaughter vet asks for — and the visiting Vets called in about her. */
type Owed = Awaited<ReturnType<typeof orpc.animals.dosesOwed.call>>[number];

/** The Vet writing why one of her arrival doses is not needed: kept, and her Release may then go ahead. */
const ExcuseDose = ({
  tagNumber,
  dose,
  onOpenChange,
}: {
  tagNumber: string;
  dose: Owed | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [reason, setReason] = useState("");
  const excuse = useMutation(
    orpc.treatments.excuseArrivalDose.mutationOptions({
      onSuccess: () => {
        setReason("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("animals.doseNotNeededHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        excuse.mutate({
          tagNumber,
          definitionId: dose?.definitionId ?? "",
          reason: reason.trim(),
        })
      }
      open={dose !== null}
      pending={excuse.isPending}
      ready={reason.trim().length >= 3}
      submitLabel={t("animals.doseNotNeeded")}
      title={t("animals.doseNotNeeded")}
    >
      <FormField id="excuse-reason" label={t("animals.doseNotNeededWhy")}>
        <Textarea
          id="excuse-reason"
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

/** The Vet's excuse taken back: the dose is owed again, and raised again for him. */
const TakeBackExcuse = ({
  tagNumber,
  definitionId,
}: {
  tagNumber: string;
  definitionId: string;
}) => {
  const { t } = useLanguage();
  const takeBack = useMutation(
    orpc.treatments.takeBackExcuse.mutationOptions({})
  );
  return (
    <TakeItBack
      choice={t("animals.excuseTakeBackIt")}
      hint={t("animals.excuseTakeBackHint")}
      onSave={(reason) =>
        takeBack.mutateAsync({ tagNumber, definitionId, reason })
      }
      title={t("animals.excuseTakeBack")}
    />
  );
};

/**
 * Her arrival doses still owed — put off, and not given since — each with when it comes round next; the Vet may write
 * why one is not needed, and one excused reads as the Vet's word. Nothing when none.
 */
const DosesOwed = ({
  tagNumber,
  isVet,
  mayRead,
}: {
  tagNumber: string;
  isVet: boolean;
  /** Not for a Vet on a visit: the farm does not open it to them, and asking drew a refusal every time. */
  mayRead: boolean;
}) => {
  const { t, language } = useLanguage();
  const [excusing, setExcusing] = useState<Owed | null>(null);
  const owed = useQuery({
    ...orpc.animals.dosesOwed.queryOptions({ input: { tagNumber } }),
    enabled: mayRead,
  });
  const rows = owed.data ?? [];
  if (rows.length === 0) {
    return null;
  }
  const when = (one: Owed) =>
    one.nextDueAt
      ? t("animals.doseComesRound", {
          day: formatDate(new Date(one.nextDueAt), language, "date"),
        })
      : t("animals.doseNotRaised");
  return (
    <Section title={t("animals.dosesOwed")}>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map((one) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2"
            key={one.definitionId}
          >
            <span className="font-medium">
              {language === "en" ? (one.name.en ?? one.name.bn) : one.name.bn}
            </span>
            {/* Missing from an answer kept from before the Vet could excuse a dose: read as not excused. */}
            {one.excused ? (
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t("animals.doseExcused", { reason: one.excused.reason })}
                </span>
                {isVet ? (
                  <TakeBackExcuse
                    definitionId={one.definitionId}
                    tagNumber={tagNumber}
                  />
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-warning tabular-nums">{when(one)}</span>
                {isVet ? (
                  <Button
                    onClick={() => setExcusing(one)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("animals.doseNotNeeded")}
                  </Button>
                ) : null}
              </span>
            )}
          </li>
        ))}
      </ul>
      <ExcuseDose
        dose={excusing}
        onOpenChange={(open) => {
          if (!open) {
            setExcusing(null);
          }
        }}
        tagNumber={tagNumber}
      />
    </Section>
  );
};

export const HealthTab = ({
  detail,
  powers,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
}) => {
  const { t } = useLanguage();
  const [diagnosing, setDiagnosing] = useState(false);
  const nothingYet =
    detail.observations.length === 0 &&
    detail.diagnoses.length === 0 &&
    detail.treatments.length === 0;
  // The Vet who came to her records what they found here, rather than going to their own page and choosing her again.
  const mayDiagnose = powers.isVet && powers.stillHere;
  return (
    <div className="flex flex-col gap-6">
      {mayDiagnose ? (
        <div className="flex justify-end">
          <Button onClick={() => setDiagnosing(true)} type="button">
            <ClipboardPlus aria-hidden data-icon="inline-start" />
            {t("vet.diagnoseHer")}
          </Button>
          <DiagnosisSheet
            animalTag={detail.tagNumber}
            onOpenChange={setDiagnosing}
            open={diagnosing}
            seen={null}
          />
        </div>
      ) : null}
      {nothingYet ? (
        <EmptyState icon={Stethoscope} title={t("animals.healthNone")} />
      ) : null}
      <HealthChain detail={detail} mayClose={powers.isVet} />
      {detail.treatments.length > 0 ? (
        <Section title={t("animals.treatments")}>
          <DoseTable doses={detail.treatments} mayVoid={powers.runsTheFarm} />
        </Section>
      ) : null}
      <DosesOwed
        isVet={powers.isVet}
        mayRead={!(powers.isVet && !powers.fullVet)}
        tagNumber={detail.tagNumber}
      />
      {/* Calling a vet to her is for an animal still here; the cases she had stay listed either way. */}
      <VetCases
        mayCall={powers.runsTheFarm && powers.stillHere}
        mayRead={powers.runsTheFarm}
        tagNumber={detail.tagNumber}
      />
    </div>
  );
};
