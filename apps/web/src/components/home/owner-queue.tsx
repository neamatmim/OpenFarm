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
} from "@/components/home/queue";
import { categoryName, useApproveMoney } from "@/components/money";
import { StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** The Owner's exception list as the farm answers it. */
export type NeedsYou = Awaited<
  ReturnType<typeof orpc.home.owner.call>
>["needsYou"];

/** A row's title that opens what it is about, the whole row being the tap. */
const ROW_LINK = "after:absolute after:inset-0 hover:underline";

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

/**
 * What needs the Owner, and nothing else: late work, work waiting on their own word, Playbook proposals, the
 * Registration, money awaiting approval, feed running low, entries needing a decision, and withdrawals ending. A
 * proposal and a sum of money are approved where they stand; everything else opens what it is about.
 */
export const OwnerQueue = ({ needsYou }: { needsYou: NeedsYou }) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const approveMoney = useApproveMoney();

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
            meta={row.counterpartyName ?? undefined}
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
