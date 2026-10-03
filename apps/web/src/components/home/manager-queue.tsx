import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  CalendarClock,
  ClipboardCheck,
  Gavel,
  HandCoins,
  Flame,
  MapPinOff,
  Repeat,
  TrendingDown,
  HeartPulse,
  Milk,
  ShieldAlert,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GivingLessGroup } from "@/components/giving-less";
import { HeatWatchGroup } from "@/components/heat-watch";
import { IllAgainGroup } from "@/components/home/ill-again";
import { LowStockWords } from "@/components/home/low-stock-line";
import { MissingAnimalsGroup } from "@/components/home/missing-animals";
import { MonthlyCostsGroup } from "@/components/home/monthly-costs";
import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
} from "@/components/home/queue";
import { ReceivableOverdueGroup } from "@/components/home/receivable-overdue";
import { StatusBadge, TagChip } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { RepeatBreeder } from "@/components/repeat-breeder";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** The Manager's queue as the farm answers it. */
export type ManagerQueueData = Awaited<
  ReturnType<typeof orpc.home.get.call>
>["queue"];

/** A cow's Tag Number, opening her record. */
const CowTag = ({ tagNumber }: { tagNumber: string }) => (
  <Link params={{ tagNumber }} to="/animals/$tagNumber">
    <TagChip>{tagNumber}</TagChip>
  </Link>
);

/** A piece of work on the queue: its name opening it, and where it is. */
const WorkRow = ({
  row,
}: {
  row: { id: string; sopBn: string; pen: string | null };
}) => {
  const { t } = useLanguage();
  return (
    <QueueRow
      meta={row.pen ?? t("work.wholeFarm")}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ instanceId: row.id }}
          to="/work/$instanceId"
        >
          {row.sopBn}
        </Link>
      }
      trailing={<Opens />}
    />
  );
};

/** An entry that needs a decision: to its work where it has one, to the review queue where it does not. */
const ReviewRow = ({
  row,
}: {
  row: { reason: string; instanceId: string | null };
}) => {
  const { t } = useLanguage();
  const said = t(`review.${row.reason}` as MessageKey);
  return (
    <QueueRow
      title={
        row.instanceId ? (
          <Link
            className="after:absolute after:inset-0 hover:underline"
            params={{ instanceId: row.instanceId }}
            to="/work/$instanceId"
          >
            {said}
          </Link>
        ) : (
          <Link
            className="after:absolute after:inset-0 hover:underline"
            to="/review-queue/needs-review"
          >
            {said}
          </Link>
        )
      }
      trailing={<Opens />}
    />
  );
};

/** The kinds of thing waiting for the Manager, loudest first: the order the tabs read in, and the first one that has
 *  anything is the one the page opens on. */
export const QUEUE_KINDS = [
  "missing",
  "overdue",
  "signOff",
  "review",
  "withdrawal",
  "meatWithdrawal",
  "lowStock",
  "monthlyCosts",
  "receivableOverdue",
  "repeatBreeders",
  "illAgain",
  "heatWatch",
  "givingLess",
] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

/** How many of each kind wait — none for a kind an answer the phone kept from before does not carry. */
const countsOf = (queue: ManagerQueueData): Record<QueueKind, number> => ({
  // Missing from an answer a phone kept from before a Missing was written down.
  missing: queue.missing?.length ?? 0,
  overdue: queue.overdue.length,
  signOff: queue.signOff.length,
  review: queue.needsReview.length,
  withdrawal: queue.withdrawal.length,
  meatWithdrawal: queue.meatWithdrawal.length,
  lowStock: queue.lowStock.length,
  monthlyCosts:
    (queue.monthlyCosts?.costs.length ?? 0) +
    (queue.monthlyCosts?.wages.length ?? 0),
  // Missing from an answer a phone kept from before Receivable was written down.
  receivableOverdue: queue.receivableOverdue?.length ?? 0,
  repeatBreeders: queue.repeatBreeders.length,
  // Missing from an answer a phone kept from before illness was counted.
  illAgain: queue.illAgain?.length ?? 0,
  // Missing from an answer a phone kept from before the heat watch.
  heatWatch: queue.heatWatch?.length ?? 0,
  // Missing from an answer a phone kept from before the list.
  givingLess: queue.givingLess?.length ?? 0,
});

