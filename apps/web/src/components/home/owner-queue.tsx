import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
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
  MapPinOff,
  Warehouse,
  Handshake,
  Milk,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BakiOverdueGroup } from "@/components/home/baki-overdue";
import { FarmAccountsOutGroup } from "@/components/home/farm-accounts-out";
import { LowStockWords } from "@/components/home/low-stock-line";
import { MissingAnimalsGroup } from "@/components/home/missing-animals";
import { MonthlyCostsGroup } from "@/components/home/monthly-costs";
import type { NeedsYou } from "@/components/home/owner-counts";
import {
  moneyAwaitingTotal,
  ownerCountsOf,
} from "@/components/home/owner-counts";
import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
  ROW_LINK,
} from "@/components/home/queue";
import { VentureTroubles } from "@/components/home/venture-trouble";
import { categoryName, useApproveMoney } from "@/components/money";
import { ProgressBar, StatusBadge, TagChip } from "@/components/page";
import { PageTabs } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import type { VentureNeedingHer } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** One kind of decision, drawn under its own heading or under a tab that already gives it one. */
interface GroupProps {
  needsYou: NeedsYou;
  headless?: boolean;
}

/** The day's work as the farm counts it. */
type Tiles = Awaited<ReturnType<typeof orpc.home.owner.call>>["tiles"];

