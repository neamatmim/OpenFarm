import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  BadgeCheck,
  BookOpenCheck,
  Check,
  CircleCheck,
  FileBadge,
  Gavel,
  HandCoins,
  Milk,
  Wheat,
} from "lucide-react";
import { toast } from "sonner";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
  ROW_LINK,
} from "@/components/home/queue";
import { categoryName, useApproveMoney } from "@/components/money";
import { ProgressBar, StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** The Owner's exception list as the farm answers it. */
export type NeedsYou = Awaited<
  ReturnType<typeof orpc.home.owner.call>
>["needsYou"];

/** The day's work as the farm counts it. */
type Tiles = Awaited<ReturnType<typeof orpc.home.owner.call>>["tiles"];

/** How many money rows show before the rest wait behind "show all": a pile of approvals is read by its total first. */
const MONEY_FIRST_SHOWN = 3;

/** What waits on the Owner's own word: work to sign off, proposals, money, entries to decide, the Registration. */
export const decisionsWaiting = (needsYou: NeedsYou): number =>
  needsYou.approvals.length +
  needsYou.proposals.length +
  needsYou.needsReview.length +
  needsYou.moneyAwaiting.length +
  (needsYou.registrationRenewal ? 1 : 0);

/** The taka the money awaiting approval comes to, whichever way it goes. */
export const moneyAwaitingTotal = (needsYou: NeedsYou): number =>
  needsYou.moneyAwaiting.reduce((sum, row) => sum + row.amountBdt, 0);

/** The act at the end of a row: on a phone, big enough for a thumb. */
const ROW_ACT = "relative h-11 md:h-8";

/** The Registration's renewal on the Owner's list: to the renewal work when it has been raised, and to the farm
 *  page when it has not. */
const RenewalRow = ({
  renewal,
}: {
  renewal: NonNullable<NeedsYou["registrationRenewal"]>;
}) => {
  const { t, language } = useLanguage();
  const said = t(
    renewal.expired ? "owner.registrationExpired" : "owner.registrationEnding",
    {
      date: renewal.expiresOn
        ? formatDate(renewal.expiresOn, language, "date")
        : "—",
    }
  );
  return (
    <QueueRow
      title={
        renewal.instanceId ? (
          <Link
            className={ROW_LINK}
            params={{ instanceId: renewal.instanceId }}
            to="/work/$instanceId"
          >
            {said}
          </Link>
        ) : (
          <Link className={ROW_LINK} to="/admin/farm">
            {said}
          </Link>
        )
      }
      trailing={<Opens />}
    />
  );
};

/** Money waiting on the Owner: what it all comes to beside how many, the first few approved where they stand. */
const MoneyGroup = ({ needsYou }: { needsYou: NeedsYou }) => {
  const { t, language } = useLanguage();
  const approveMoney = useApproveMoney();
  return (
    <QueueGroup
      aside={t("owner.moneyTotal", {
        taka: `৳${formatNumber(moneyAwaitingTotal(needsYou), language)}`,
      })}
      firstShown={MONEY_FIRST_SHOWN}
      icon={HandCoins}
      label={t("owner.moneyAwaiting")}
      more={
        <Link className={MORE_LINK} to="/money">
          {t("home.openList")}
        </Link>
      }
      rows={needsYou.moneyAwaiting.map((row) => (
        <QueueRow
          key={row.id}
          meta={
            // Whose money is waiting, where it is not the Farm's: she is approving somebody else's
            // spending, and ought to be told so before she approves it.
            [row.counterpartyName, row.purseName].filter(Boolean).join(" · ") ||
            undefined
          }
          title={
            <Link className="hover:underline" to="/money">
              {categoryName(row, language)} ·{" "}
              <span className="tabular-nums">
                ৳{formatNumber(row.amountBdt, language)}
              </span>
            </Link>
          }
          trailing={
            <Button
              className={ROW_ACT}
              disabled={approveMoney.isPending}
              onClick={() =>
                approveMoney.mutate({ id: row.id, amountBdt: row.amountBdt })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Check aria-hidden data-icon="inline-start" />
              {t("money.approve")}
            </Button>
          }
        />
      ))}
      tone="warning"
    />
  );
};

/** Playbook proposals, approved and published where they stand. */
const ProposalGroup = ({ needsYou }: { needsYou: NeedsYou }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <QueueGroup
      icon={BookOpenCheck}
      label={t("owner.proposals")}
      more={
        <Link className={MORE_LINK} to="/admin/sops">
          {t("home.openList")}
        </Link>
      }
      rows={needsYou.proposals.map((row) => (
        <QueueRow
          key={row.id}
          title={
            <Link className="hover:underline" to="/admin/sops">
              {row.note || t("owner.noNote")}
            </Link>
          }
          trailing={
            <Button
              className={ROW_ACT}
              disabled={approve.isPending}
              onClick={() => approve.mutate({ id: row.id })}
              size="sm"
              type="button"
              variant="outline"
            >
              <Check aria-hidden data-icon="inline-start" />
              {t("sop.approve")}
            </Button>
          }
        />
      ))}
      tone="info"
    />
  );
};

/** Entries the farm could not settle by itself, each opening the work it belongs to. */
const ReviewGroup = ({ needsYou }: { needsYou: NeedsYou }) => {
  const { t } = useLanguage();
  return (
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
      rows={needsYou.needsReview.map((row) => {
        const said = t(`review.${row.reason}` as MessageKey);
        return (
          <QueueRow
            key={row.id}
            title={
              row.instanceId ? (
                <Link
                  className={ROW_LINK}
                  params={{ instanceId: row.instanceId }}
                  to="/work/$instanceId"
                >
                  {said}
                </Link>
              ) : (
                <Link
                  className={ROW_LINK}
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
      })}
      tone="warning"
    />
  );
};

/**
 * What only the Owner can settle, and nothing else: the Registration, work waiting on their own word, Playbook
 * proposals, money awaiting approval, and entries needing a decision. A proposal and a sum of money are approved where
 * they stand; everything else opens what it is about.
 */
export const OwnerDecisions = ({ needsYou }: { needsYou: NeedsYou }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-6">
      <QueueGroup
        icon={FileBadge}
        label={t("owner.registrationRenewal")}
        rows={
          needsYou.registrationRenewal
            ? [
                <RenewalRow
                  key="renewal"
                  renewal={needsYou.registrationRenewal}
                />,
              ]
            : []
        }
        tone="warning"
      />

      <QueueGroup
        icon={BadgeCheck}
        label={t("owner.approvals")}
        more={
          <Link className={MORE_LINK} to="/admin/sign-off">
            {t("home.openList")}
          </Link>
        }
        rows={needsYou.approvals.map((row) => (
          <QueueRow
            key={row.id}
            meta={row.pen ?? t("work.wholeFarm")}
            title={
              <Link
                className={ROW_LINK}
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn}
              </Link>
            }
            trailing={<Opens />}
          />
        ))}
        tone="info"
      />

      <ProposalGroup needsYou={needsYou} />
      <MoneyGroup needsYou={needsYou} />
      <ReviewGroup needsYou={needsYou} />
    </div>
  );
};

/** How far the day's work has got, and the way to all of it. */
const DayProgress = ({ tiles }: { tiles: Tiles }) => {
  const { t, language } = useLanguage();
  const donePercent =
    tiles.workRaised === 0
      ? 0
      : Math.round((tiles.workDone / tiles.workRaised) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{t("home.workDone")}</span>
        <Link
          className="text-primary tabular-nums underline-offset-4 hover:underline"
          search={{}}
          to="/today"
        >
          {t("home.progress", {
            done: formatNumber(tiles.workDone, language),
            raised: formatNumber(tiles.workRaised, language),
          })}
        </Link>
      </div>
      <ProgressBar label={t("home.workDone")} value={donePercent} />
    </div>
  );
};

/**
 * The farm going about its day, which the Manager is minding: how much of the work is done, what is late, feed running
 * low, and Withdrawals ending. The Owner reads it to know, not to act — it sits below what only they can settle.
 */
export const FarmToday = ({
  needsYou,
  tiles,
}: {
  needsYou: NeedsYou;
  tiles: Tiles;
}) => {
  const { t, language } = useLanguage();
  const quiet =
    needsYou.overdue.length +
      needsYou.lowStock.length +
      needsYou.endingWithdrawal.length ===
    0;
  return (
    <div className="flex flex-col gap-6">
      <DayProgress tiles={tiles} />

      {quiet ? (
        <p className="text-success flex items-center gap-2 text-sm">
          <CircleCheck aria-hidden className="size-4" />
          {t("owner.nothingLate")}
        </p>
      ) : null}

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
        rows={needsYou.overdue.map((row) => (
          <QueueRow
            key={row.id}
            meta={row.pen ?? t("work.wholeFarm")}
            title={
              <Link
                className={ROW_LINK}
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn}
              </Link>
            }
            trailing={
              row.escalated ? (
                <StatusBadge tone="danger">{t("owner.escalated")}</StatusBadge>
              ) : (
                <Opens />
              )
            }
          />
        ))}
        tone="danger"
      />

      <QueueGroup
        icon={Wheat}
        label={t("home.lowStock")}
        more={
          <Link className={MORE_LINK} to="/admin/feed">
            {t("home.openList")}
          </Link>
        }
        rows={needsYou.lowStock.map((line) => (
          <QueueRow
            key={line.feedItemId}
            title={
              <Link className={ROW_LINK} to="/admin/feed">
                {t("home.lowStockLine", {
                  feed: line.nameBn,
                  onHand: formatNumber(line.onHand, language),
                  unit: line.unit,
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
        icon={Milk}
        label={t("owner.endingWithdrawal")}
        rows={needsYou.endingWithdrawal.map((row) => (
          <QueueRow
            key={row.id}
            leading={
              <Link
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                <TagChip>{row.tagNumber}</TagChip>
              </Link>
            }
            title={
              row.until
                ? t("home.until", {
                    date: formatDate(new Date(row.until), language, "date"),
                  })
                : t("owner.endingWithdrawal")
            }
          />
        ))}
        tone="info"
      />
    </div>
  );
};