/** Everything waiting for the Manager, every kind counted: what decides whether the day is all clear. */
export const queueWaiting = (queue: ManagerQueueData): number =>
  Object.values(countsOf(queue)).reduce((sum, count) => sum + count, 0);

/** One kind's list, under its own heading or under a tab that already gives it one. */
const QueueKindList = ({
  kind,
  queue,
  mayAnswer,
  headless,
}: {
  kind: QueueKind;
  queue: ManagerQueueData;
  mayAnswer: boolean;
  headless: boolean;
}) => {
  const { t, language } = useLanguage();
  switch (kind) {
    case "overdue": {
      return (
        <QueueGroup
          headless={headless}
          icon={AlarmClock}
          label={t("home.overdue")}
          more={
            <Link className={MORE_LINK} to="/review-queue/overdue">
              {t("home.openList")}
            </Link>
          }
          rows={queue.overdue.map((row) => (
            <WorkRow key={row.id} row={row} />
          ))}
          tone="danger"
        />
      );
    }
    case "signOff": {
      return (
        <QueueGroup
          headless={headless}
          icon={ClipboardCheck}
          label={t("home.signOff")}
          more={
            <Link className={MORE_LINK} to="/review-queue">
              {t("home.openList")}
            </Link>
          }
          rows={queue.signOff.map((row) => (
            <WorkRow key={row.id} row={row} />
          ))}
          tone="info"
        />
      );
    }
    case "review": {
      return (
        <QueueGroup
          headless={headless}
          icon={Gavel}
          label={t("home.needsReview")}
          more={
            <Link className={MORE_LINK} to="/review-queue/needs-review">
              {t("home.openList")}
            </Link>
          }
          rows={queue.needsReview.map((row) => (
            <ReviewRow key={row.id} row={row} />
          ))}
          tone="warning"
        />
      );
    }
    case "withdrawal": {
      return (
        <QueueGroup
          headless={headless}
          icon={Milk}
          label={t("home.withdrawal")}
          rows={queue.withdrawal.map((row) => (
            <QueueRow
              key={row.id}
              leading={<CowTag tagNumber={row.tagNumber} />}
              title={
                row.until
                  ? t("home.until", {
                      date: formatDate(new Date(row.until), language, "date"),
                    })
                  : t("home.withdrawal")
              }
              trailing={
                row.endingSoon ? (
                  <StatusBadge tone="info">{t("home.endingSoon")}</StatusBadge>
                ) : null
              }
            />
          ))}
          tone="warning"
        />
      );
    }
    case "meatWithdrawal": {
      return (
        <QueueGroup
          headless={headless}
          icon={ShieldAlert}
          label={t("home.meatWithdrawal")}
          rows={queue.meatWithdrawal.map((row) => (
            <QueueRow
              key={row.id}
              leading={<CowTag tagNumber={row.tagNumber} />}
              title={
                row.fitForSaleAt
                  ? t("animals.meatHeldUntil", {
                      date: formatDate(
                        new Date(row.fitForSaleAt),
                        language,
                        "date"
                      ),
                    })
                  : t("home.meatWithdrawal")
              }
            />
          ))}
          tone="warning"
        />
      );
    }
    case "lowStock": {
      return (
        <QueueGroup
          headless={headless}
          icon={Wheat}
          label={t("home.lowStock")}
          more={
            <Link className={MORE_LINK} to="/feed">
              {t("home.openList")}
            </Link>
          }
          rows={queue.lowStock.map((line) => (
            <QueueRow
              key={line.feedItemId}
              title={
                <Link
                  className="after:absolute after:inset-0 hover:underline"
                  to="/feed"
                >
                  <LowStockWords line={line} />
                </Link>
              }
              trailing={<Opens />}
            />
          ))}
          tone="warning"
        />
      );
    }
    case "monthlyCosts": {
      return (
        <MonthlyCostsGroup
          headless={headless}
          monthlyCosts={queue.monthlyCosts}
        />
      );
    }
    case "receivableOverdue": {
      return (
        <ReceivableOverdueGroup
          buyers={queue.receivableOverdue}
          headless={headless}
        />
      );
    }
    case "missing": {
      return (
        <MissingAnimalsGroup animals={queue.missing} headless={headless} />
      );
    }
    case "givingLess": {
      return <GivingLessGroup headless={headless} rows={queue.givingLess} />;
    }
    case "heatWatch": {
      return <HeatWatchGroup headless={headless} rows={queue.heatWatch} />;
    }
    case "illAgain": {
      return <IllAgainGroup animals={queue.illAgain} headless={headless} />;
    }
    case "repeatBreeders": {
      return (
        <QueueGroup
          headless={headless}
          icon={HeartPulse}
          label={t("repeatBreeder.title")}
          rows={queue.repeatBreeders.map((row) => (
            <div className="py-3" key={row.animalId}>
              <RepeatBreeder mayAnswer={mayAnswer} row={row} />
            </div>
          ))}
          tone="info"
        />
      );
    }
    default: {
      return null;
    }
  }
};

