// What a piece of work says above its board: what raised it, the letter it delivers, what changed, the doses owed.

import type { PaperDocument, SopChange, SopContent } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, timeInDigits } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Notice, Page } from "@/components/page";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import type { BulkOutcome, Changed } from "@/components/work/work-types";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** What the round saw of her, for the Manager's work on an unwell animal: the job is to answer it, so it says what. */
const WhatWasSeen = ({
  seen,
}: {
  seen: {
    /** Missing from an answer a phone kept from before the work named her. */
    tag?: string;
    label: string;
    seenAt: Date;
    note: string | null;
    seenByName: string | null;
  };
}) => {
  const { t, language } = useLanguage();
  return (
    <section className="space-y-1 rounded-xl border p-3 text-sm">
      <h2 className="text-muted-foreground text-xs font-medium">
        {t("unwell.seen")}
      </h2>
      <p className="font-medium">
        {seen.tag ? `${seen.tag} — ` : ""}
        {seen.label}
      </p>
      <p className="text-muted-foreground text-xs">
        {formatDate(seen.seenAt, language, "dateTime")}
        {seen.seenByName ? ` · ${seen.seenByName}` : ""}
      </p>
      {seen.note ? <p>{seen.note}</p> : null}
    </section>
  );
};

/**
 * A Release whose bull still owes an arrival dose says so before it is ticked: the Release will be refused until the dose
 * is given or the Vet writes why it is not needed. Nothing for other work, or a bull who owes nothing.
 */
export const DosesOwedBeforeRelease = ({
  content,
  animals,
}: {
  content: SopContent;
  animals: readonly { tagNumber: string }[];
}) => {
  const { t, language } = useLanguage();
  const releases = content.steps.some(
    (step) => step.effect?.kind === "release"
  );
  const [him] = animals;
  const owed = useQuery({
    ...orpc.animals.dosesOwed.queryOptions({
      input: { tagNumber: him?.tagNumber ?? "" },
    }),
    enabled: releases && animals.length === 1,
  });
  const still = (owed.data ?? []).filter((one) => !one.excused);
  if (!releases || still.length === 0) {
    return null;
  }
  return (
    <Notice
      title={t("work.releaseOwesDoses", {
        doses: still
          .map((one) =>
            language === "en" ? (one.name.en ?? one.name.bn) : one.name.bn
          )
          .join(", "),
      })}
      tone="warning"
    />
  );
};

/**
 * The letter this work exists to deliver, fetched when the Manager asks for it.
 *
 * Written from what the farm already knows, so there is nothing to fill in — the job is to take
 * it to the office and come back with the reference. Asking for it is recorded, because a letter
 * that went is the farm's evidence.
 */
const TheLetter = ({
  report,
}: {
  report: { diagnosisId: string; reference: string | null };
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const letter = useMutation(
    orpc.notifiableDiseases.letter.mutationOptions({
      onSuccess: ({ document }) => setPaper(document),
      onError: refused,
    })
  );

  return (
    <section className="space-y-2 rounded-xl border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{t("notifiable.letterTitle")}</h2>
        {report.reference ? (
          <span className="text-muted-foreground text-xs">
            {report.reference}
          </span>
        ) : null}
      </div>
      <Button
        disabled={letter.isPending}
        onClick={() => letter.mutate({ diagnosisId: report.diagnosisId })}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("notifiable.letter")}
      </Button>
      {/* A paper like every other the farm prints, laid out on the letterhead and printed alone — only the letter on
          the page, not the work board around it. */}
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={t("notifiable.letterTitle")}
        wording={null}
      />
    </section>
  );
};

/** What this work is about, where something raised it that the person must see: the letter a notifiable Diagnosis owes,
 *  or what the round saw of an unwell animal. */
export const WhatRaisedIt = ({
  report,
  seen,
}: {
  report: { diagnosisId: string; reference: string | null } | null;
  /** Missing from an answer a phone kept from before the work said what was seen. */
  seen: Parameters<typeof WhatWasSeen>[0]["seen"] | null | undefined;
}) => (
  <>
    {report ? <TheLetter report={report} /> : null}
    {seen ? <WhatWasSeen seen={seen} /> : null}
  </>
);

