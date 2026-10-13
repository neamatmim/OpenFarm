import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, numberAsTyped } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Circle, CircleCheck } from "lucide-react";
import { useState } from "react";

import { useIsOwner } from "@/components/money";
import {
  Loaded,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  RecordList,
  RecordRow,
  Section,
  StatusBadge,
  TableSkeleton,
} from "@/components/page";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { GoingLiveRow } from "@/lib/going-live-rows";
import {
  GOING_LIVE_ROWS,
  PAPER_FREE_DAYS,
  goingLiveDone,
  goingLiveProgress,
} from "@/lib/going-live-rows";
import { onlyFor } from "@/lib/guard";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type GoingLive = Awaited<ReturnType<typeof orpc.goingLive.get.call>>;

/** Where each line is done: the page that does it, or the form on this page. */
const ROW_PLACE: Record<GoingLiveRow, string> = {
  identity: "/farm",
  certificate: "/farm",
  backup: "/farm/backups",
  manager: "/farm/people",
  vet: "/farm/people",
  medicines: "/drugs",
  staff: "/farm/people",
  phones: "/farm/shed-phones",
  monthlyCosts: "/farm/money",
  register: "/sheds",
  photos: "/animals",
  count: "#opening-count",
  procedures: "/sops",
  doses: "/sops",
  training: "/sops",
  paper: "#paper-put-away",
};

/** A day the farm kept as `YYYY-MM-DD`, in the reader's words. */
const sayDay = (day: string, language: "bn" | "en") =>
  formatDate(new Date(`${day}T12:00:00`), language, "date");

type Said = [MessageKey, MessageParams?];

/** Whether a Role is held, or invited, as the line says it. */
const roleSaid = (held: boolean): Said =>
  held ? ["goingLive.meta.role"] : ["goingLive.meta.roleMissing"];

/** What each line says beneath its name: the figure its records give, in the reader's words. */
const META: Record<
  GoingLiveRow,
  (live: GoingLive, language: "bn" | "en") => Said
> = {
  identity: (live) =>
    live.identity && live.registration
      ? ["goingLive.meta.identity"]
      : ["goingLive.meta.identityMissing"],
  certificate: (live) =>
    live.certificate
      ? ["goingLive.meta.certificate"]
      : ["goingLive.meta.certificateMissing"],
  backup: (live, language) =>
    live.copiedLately && live.lastGoodCopyAt
      ? [
          "goingLive.meta.backup",
          {
            date: formatDate(
              new Date(live.lastGoodCopyAt),
              language,
              "dateTime"
            ),
          },
        ]
      : ["goingLive.meta.backupNone"],
  manager: (live) => roleSaid(live.manager),
  vet: (live) => roleSaid(live.vet),
  medicines: (live) => ["goingLive.meta.medicines", live.medicines],
  staff: (live) => ["goingLive.meta.staff", live.staff],
  phones: (live) => ["goingLive.meta.phones", live.phones],
  monthlyCosts: (live) => [
    "goingLive.meta.monthlyCosts",
    { count: live.monthlyCosts },
  ],
  register: (live) => [
    "goingLive.meta.register",
    { count: live.herd.onRegister },
  ],
  photos: (live) => ["goingLive.meta.photos", live.herd],
  count: (live, language) =>
    live.openingCount
      ? [
          "goingLive.meta.count",
          {
            counted: live.openingCount.counted,
            onRegister: live.openingCount.onRegister,
            date: sayDay(live.openingCount.countedOn, language),
          },
        ]
      : ["goingLive.meta.countNone"],
  procedures: (live) => [
    "goingLive.meta.procedures",
    {
      adopted: live.procedures.standardAdopted,
      total: live.procedures.standardTotal,
      own: live.procedures.own,
    },
  ],
  doses: (live) => [
    "goingLive.meta.doses",
    {
      adopted: live.procedures.doseAdopted,
      total: live.procedures.doseTotal,
    },
  ],
  training: (live) => ["goingLive.meta.training", live.trained],
  paper: (live, language) =>
    live.paperPutAway
      ? [
          "goingLive.meta.paper",
          {
            day: live.paperPutAway.day,
            of: PAPER_FREE_DAYS,
            date: sayDay(live.paperPutAway.on, language),
          },
        ]
      : ["goingLive.meta.paperNone"],
};

/** One line of the checklist: done or not, what it is, what its records say, and a way to the page that does it. */
const ChecklistRow = ({
  row,
  live,
  done,
}: {
  row: GoingLiveRow;
  live: GoingLive;
  done: boolean;
}) => {
  const { t, language } = useLanguage();
  const [key, params] = META[row](live, language);
  const place = ROW_PLACE[row];
  const title = t(`goingLive.row.${row}`);
  return (
    <RecordRow
      leading={
        done ? (
          <CircleCheck aria-hidden className="text-success size-5" />
        ) : (
          <Circle aria-hidden className="text-muted-foreground size-5" />
        )
      }
      meta={t(key, params)}
      title={
        place.startsWith("#") ? (
          <a className="after:absolute after:inset-0" href={place}>
            {title}
          </a>
        ) : (
          <Link className="after:absolute after:inset-0" to={place}>
            {title}
          </Link>
        )
      }
      trailing={
        <span className="flex items-center gap-2">
          <StatusBadge tone={done ? "success" : "neutral"}>
            {done ? t("goingLive.done") : t("goingLive.left")}
          </StatusBadge>
          <ChevronRight aria-hidden className="text-muted-foreground size-4" />
        </span>
      }
    />
  );
};

