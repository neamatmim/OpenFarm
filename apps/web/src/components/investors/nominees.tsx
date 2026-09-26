import type { PaperNominee } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { FilePen } from "lucide-react";
import { useState } from "react";

import type { Investor } from "@/components/investors/investor-types";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import { NominationSheet } from "./nomination-sheet";
import { phoneLink } from "./phone-link";

type Nomination = NonNullable<Investor["nomination"]>;

/** A farm day as the reader's language writes it. */
const useDay = () => {
  const { language } = useLanguage();
  return (farmDay: string) =>
    formatDate(new Date(`${farmDay}T00:00:00Z`), language);
};

/** One Nominee: who, their relation, when they were born, how to reach them, the share they collect, and — while a
 *  minor — who collects it for them. */
const NomineeLine = ({ nominee }: { nominee: PaperNominee }) => {
  const { t } = useLanguage();
  const day = useDay();
  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-medium">
          {nominee.name}
          {nominee.relation ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {nominee.relation}
            </span>
          ) : null}
        </span>
        <span className="font-semibold tabular-nums">
          {t("nominees.share", { share: nominee.sharePercent })}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {nominee.bornOn ? (
          <span>{t("nominees.born", { day: day(nominee.bornOn) })}</span>
        ) : null}
        {nominee.minor ? (
          <StatusBadge tone="info">{t("nominees.minor")}</StatusBadge>
        ) : null}
        {nominee.phone ? phoneLink(nominee.phone) : null}
      </div>
      {nominee.receiver ? (
        <p className="text-xs">
          {t("nominees.receiver", {
            name: [nominee.receiver.name, nominee.receiver.relation]
              .filter(Boolean)
              .join(" · "),
          })}
          {nominee.receiver.phone ? (
            <> · {phoneLink(nominee.receiver.phone)}</>
          ) : null}
        </p>
      ) : null}
    </li>
  );
};

/** Where a list came from, in words: the paper and its day. */
const FromWhere = ({
  nomination,
}: {
  nomination: Pick<Nomination, "how" | "signedOn" | "hasPhoto"> & {
    ventureName?: string | null;
  };
}) => {
  const { t } = useLanguage();
  const day = useDay();
  return (
    <span>
      {t(`nominees.from.${nomination.how}`, {
        day: day(nomination.signedOn),
        venture: nomination.ventureName ?? "",
      })}
      {nomination.hasPhoto ? <> · {t("nominees.photoKept")}</> : null}
    </span>
  );
};

/** The Nominees of one Nomination, in the order the paper prints them — or plainly none. The Owner's page and the
 *  Investor's own account page read it alike. */
export const NomineeList = ({ nominees }: { nominees: PaperNominee[] }) => {
  const { t } = useLanguage();
  if (nominees.length === 0) {
    return (
      <EmptyState
        bare
        description={t("nominees.noneHint")}
        title={t("nominees.none")}
      />
    );
  }
  return (
    <ul className="divide-y">
      {nominees.map((one) => (
        <NomineeLine key={`${one.name}-${one.sharePercent}`} nominee={one} />
      ))}
    </ul>
  );
};

/** Every earlier Nomination, newest first, each with its paper and day: the history is the farm's answer to a family. */
const Earlier = ({ investorId }: { investorId: string }) => {
  const { t } = useLanguage();
  const { data } = useQuery(
    orpc.investors.nominations.queryOptions({ input: { id: investorId } })
  );
  const earlier = (data ?? []).slice(1);
  if (earlier.length === 0) {
    return null;
  }
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground cursor-pointer text-xs">
        {t("nominees.earlier")}
      </summary>
      <ol className="mt-2 flex flex-col gap-3">
        {earlier.map((one) => (
          <li className="flex flex-col gap-1" key={one.id}>
            <span className="text-muted-foreground text-xs">
              <FromWhere nomination={one} />
            </span>
            <NomineeList nominees={one.nominees} />
          </li>
        ))}
      </ol>
    </details>
  );
};

/**
 * An Investor's Nominees in force, on their page: each with the share they collect and, for a minor, who collects it;
 * where the list came from; a list never signed for said so; and the earlier ones below. Read-only — only a paper the
 * Investor signs changes it.
 */
export const Nominees = ({ investor }: { investor: Investor }) => {
  const { t } = useLanguage();
  const [naming, setNaming] = useState(false);
  // A list cached before Nominations has no such field: nobody on it has one yet.
  const nomination = investor.nomination ?? null;
  const notSignedFor = nomination?.how === "carried_over";
  // A retired Investor signs nothing new until the Owner brings them back.
  const maySign = !investor.retiredAt;
  return (
    <Section
      action={
        <span className="flex flex-wrap items-center gap-2">
          {notSignedFor ? (
            <StatusBadge tone="warning">
              {t("nominees.notSignedFor")}
            </StatusBadge>
          ) : null}
          {maySign ? (
            <Button
              onClick={() => setNaming(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <FilePen aria-hidden data-icon="inline-start" />
              {t("nominees.new")}
            </Button>
          ) : null}
        </span>
      }
      description={t("nominees.hint")}
      title={t("nominees.title")}
    >
      {nomination ? (
        <p className="text-muted-foreground text-xs">
          <FromWhere nomination={nomination} />
          {notSignedFor ? <> · {t("nominees.notSignedForHint")}</> : null}
        </p>
      ) : null}
      <NomineeList nominees={nomination?.nominees ?? []} />
      <Earlier investorId={investor.id} />
      <NominationSheet
        investor={investor}
        onOpenChange={setNaming}
        open={naming}
      />
    </Section>
  );
};