/** The work before it arrives: its outline while loading, and a way back to the day's list when it cannot come. */
export const WorkNotShown = ({ error }: { error: Error | null }) => {
  const { t } = useLanguage();
  if (!error) {
    return (
      <Page width="narrow">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }
  const missing = (error as { code?: unknown }).code === "NOT_FOUND";
  return (
    <Page width="narrow">
      <Notice
        action={
          <Link className={buttonVariants({ variant: "outline" })} to="/work">
            {t("nav.today")}
          </Link>
        }
        title={missing ? t("common.notFound") : t("common.loadFailed")}
        tone="danger"
      />
    </Page>
  );
};

/** What the person should know before working: an older Version still running, or the Pen fed short. */
export const WorkNotices = ({
  runningOn,
  shortFed,
  state,
}: {
  runningOn: number | null | undefined;
  shortFed: { shortfallPercent: number } | null | undefined;
  /** Where the work stands: closed work says so, so nobody records on it for nothing. */
  state: string;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {state === "called_off" ? (
        <Notice title={t("work.calledOff")} tone="info" />
      ) : null}

      {state === "missed" ? (
        <Notice title={t("work.closedAsMissed")} tone="warning" />
      ) : null}

      {runningOn ? (
        <Notice
          title={t("changed.onOlder", { number: runningOn })}
          tone="info"
        />
      ) : null}

      {shortFed ? (
        <Notice
          title={t("work.shortFed", { percent: shortFed.shortfallPercent })}
          tone="warning"
        />
      ) : null}
    </>
  );
};

/** Every kind of change has something to say. Typed by the kind rather than by string, so a
 *  new one is a compile error here rather than a blank line — or, before this was a map, a
 *  white screen on the job when the key was missing. */
const CHANGE_MESSAGE: Record<SopChange["kind"], MessageKey> = {
  step_added: "changed.step_added",
  step_removed: "changed.step_removed",
  step_reworded: "changed.step_reworded",
  step_evidence: "changed.step_evidence",
  step_skip_reasons: "changed.step_skip_reasons",
  step_per_animal: "changed.step_per_animal",
  step_effect: "changed.step_effect",
  steps_reordered: "changed.steps_reordered",
  purpose_changed: "changed.purpose_changed",
  times_changed: "changed.times_changed",
  grace_changed: "changed.grace_changed",
  who_changed: "changed.who_changed",
  checker_changed: "changed.checker_changed",
  now_whole_farm: "changed.now_whole_farm",
  now_per_pen: "changed.now_per_pen",
};

/** Each change between two Versions, a line each, in the words of the job: on work, and on a proposal waiting. */
export const ChangeLines = ({ changes }: { changes: SopChange[] }) => {
  const { t, language } = useLanguage();
  /** The Step's own words in the reader's language, and a Role named rather than spelled. */
  const said = (change: SopChange): Record<string, string | number> => {
    const words = (value: { bn: string; en?: string }) =>
      (language === "en" ? value.en : value.bn) ?? value.bn;
    return {
      ...("step" in change ? { step: words(change.step) } : {}),
      ...("was" in change ? { was: words(change.was) } : {}),
      ...("times" in change
        ? {
            times: change.times
              .map((at) => timeInDigits(at, language))
              .join(", "),
          }
        : {}),
      ...("minutes" in change ? { minutes: change.minutes } : {}),
      ...("role" in change
        ? {
            role: change.role ? t(`role.${change.role}`) : t("sop.checkerNone"),
          }
        : {}),
    };
  };
  return (
    <ul className="mt-1 list-disc space-y-1 ps-5">
      {changes.map((change, index) => (
        <li key={`${change.kind}-${index}`}>
          {t(CHANGE_MESSAGE[change.kind], said(change))}
        </li>
      ))}
    </ul>
  );
};

/**
 * What changed in this Version, the first time somebody opens work on it — in the words of
 * the job rather than as a list of fields. It stays until they have done the work once,
 * which is the farm's evidence they read it: there is no button, because a button between
 * somebody and the job is a button that gets pressed without reading (notification
 * channels, R1).
 */
export const WhatChanged = ({ changed }: { changed: Changed }) => {
  const { t } = useLanguage();
  return (
    <Notice title={t("changed.title")} tone="info">
      <p>{t("changed.versions", { from: changed.from, to: changed.to })}</p>
      <ChangeLines changes={changed.changes} />
    </Notice>
  );
};

/** What the tank reading came to. A difference beyond the farm's tolerance has already been
 *  flagged for the Manager server-side; this says so, rather than asking the person to fix
 *  it in the parlor. */
export const BulkOutcomeBanner = ({ outcome }: { outcome: BulkOutcome }) => {
  const { t, language } = useLanguage();
  const liters = new Intl.NumberFormat(
    language === "bn" ? "bn-BD" : "en-GB"
  ).format(Math.abs(outcome.differenceLiters));
  return (
    <Notice
      title={
        outcome.differenceLiters === 0
          ? t("milk.matched")
          : t("milk.difference", { liters })
      }
      tone={outcome.flagged ? "warning" : "success"}
    >
      {outcome.flagged ? t("milk.flagged") : null}
    </Notice>
  );
};
