import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, CircleCheck, MapPin, Scale } from "lucide-react";
import { useState } from "react";

import { EmptyState, Section, StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Flagged = NonNullable<
  Awaited<ReturnType<typeof orpc.milk.flagged.call>>
>[number];

const litresOf = (value: string | null) => (value === null ? 0 : Number(value));

/** Each cow's milking in a session whose tank did not match, so the Manager can see which figure looks wrong. */
const CowsInSession = ({ instanceId }: { instanceId: string }) => {
  const { t, language } = useLanguage();
  const session = useQuery(
    orpc.milk.session.queryOptions({ input: { instanceId } })
  );
  if (!session.data) {
    return <Skeleton className="h-20 rounded-lg" />;
  }
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {session.data.records.map((record) => (
        <li
          className="flex items-center justify-between gap-3 px-3 py-2"
          key={record.id}
        >
          <TagChip>{record.animal.tagNumber}</TagChip>
          <span className="text-muted-foreground">
            {t(`milk.${record.destination}` as "milk.bulk")}
          </span>
          <span className="font-medium tabular-nums">
            {formatNumber(litresOf(record.litres), language)}{" "}
            {t("dispatch.litres")}
          </span>
        </li>
      ))}
    </ul>
  );
};

const Mismatch = ({ session }: { session: Flagged }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const litres = (value: string | null) =>
    `${formatNumber(litresOf(value), language)} ${t("dispatch.litres")}`;
  const difference = Math.abs(litresOf(session.differenceLitres));

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <MapPin aria-hidden className="text-muted-foreground size-4" />
            {session.pen.shed.name} / {session.pen.name}
          </p>
          <p className="text-muted-foreground text-sm">
            {formatDate(new Date(session.dueAt), language, "dateTime")}
          </p>
        </div>
        <StatusBadge icon={Scale} tone="warning">
          {t("milk.difference", { litres: formatNumber(difference, language) })}
        </StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/40 rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.tank")}
          </dt>
          <dd className="font-semibold tabular-nums">
            {litres(session.bulkLitres)}
          </dd>
        </div>
        <div className="bg-muted/40 rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.cows")}
          </dt>
          <dd className="font-semibold tabular-nums">
            {litres(session.sumBulkLitres)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          size="sm"
          variant="outline"
        >
          <ChevronDown
            aria-hidden
            className={open ? "rotate-180" : undefined}
          />
          {t("mismatch.eachCow")}
        </Button>
        <Button
          render={
            <Link
              params={{ instanceId: session.instanceId }}
              to="/work/$instanceId"
            />
          }
          size="sm"
          variant="ghost"
        >
          {t("mismatch.openWork")}
        </Button>
      </div>
      {open ? <CowsInSession instanceId={session.instanceId} /> : null}
    </li>
  );
};

/**
 * The Manager's queue of milkings whose tank reading did not match what the cows were recorded giving. A figure put
 * right on the work takes the session off this list by itself.
 */
export const MilkMismatches = () => {
  const { t } = useLanguage();
  const flagged = useQuery(orpc.milk.flagged.queryOptions());
  return (
    <Section description={t("mismatch.hint")} title={t("mismatch.title")}>
      {flagged.data ? null : <Skeleton className="h-24 rounded-lg" />}
      {flagged.data?.length === 0 ? (
        <EmptyState bare icon={CircleCheck} title={t("mismatch.none")} />
      ) : null}
      {flagged.data?.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {flagged.data.map((session) => (
            <Mismatch key={session.id} session={session} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
};
