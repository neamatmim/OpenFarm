import { feedUnitWord } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  ClipboardCheck,
  Gavel,
  HeartPulse,
  Milk,
  ShieldAlert,
  Wheat,
} from "lucide-react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
} from "@/components/home/queue";
import { StatusBadge, TagChip } from "@/components/page";
import { RepeatBreeder } from "@/components/repeat-breeder";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** The Manager's queue as the farm answers it. */
export type ManagerQueueData = Awaited<
  ReturnType<typeof orpc.home.manager.call>
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
            search={{ tab: "review" }}
            to="/admin/sign-off"
          >
            {said}
          </Link>
        )
      }
      trailing={<Opens />}
    />
  );
};

/**
 * What needs the Manager, loudest first: work gone late, work to check, entries needing a decision, cows whose milk or
 * carcass is held back, feed running low, and cows somebody has to decide about. Each kind shows its first few, with
 * the way to the page that holds all of it.
 */
export const ManagerQueue = ({
  queue,
  mayAnswer,
}: {
  queue: ManagerQueueData;
  mayAnswer: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-6">
      <QueueGroup
        icon={AlarmClock}
        label={t("home.overdue")}
        more={
          <Link
            className={MORE_LINK}
            search={{ tab: "late" }}
            to="/admin/sign-off"
          >
            {t("home.openList")}
          </Link>
        }
        rows={queue.overdue.map((row) => (
          <WorkRow key={row.id} row={row} />
        ))}
        tone="danger"
      />

      <QueueGroup
        icon={ClipboardCheck}
        label={t("home.signOff")}
        more={
          <Link className={MORE_LINK} to="/admin/sign-off">
            {t("home.openList")}
          </Link>
        }
        rows={queue.signOff.map((row) => (
          <WorkRow key={row.id} row={row} />
        ))}
        tone="info"
      />

      <QueueGroup
        icon={Gavel}
        label={t("home.needsReview")}
        more={
          <Link
            className={MORE_LINK}
            search={{ tab: "review" }}
            to="/admin/sign-off"
          >
            {t("home.openList")}
          </Link>
        }
        rows={queue.needsReview.map((row) => (
          <ReviewRow key={row.id} row={row} />
        ))}
        tone="warning"
      />

      <QueueGroup
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

      <QueueGroup
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

      <QueueGroup
        icon={Wheat}
        label={t("home.lowStock")}
        more={
          <Link className={MORE_LINK} to="/admin/feed">
            {t("home.openList")}
          </Link>
        }
        rows={queue.lowStock.map((line) => (
          <QueueRow
            key={line.feedItemId}
            title={
              <Link
                className="after:absolute after:inset-0 hover:underline"
                to="/admin/feed"
              >
                {t("home.lowStockLine", {
                  feed: line.nameBn,
                  onHand: formatNumber(line.onHand, language),
                  unit: feedUnitWord(line.unit, language),
                  threshold: formatNumber(line.threshold, language),
                })}
              </Link>
            }
            trailing={<Opens />}
          />
        ))}
        tone="warning"
      />

      <QueueGroup
        icon={HeartPulse}
        label={t("repeatBreeder.title")}
        rows={queue.repeatBreeders.map((row) => (
          <div className="py-3" key={row.animalId}>
            <RepeatBreeder mayAnswer={mayAnswer} row={row} />
          </div>
        ))}
        tone="info"
      />
    </div>
  );
};
