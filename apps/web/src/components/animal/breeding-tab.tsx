import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Baby, CalendarHeart, Flame, HeartCrack } from "lucide-react";

import {
  CalvingTable,
  PregnancyCheckTable,
  ServiceTable,
} from "@/components/animal-histories";
import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { EmptyState, RecordList, RecordRow, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { day } from "@/lib/correcting";
import { orpc } from "@/utils/orpc";

import type { AnimalAct, AnimalDetail, AnimalPowers } from "./animal-types";

/** Her Expected Calving put right — a service date written wrong, or a vet's scan that says otherwise. */
const ExpectedCalvingCorrection = ({
  tagNumber,
  expectedCalvingAt,
}: {
  tagNumber: string;
  expectedCalvingAt: Date;
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    expectedCalvingOn: day(expectedCalvingAt),
  });
  const correct = useMutation(
    orpc.animals.correctExpectedCalving.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          tagNumber,
          changes: correcting.changes(),
          reason,
        });
      }}
      ready={correcting.changed}
      title={t("correct.calving")}
    >
      <CorrectionAnswer
        label={t("pregnancy.expectedOn")}
        onChange={(value) => correcting.set("expectedCalvingOn", value)}
        type="date"
        value={correcting.typed.expectedCalvingOn ?? ""}
      />
    </CorrectionDialog>
  );
};

/**
 * When she has been seen in heat, newest first, and the AI work each heat raised. Nothing at all for a cow who never
 * has — a heading over an empty list reads as a record that something went missing. A second sighting of the same heat
 * raised nothing, and says so by having no work beside it.
 */
const HerHeats = ({ heats }: { heats: AnimalDetail["heats"] }) => {
  const { t, language } = useLanguage();
  if (heats.length === 0) {
    return null;
  }
  return (
    <Section title={t("heat.title")}>
      <RecordList>
        {heats.map((heat) => (
          <RecordRow
            key={heat.id}
            leading={
              <Flame aria-hidden className="text-muted-foreground size-4" />
            }
            meta={t("heat.seen")}
            title={formatDate(new Date(heat.seenAt), language, "dateTime")}
            trailing={
              heat.workId ? (
                <Link
                  className="text-sm underline underline-offset-4"
                  params={{ instanceId: heat.workId }}
                  to="/work/$instanceId"
                >
                  {t("heat.work")}
                </Link>
              ) : null
            }
          />
        ))}
      </RecordList>
    </Section>
  );
};

/**
 * Every time she has been served, newest first, each naming the heat it answered. The ones that did not take stay on
 * the page, because a run of them is exactly what somebody deciding about a Repeat Breeder needs to see.
 */
const HerServices = ({ detail }: { detail: AnimalDetail }) => {
  const { t } = useLanguage();
  if (detail.services.length === 0) {
    return null;
  }
  return (
    <Section title={t("service.title")}>
      <ServiceTable heats={detail.heats} services={detail.services} />
    </Section>
  );
};

/**
 * What the Vet found, newest first, and what follows from it: when she is expected to calve, and how many attempts did
 * not take. Both are worked out from the checks — nothing here is typed.
 */
const HerPregnancyChecks = ({
  detail,
  mayCorrect,
}: {
  detail: AnimalDetail;
  mayCorrect: boolean;
}) => {
  const { t, language } = useLanguage();
  const { pregnancyChecks: checks, expectedCalvingAt, failedAttempts } = detail;
  if (checks.length === 0 && !expectedCalvingAt) {
    return null;
  }
  return (
    <Section
      description={
        failedAttempts > 0
          ? t("pregnancy.failedAttempts", { count: failedAttempts })
          : undefined
      }
      title={t("pregnancy.title")}
    >
      {expectedCalvingAt ? (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <CalendarHeart aria-hidden className="text-primary size-4" />
            {t("pregnancy.expectedCalving", {
              when: formatDate(new Date(expectedCalvingAt), language),
            })}
          </p>
          {mayCorrect ? (
            <ExpectedCalvingCorrection
              expectedCalvingAt={expectedCalvingAt}
              tagNumber={detail.tagNumber}
            />
          ) : null}
        </div>
      ) : null}
      {checks.length > 0 ? <PregnancyCheckTable checks={checks} /> : null}
    </Section>
  );
};

/** Every time she has calved, newest first, and what was born: each calf by its own number, a stillborn one included,
 *  so a cow's page says what she has produced. */
const HerCalvings = ({ calvings }: { calvings: AnimalDetail["calvings"] }) => {
  const { t } = useLanguage();
  if (calvings.length === 0) {
    return null;
  }
  return (
    <Section title={t("calving.title")}>
      <CalvingTable calvings={calvings} />
    </Section>
  );
};

/** The pregnancies she lost before calving, and — for the Vet, while she is carrying — the way to record one. */
const HerAbortions = ({
  abortions,
  mayRecord,
  onAct,
}: {
  abortions: AnimalDetail["abortions"];
  mayRecord: boolean;
  onAct: (act: AnimalAct) => void;
}) => {
  const { t, language } = useLanguage();
  if (abortions.length === 0 && !mayRecord) {
    return null;
  }
  return (
    <Section
      action={
        mayRecord ? (
          <Button
            onClick={() => onAct("abortion")}
            size="sm"
            type="button"
            variant="outline"
          >
            <HeartCrack aria-hidden data-icon="inline-start" />
            {t("abortion.record")}
          </Button>
        ) : null
      }
      title={t("abortion.title")}
    >
      {abortions.length > 0 ? (
        <RecordList>
          {abortions.map((one) => (
            <RecordRow
              key={one.id}
              meta={one.note}
              title={`${formatDate(new Date(one.abortedAt), language)} · ${t(
                "abortion.stage",
                { months: one.stageMonths }
              )}`}
            />
          ))}
        </RecordList>
      ) : (
        <EmptyState bare title={t("animals.noAbortions")} />
      )}
    </Section>
  );
};

/** Whether her page has anything to say about her breeding, or anything the reader may record there. */
export const hasBreeding = (detail: AnimalDetail, powers: AnimalPowers) =>
  detail.heats.length > 0 ||
  detail.services.length > 0 ||
  detail.pregnancyChecks.length > 0 ||
  detail.expectedCalvingAt !== null ||
  detail.calvings.length > 0 ||
  detail.abortions.length > 0 ||
  (powers.isVet && detail.expectedCalvingAt !== null);

/** Her breeding as one story: the heats she was seen in, the services they led to, what the Vet found, the calves she
 *  had, and the pregnancies she lost. */
export const BreedingTab = ({
  detail,
  powers,
  onAct,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
  onAct: (act: AnimalAct) => void;
}) => {
  const { t } = useLanguage();
  if (!hasBreeding(detail, powers)) {
    return (
      <EmptyState
        description={t("animals.breedingNoneHint")}
        icon={Baby}
        title={t("animals.breedingNone")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <HerPregnancyChecks detail={detail} mayCorrect={powers.runsTheFarm} />
      <HerHeats heats={detail.heats} />
      <HerServices detail={detail} />
      <HerCalvings calvings={detail.calvings} />
      <HerAbortions
        abortions={detail.abortions}
        mayRecord={powers.isVet && detail.expectedCalvingAt !== null}
        onAct={onAct}
      />
    </div>
  );
};
