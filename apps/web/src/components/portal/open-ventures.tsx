import { Badge } from "@OpenFarm/ui/components/badge";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { SaidDate } from "@/components/list-cells";
import { Section } from "@/components/page";
import {
  usePortalPlaces,
  useTheirOpenVentures,
} from "@/components/portal/portal-source";
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
  const { to, params } = usePortalPlaces().openVenture(one.id);
  return (
    <li>
      <Link
        className="surface hover:border-primary/40 focus-visible:ring-ring flex h-full flex-col gap-4 p-4 outline-none focus-visible:ring-2 md:p-5"
        params={params}
        to={to}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold">{one.name}</span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground mt-0.5 size-5 shrink-0"
          />
        </div>
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
 * The Ventures the farm is raising capital for, on the Investor's home page — only when there are any: an empty box
 * saying the farm is raising nothing would be the portal talking about offers where there are none.
 */
export const OpenVenturesOnHome = () => {
  const { t } = useLanguage();
  const offered = useTheirOpenVentures();
  const { open } = usePortalPlaces();
  const ventures = offered.data ?? [];
  if (ventures.length === 0) {
    return null;
  }
  return (
    <Section
      action={
        <Link
          className="text-primary text-sm underline"
          params={open.params}
          to={open.to}
        >
          {t("portal.open.back")}
        </Link>
      }
      description={t("portal.open.hint")}
      title={t("portal.open.title")}
    >
      <OpenVentureCards ventures={ventures} />
    </Section>
  );
};