/** How many money rows show before the rest wait behind "show all": a pile of approvals is read by its total first. */
const MONEY_FIRST_SHOWN = 3;

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
const MoneyGroup = ({ needsYou, headless }: GroupProps) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const approveMoney = useApproveMoney();
  return (
    <QueueGroup
      aside={t("owner.moneyTotal", {
        taka: taka(moneyAwaitingTotal(needsYou)),
      })}
      firstShown={MONEY_FIRST_SHOWN}
      headless={headless}
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
            // spending, and ought to be told so before she approves it. Who entered it, whom she asks; and, for a
            // piece under the line alone, that it waits for the week's other pieces to the same person.
            [
              row.counterpartyName,
              row.purseName,
              row.recordedByName
                ? t("owner.enteredBy", { name: row.recordedByName })
                : null,
              row.inPieces ? t("owner.inPieces") : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          title={
            <Link className="hover:underline" to="/money">
              {categoryName(row, language)} ·{" "}
              <span className="tabular-nums">
                ৳{formatNumber(row.amountMoney, language)}
              </span>
            </Link>
          }
          trailing={
            <Button
              className={ROW_ACT}
              disabled={approveMoney.isPending}
              onClick={() =>
                approveMoney.mutate({
                  id: row.id,
                  amountMoney: row.amountMoney,
                })
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
const ProposalGroup = ({ needsYou, headless }: GroupProps) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onError: refused,
    })
  );
  return (
    <QueueGroup
      headless={headless}
      icon={BookOpenCheck}
      label={t("owner.proposals")}
      more={
        <Link
          className={MORE_LINK}
          search={{ tab: "proposals" }}
          to="/admin/sops"
        >
          {t("home.openList")}
        </Link>
      }
      rows={needsYou.proposals.map((row) => (
        <QueueRow
          key={row.id}
          title={
            <Link
              className="hover:underline"
              search={{ tab: "proposals" }}
              to="/admin/sops"
            >
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
const ReviewGroup = ({ needsYou, headless }: GroupProps) => {
  const { t } = useLanguage();
  return (
    <QueueGroup
      headless={headless}
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

/** The Registration running out, where it is. */
const RenewalGroup = ({ needsYou, headless }: GroupProps) => {
  const { t } = useLanguage();
  return (
    <QueueGroup
      headless={headless}
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
  );
};

/** The store not counted for more than a week: when it last was, opening the counts. The count is the one check on
 *  the feed the Manager takes in, so a week without one is the Owner's to know. */
const StoreCountGroup = ({ needsYou, headless }: GroupProps) => {
  const { t, language } = useLanguage();
  // Missing from an answer a phone kept from before the store's count was watched.
  const late = needsYou.storeCount;
  return (
    <QueueGroup
      headless={headless}
      icon={Warehouse}
      label={t("owner.storeCount")}
      rows={
        late
          ? [
              <QueueRow
                key="store"
                meta={
                  <span className="text-danger">
                    {late.lastCountedAt
                      ? t("owner.storeLastCounted", {
                          day: formatDate(
                            new Date(late.lastCountedAt),
                            language,
                            "date"
                          ),
                        })
                      : t("owner.storeNeverCounted")}
                  </span>
                }
                title={
                  <Link
                    className={ROW_LINK}
                    search={{ tab: "counts" }}
                    to="/admin/feed"
                  >
                    {t("owner.storeNotCounted")}
                  </Link>
                }
                trailing={<Opens />}
              />,
            ]
          : []
      }
      tone="danger"
    />
  );
};

/** Work waiting on the Owner's own Sign-off, each opening the work. */
const ApprovalGroup = ({ needsYou, headless }: GroupProps) => {
  const { t } = useLanguage();
  return (
    <QueueGroup
      headless={headless}
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
  );
};

/** The kinds of thing only the Owner can settle, in the order they are read. */
export const DECISION_KINDS = [
  "missing",
  "storeCount",
  "ventures",
  "registration",
  "approvals",
  "proposals",
  "money",
  "review",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** A kind of decision as a tab: what it is called and how many wait. */
interface Kind {
  value: DecisionKind;
  label: string;
  icon: LucideIcon;
  count: number;
}

/** One kind's list, under its own heading or under a tab that already gives it one. */
const KindList = ({
  kind,
  needsYou,
  ventures,
  headless,
}: {
  kind: DecisionKind;
  needsYou: NeedsYou;
  ventures: VentureNeedingHer[];
  headless: boolean;
}) => {
  switch (kind) {
    case "missing": {
      return (
        <MissingAnimalsGroup animals={needsYou.missing} headless={headless} />
      );
    }
    case "storeCount": {
      return <StoreCountGroup headless={headless} needsYou={needsYou} />;
    }
    case "ventures": {
      return <VentureTroubles headless={headless} ventures={ventures} />;
    }
    case "registration": {
      return <RenewalGroup headless={headless} needsYou={needsYou} />;
    }
    case "approvals": {
      return <ApprovalGroup headless={headless} needsYou={needsYou} />;
    }
    case "proposals": {
      return <ProposalGroup headless={headless} needsYou={needsYou} />;
    }
    case "money": {
      // The rent and wages not entered yet keep their own heading, even under the Money tab: they are not money
      // waiting for her, and a headless list of them would read as if they were.
      return (
        <div className="flex flex-col gap-6">
          <MoneyGroup headless={headless} needsYou={needsYou} />
          <MonthlyCostsGroup monthlyCosts={needsYou.monthlyCosts} />
          <BakiOverdueGroup buyers={needsYou.bakiOverdue} forTheOwner />
          <FarmAccountsOutGroup accounts={needsYou.farmAccountsOut} />
        </div>
      );
    }
    case "review": {
      return <ReviewGroup headless={headless} needsYou={needsYou} />;
    }
    default: {
      return null;
    }
  }
};

/**
 * What only the Owner can settle, and nothing else: the Ventures that want them, the Registration, work waiting on
 * their own word, Playbook proposals, money awaiting approval, and entries needing a decision. A proposal and a sum of
 * money are approved where they stand; everything else opens what it is about.
 *
 * One tab to a kind, and only for a kind with something in it: the row of tabs, each with its count, is the whole of
 * what waits read at a glance, and one kind at a time below it keeps a long pile of money from pushing the rest off
 * the screen. A single kind needs no tabs — a row of one is furniture — and is drawn as it always was.
 */
export const NeedsYouTabs = ({
  needsYou,
  ventures,
  chosen,
  onChoose,
}: {
  needsYou: NeedsYou;
  ventures: VentureNeedingHer[];
  /** The tab the address asks for, which may name a kind that has since emptied. */
  chosen: DecisionKind | undefined;
  onChoose: (kind: DecisionKind) => void;
}) => {
  const { t } = useLanguage();
  const counts = ownerCountsOf(needsYou);
  const kinds: Kind[] = [
    {
      value: "missing",
      label: t("home.missing"),
      icon: MapPinOff,
      count: counts.missing,
    },
    {
      value: "storeCount",
      label: t("owner.storeCount"),
      icon: Warehouse,
      count: counts.storeCount,
    },
    {
      value: "ventures",
      label: t("nav.ventures"),
      icon: Handshake,
      count: ventures.length,
    },
    {
      value: "registration",
      label: t("owner.registrationRenewal"),
      icon: FileBadge,
      count: counts.registration,
    },
    {
      value: "approvals",
      label: t("nav.signOff"),
      icon: BadgeCheck,
      count: counts.approvals,
    },
    {
      value: "proposals",
      label: t("owner.proposals"),
      icon: BookOpenCheck,
      count: counts.proposals,
    },
    {
      value: "money",
      label: t("nav.money"),
      icon: HandCoins,
      count: counts.money,
    },
    {
      value: "review",
      label: t("home.needsReview"),
      icon: Gavel,
      count: counts.review,
    },
  ];
  const waiting = kinds.filter((kind) => kind.count > 0);
  const [only] = waiting;
  if (!only) {
    return null;
  }
  if (waiting.length === 1) {
    return (
      <KindList
        headless={false}
        kind={only.value}
        needsYou={needsYou}
        ventures={ventures}
      />
    );
  }
  // The kind asked for while it still has something in it; once it empties — the last sum approved — the first that
  // does, rather than an empty tab.
  const shown = waiting.find((kind) => kind.value === chosen) ?? only;
  return (
    <PageTabs
      onChange={onChoose}
      tabs={waiting.map((kind) => ({
        value: kind.value,
        label: kind.label,
        icon: kind.icon,
        count: kind.count,
        content: (
          <KindList
            headless
            kind={kind.value}
            needsYou={needsYou}
            ventures={ventures}
          />
        ),
      }))}
      value={shown.value}
    />
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

/** What the farm's day has for the Owner to know about, loudest first: the order its tabs read in. */
export const FARM_TODAY_KINDS = [
  "overdue",
  "lowStock",
  "endingWithdrawal",
] as const;
export type FarmTodayKind = (typeof FARM_TODAY_KINDS)[number];

/** One kind of the farm's day, under its own heading or under a tab that already gives it one. */
const FarmTodayList = ({
  kind,
  needsYou,
  headless,
}: {
  kind: FarmTodayKind;
  needsYou: NeedsYou;
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
                  <StatusBadge tone="danger">
                    {t("owner.escalated")}
                  </StatusBadge>
                ) : (
                  <Opens />
                )
              }
            />
          ))}
          tone="danger"
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
            <Link className={MORE_LINK} to="/admin/feed">
              {t("home.openList")}
            </Link>
          }
          rows={needsYou.lowStock.map((line) => (
            <QueueRow
              key={line.feedItemId}
              title={
                <Link className={ROW_LINK} to="/admin/feed">
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
    case "endingWithdrawal": {
      return (
        <QueueGroup
          headless={headless}
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
      );
    }
    default: {
      return null;
    }
  }
};

/**
 * The farm going about its day, which the Manager is minding: how much of the work is done, what is late, feed running
 * low, and Withdrawals ending. The Owner reads it to know, not to act — it sits below what only they can settle.
 *
 * The day's progress over it all; below, one tab to a kind with something in it, as the lists above it are — late
 * work first, its count red. A single kind is drawn under its own heading, without tabs.
 */
export const FarmToday = ({
  needsYou,
  tiles,
  chosen,
  onChoose,
}: {
  needsYou: NeedsYou;
  tiles: Tiles;
  /** The tab the address asks for, which may name a kind that has since emptied. */
  chosen: FarmTodayKind | undefined;
  onChoose: (kind: FarmTodayKind) => void;
}) => {
  const { t } = useLanguage();
  const counts: Record<FarmTodayKind, number> = {
    overdue: needsYou.overdue.length,
    lowStock: needsYou.lowStock.length,
    endingWithdrawal: needsYou.endingWithdrawal.length,
  };
  const LABEL: Record<FarmTodayKind, { label: string; icon: LucideIcon }> = {
    overdue: { label: t("home.overdue"), icon: AlarmClock },
    lowStock: { label: t("home.lowStock"), icon: Wheat },
    endingWithdrawal: { label: t("owner.endingWithdrawal"), icon: Milk },
  };
  const waiting = FARM_TODAY_KINDS.filter((kind) => counts[kind] > 0);
  const [only] = waiting;
  // The kind asked for while it still has something in it; once it empties, the loudest that does.
  const shown = waiting.find((kind) => kind === chosen) ?? only;
  let lists: ReactNode = null;
  if (only && waiting.length === 1) {
    lists = <FarmTodayList headless={false} kind={only} needsYou={needsYou} />;
  } else if (shown) {
    lists = (
      <PageTabs
        onChange={onChoose}
        tabs={waiting.map((kind) => ({
          value: kind,
          label: LABEL[kind].label,
          icon: LABEL[kind].icon,
          count: counts[kind],
          countTone: kind === "overdue" ? "danger" : undefined,
          content: <FarmTodayList headless kind={kind} needsYou={needsYou} />,
        }))}
        value={shown}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <DayProgress tiles={tiles} />
      {counts.overdue + counts.lowStock + counts.endingWithdrawal === 0 ? (
        <p className="text-success flex items-center gap-2 text-sm">
          <CircleCheck aria-hidden className="size-4" />
          {t("owner.nothingLate")}
        </p>
      ) : null}
      {lists}
    </div>
  );
};