/**
 * What needs the Manager, loudest first: work gone late, work to check, entries needing a decision, cows whose milk or
 * carcass is held back, feed running low, the month's rent, electricity and wages not entered yet, and cows somebody
 * has to decide about. Each kind shows its first few, with the way to the page that holds all of it.
 *
 * One tab to a kind, and only for a kind with something in it, as the Owner's own list is: the row of tabs, each with
 * its count, is the whole of what waits read at a glance, and one kind at a time below it keeps thirty cows under
 * withdrawal from pushing the late work off a phone. Late work's count is red on its tab, as its heading was. A single
 * kind needs no tabs — a row of one is furniture — and is drawn under its own heading as before.
 */
export const ManagerQueue = ({
  queue,
  mayAnswer,
  chosen,
  onChoose,
}: {
  queue: ManagerQueueData;
  mayAnswer: boolean;
  /** The tab the address asks for, which may name a kind that has since emptied. */
  chosen: QueueKind | undefined;
  onChoose: (kind: QueueKind) => void;
}) => {
  const { t } = useLanguage();
  const counts = countsOf(queue);
  const LABEL: Record<QueueKind, { label: string; icon: LucideIcon }> = {
    missing: { label: t("home.missing"), icon: MapPinOff },
    overdue: { label: t("home.overdue"), icon: AlarmClock },
    signOff: { label: t("home.signOff"), icon: ClipboardCheck },
    review: { label: t("home.needsReview"), icon: Gavel },
    withdrawal: { label: t("home.withdrawal"), icon: Milk },
    meatWithdrawal: { label: t("home.meatWithdrawal"), icon: ShieldAlert },
    lowStock: { label: t("home.lowStock"), icon: Wheat },
    monthlyCosts: { label: t("home.monthlyCosts"), icon: CalendarClock },
    receivableOverdue: { label: t("home.receivableOverdue"), icon: HandCoins },
    repeatBreeders: { label: t("repeatBreeder.title"), icon: HeartPulse },
    illAgain: { label: t("home.illAgain"), icon: Repeat },
    heatWatch: { label: t("heatWatch.title"), icon: Flame },
    givingLess: { label: t("givingLess.title"), icon: TrendingDown },
  };
  const waiting = QUEUE_KINDS.filter((kind) => counts[kind] > 0);
  const [only] = waiting;
  if (!only) {
    return null;
  }
  if (waiting.length === 1) {
    return (
      <QueueKindList
        headless={false}
        kind={only}
        mayAnswer={mayAnswer}
        queue={queue}
      />
    );
  }
  // The kind asked for while it still has something in it; once it empties, the loudest that does.
  const shown = waiting.find((kind) => kind === chosen) ?? only;
  return (
    <PageTabs
      onChange={onChoose}
      tabs={waiting.map((kind) => ({
        value: kind,
        label: LABEL[kind].label,
        icon: LABEL[kind].icon,
        count: counts[kind],
        countTone: kind === "overdue" ? "danger" : undefined,
        content: (
          <QueueKindList
            headless
            kind={kind}
            mayAnswer={mayAnswer}
            queue={queue}
          />
        ),
      }))}
      value={shown}
    />
  );
};