/** The Owner's count of the sheds on the tagging walk's day, set beside the register. */
const OpeningCount = ({
  live,
  isOwner,
}: {
  live: GoingLive;
  isOwner: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [counted, setCounted] = useState("");
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const save = useMutation(
    orpc.goingLive.countOpening.mutationOptions({
      onSuccess: () => {
        toast.success(t("goingLive.count.saved"));
        setCounted("");
      },
      onError: refused,
    })
  );
  const said = live.openingCount;
  const figure = Number(numberAsTyped(counted));
  const typed =
    counted.trim() !== "" && Number.isInteger(figure) && figure > -1;
  return (
    <Section
      className="scroll-mt-6"
      description={t("goingLive.count.hint")}
      id="opening-count"
      title={t("goingLive.count.title")}
    >
      <div className="flex flex-col gap-4">
        {said ? (
          <Notice
            title={
              said.counted === said.onRegister
                ? t("goingLive.count.agrees")
                : t("goingLive.count.differs", {
                    counted: said.counted,
                    onRegister: said.onRegister,
                  })
            }
            tone={said.counted === said.onRegister ? "success" : "warning"}
          />
        ) : null}
        {isOwner ? (
          <form
            className="grid max-w-xl gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed) {
                save.mutate({ counted: figure, day });
              }
            }}
          >
            <FormField
              id="opening-counted"
              label={t("goingLive.count.counted")}
            >
              <Input
                id="opening-counted"
                inputMode="numeric"
                onChange={(event) => setCounted(event.target.value)}
                value={counted}
              />
            </FormField>
            <FormField id="opening-day" label={t("goingLive.count.day")}>
              <Input
                id="opening-day"
                max={farmDayOf(new Date())}
                onChange={(event) => setDay(event.target.value)}
                type="date"
                value={day}
              />
            </FormField>
            <Button disabled={!typed || !day || save.isPending} type="submit">
              {save.isPending ? <Spinner /> : null}
              {t("goingLive.count.save")}
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("goingLive.count.ownerOnly")}
          </p>
        )}
      </div>
    </Section>
  );
};

/** The Owner's word on the day the paper register was put away, the thirty days counted from it. */
const PaperPutAway = ({ isOwner }: { isOwner: boolean }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const save = useMutation(
    orpc.goingLive.putPaperAway.mutationOptions({
      onSuccess: () => {
        toast.success(t("goingLive.paper.saved"));
      },
      onError: refused,
    })
  );
  return (
    <Section
      className="scroll-mt-6"
      description={t("goingLive.paper.hint")}
      id="paper-put-away"
      title={t("goingLive.paper.title")}
    >
      {isOwner ? (
        <form
          className="grid max-w-md gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (day) {
              save.mutate({ day });
            }
          }}
        >
          <FormField id="paper-day" label={t("goingLive.paper.day")}>
            <Input
              id="paper-day"
              max={farmDayOf(new Date())}
              onChange={(event) => setDay(event.target.value)}
              type="date"
              value={day}
            />
          </FormField>
          <Button disabled={!day || save.isPending} type="submit">
            {save.isPending ? <Spinner /> : null}
            {t("goingLive.paper.save")}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("goingLive.paper.ownerOnly")}
        </p>
      )}
    </Section>
  );
};

/**
 * Going live: the paper checklist the farm finishes Release 1 by, read from the farm's own records as far as they can
 * answer it — and the Owner's word on the two things no record holds, the herd counted in the sheds and the day the
 * paper register was put away. The Owner's and the Manager's to read; the two words are the Owner's to give.
 */
const GoingLivePage = () => {
  const { t } = useLanguage();
  const isOwner = useIsOwner();
  const live = useQuery(orpc.goingLive.get.queryOptions());
  const { data } = live;
  const done = data ? goingLiveDone(data) : null;
  const progress = data ? goingLiveProgress(data) : null;
  return (
    <Page>
      <PageHeader
        actions={
          progress ? (
            <StatusBadge
              tone={progress.done === progress.of ? "success" : "info"}
            >
              {t("goingLive.progress", progress)}
            </StatusBadge>
          ) : null
        }
        description={t("goingLive.subtitle")}
        eyebrow={t("nav.identity")}
        title={t("settings.section.goingLive")}
      />
      {progress ? (
        <ProgressBar
          label={t("goingLive.progress", progress)}
          value={(progress.done / progress.of) * 100}
        />
      ) : null}
      <Section
        description={t("goingLive.checklistHint")}
        title={t("goingLive.checklist")}
      >
        <Loaded query={live} skeleton={<TableSkeleton />}>
          {data && done ? (
            <RecordList>
              {GOING_LIVE_ROWS.map((row) => (
                <ChecklistRow
                  done={done[row]}
                  key={row}
                  live={data}
                  row={row}
                />
              ))}
            </RecordList>
          ) : null}
        </Loaded>
      </Section>
      {data ? <OpeningCount isOwner={isOwner} live={data} /> : null}
      <PaperPutAway isOwner={isOwner} />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/going-live")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: GoingLivePage,
});
