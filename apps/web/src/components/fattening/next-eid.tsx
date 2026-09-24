import type { EidBasis, EidWindow } from "@OpenFarm/domain";
import { farmDayOf, nextEidWindow } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, MoonStar } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Tone } from "@/components/page";
import { Notice, Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

const BASIS_TONE: Record<EidBasis, Tone> = {
  announced: "success",
  expected: "info",
  estimated: "warning",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A farm day, as the reader reads a date. */
export const eidDayWords = (day: string, language: "bn" | "en") =>
  formatDate(new Date(`${day}T06:00:00.000Z`), language, "date");

/**
 * The Eid-ul-Adha the farm is feeding towards, as the server has it — the day announced standing in for the one
 * expected. Before the server has answered, and on a phone that has never asked, the table's own, so a form is never
 * left without a default.
 */
export const useNextEid = (): EidWindow | null => {
  const next = useQuery(orpc.eid.next.queryOptions());
  if (next.data) {
    return next.data.window;
  }
  return nextEidWindow(farmDayOf(new Date()));
};

/** How sure the farm is of the day, as a word with its colour. */
export const EidBasisBadge = ({ basis }: { basis: EidBasis }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={BASIS_TONE[basis]}>
      {t(`eid.basis.${basis}`)}
    </StatusBadge>
  );
};

/** The day the committee announced, in a dialog: the table's day to start from, since it is a day either side. */
export const AnnounceDialog = ({
  open,
  startFrom,
  onOpenChange,
}: {
  open: boolean;
  startFrom: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [day, setDay] = useState(startFrom);
  const announce = useMutation(
    orpc.eid.announce.mutationOptions({
      onSuccess: () => {
        toast.success(t("eid.announced"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("eid.announceHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => announce.mutate({ day })}
      open={open}
      pending={announce.isPending}
      ready={day !== ""}
      submitLabel={t("common.save")}
      title={t("eid.announce")}
    >
      <FormField id="eid-day" label={t("eid.announceDay")}>
        <Input
          id="eid-day"
          onChange={(event) => setDay(event.target.value)}
          required
          type="date"
          value={day}
        />
      </FormField>
    </FormDialog>
  );
};

/** How long until Qurbani, or that it is on. */
export const untilSaid = (
  window: EidWindow,
  { t, language }: Pick<ReturnType<typeof useLanguage>, "t" | "language">
) => {
  const today = farmDayOf(new Date());
  if (today >= window.start) {
    return t("eid.qurbaniOn");
  }
  const days = Math.round(
    (Date.parse(`${window.start}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS
  );
  return t("eid.daysToGo", { days: formatNumber(days, language) });
};

/**
 * The Eid the farm is feeding towards, on the fattening page: its three days, how sure the farm is of them, and how
 * long there is to go. The Owner or the Manager writes the committee's day in once it is announced; the farm's own
 * animals still aimed at the day expected are then offered the move, which is its own act.
 */
export const NextEid = () => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const next = useQuery(orpc.eid.next.queryOptions());
  const [announcing, setAnnouncing] = useState(false);
  const bringAlong = useMutation(
    orpc.eid.bringAlong.mutationOptions({
      onSuccess: (done) => {
        toast.success(
          t("eid.broughtAlong", { count: formatNumber(done.moved, language) })
        );
      },
      onError: refused,
    })
  );
  const window = next.data?.window ?? null;
  if (!window) {
    return null;
  }
  const behind = next.data?.behind ?? 0;
  const inVentures = next.data?.inVentures ?? 0;
  const expectedDay = next.data?.expectedDay ?? null;
  const someToBringAlong = behind !== 0 && expectedDay !== null;
  const someInVentures = inVentures !== 0;
  return (
    <Section
      action={
        <Button
          onClick={() => setAnnouncing(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <CalendarCheck aria-hidden data-icon="inline-start" />
          {t("eid.announce")}
        </Button>
      }
      description={t(`eid.basisHint.${window.basis}`)}
      title={t("eid.title")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MoonStar aria-hidden className="text-muted-foreground size-5" />
        <span className="text-lg font-semibold">
          {eidDayWords(window.start, language)} –{" "}
          {eidDayWords(window.end, language)}
        </span>
        <EidBasisBadge basis={window.basis} />
        <span className="text-muted-foreground text-sm">
          {untilSaid(window, { t, language })}
        </span>
      </div>
      {someToBringAlong ? (
        <Notice
          action={
            <Button
              disabled={bringAlong.isPending}
              onClick={() =>
                bringAlong.mutate({ expectedDay: expectedDay ?? "" })
              }
              size="sm"
              type="button"
            >
              <CalendarClock aria-hidden data-icon="inline-start" />
              {t("eid.bringAlong")}
            </Button>
          }
          title={t("eid.behind", { count: formatNumber(behind, language) })}
          tone="warning"
        />
      ) : null}
      {someInVentures ? (
        <p className="text-muted-foreground text-xs">
          {t("eid.inVentures", { count: formatNumber(inVentures, language) })}
        </p>
      ) : null}
      {announcing ? (
        <AnnounceDialog
          onOpenChange={setAnnouncing}
          open={announcing}
          startFrom={window.start}
        />
      ) : null}
    </Section>
  );
};
