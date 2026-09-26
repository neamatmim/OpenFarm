import { isLiveRequest, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Sprout } from "lucide-react";

import { MORE_LINK } from "@/components/home/queue";
import { SaidDate } from "@/components/list-cells";
import { Notice, Section } from "@/components/page";
import {
  useLookedAtOffers,
  usePortalPlaces,
  useTheirOpenVentures,
  useTheirRequests,
} from "@/components/portal/portal-source";
import { RequestStanding } from "@/components/portal/requests-to-join";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { orpc } from "@/utils/orpc";

/** A Venture still raising capital, as an invited Investor is offered it: its terms and the farm's words, and
 *  nothing anybody signed. */
export type OpenVenture = Awaited<
  ReturnType<typeof orpc.portal.openVentures.call>
>[number];

/** One fact of an offered Venture, under its name. */
export const Fact = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium break-words tabular-nums">{children}</dd>
  </div>
);

/** One offered Venture as a card: what a Unit costs, what is being raised and the day it is decided by. The whole
 *  card leads to its own page, where the rules are read before anything is asked. */
export const OpenVentureCard = ({ one }: { one: OpenVenture }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  // Their own live Request on it, said on the card, so a list of offers tells the ones they have asked about.
  const asked = (useTheirRequests().data ?? []).find(
    (each) => each.ventureId === one.id && isLiveRequest(each.state)
  );
  const { to, params } = usePortalPlaces().openVenture(one.id).link;
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex h-full flex-col gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={params}
        to={to}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{one.name}</span>
            {/* Shown since they last looked; an answer kept from before says nothing new. */}
            {one.isNew === true ? <Badge>{t("portal.open.new")}</Badge> : null}
          </span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
          />
        </div>
        {asked ? <RequestStanding state={asked.state} /> : null}
        {one.takingRequests ? null : (
          <Badge className="w-fit" variant="secondary">
            {t("portal.open.closed")}
          </Badge>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Fact label={t("portal.open.unit")}>{taka(one.unitPriceBdt)}</Fact>
          <Fact label={t("portal.open.decideBy")}>
            <SaidDate at={one.decideBy} />
          </Fact>
        </dl>
      </Link>
    </li>
  );
};

/** The offered Ventures as cards, one or two to a row. */
export const OpenVentureCards = ({
  ventures,
}: {
  ventures: readonly OpenVenture[];
}) => (
  <ul className={cn("grid gap-3", ventures.length > 1 && "md:grid-cols-2")}>
    {ventures.map((one) => (
      <OpenVentureCard key={one.id} one={one} />
    ))}
  </ul>
);

/**
 * One line at the top of an Investor's home while the farm is raising capital for a Venture it shows them — for
 * somebody already in a Venture, whose offers are otherwise further down. A Venture shown since they last looked is
 * said as news, once, in their portal and nowhere else; after that the line only counts them. Nothing when there are
 * none.
 */
export const RaisingLine = () => {
  const { t, language } = useLanguage();
  const offered = useTheirOpenVentures();
  const places = usePortalPlaces();
  useLookedAtOffers(offered.data);
  // Only those still taking requests are news or worth counting: one past its decide-by day is shown, not raising.
  const ventures = (offered.data ?? []).filter((one) => one.takingRequests);
  if (ventures.length === 0) {
    return null;
  }
  const fresh = ventures.filter((one) => one.isNew === true);
  const [only] = fresh;
  if (only && fresh.length === 1) {
    const { to, params } = places.openVenture(only.id).link;
    return (
      <Notice
        action={
          <Link className={cn(MORE_LINK, "text-sm")} params={params} to={to}>
            {t("portal.open.see")}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        }
        icon={Sprout}
        title={t("portal.open.newLine", {
          name: only.name,
          day: formatDate(startOfFarmDay(only.decideBy), language, "date"),
        })}
        tone="info"
      />
    );
  }
  const all = places.openVentures.link;
  const line = t("portal.open.countLine", { count: ventures.length });
  const see = (
    <Link className={cn(MORE_LINK, "text-sm")} params={all.params} to={all.to}>
      {t("portal.open.see")}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  );
  return fresh.length > 0 ? (
    <Notice action={see} icon={Sprout} title={line} tone="info" />
  ) : (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm">
      <Sprout aria-hidden className="size-4" />
      {line}
      {see}
    </p>
  );
};

/**
 * The Ventures the farm is raising capital for, on the Investor's home page — only when there are any: an empty box
 * saying the farm is raising nothing would be the portal talking about offers where there are none. Plain, since the
 * cards are surfaces of their own.
 */
export const OpenVenturesOnHome = () => {
  const { t } = useLanguage();
  const offered = useTheirOpenVentures();
  const { openVentures } = usePortalPlaces();
  const ventures = offered.data ?? [];
  if (ventures.length === 0) {
    return null;
  }
  return (
    <Section
      action={
        <Link
          className={cn(MORE_LINK, "text-sm")}
          params={openVentures.link.params}
          to={openVentures.link.to}
        >
          {t("portal.open.back")}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
      description={t("portal.open.hint")}
      plain
      title={t("portal.open.title")}
    >
      <OpenVentureCards ventures={ventures} />
    </Section>
  );
};
