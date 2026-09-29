import type { ReferenceGroup, StandardReference } from "@OpenFarm/domain";
import {
  FEWEST_FOR_A_FIGURE,
  PEN_NEEDS_GAINS,
  REFERENCE_GROUPS,
  REFERENCES_CHECKED_ON,
  SETTLING_IN_DAYS,
  STANDARD_RATIONS,
  STANDARD_REFERENCES,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { bandSaid, expectedGainSaid } from "@/components/feed/band-words";
import { Page, PageHeader, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** The standard Rations that say what they should put on a bull, in the order a bull grows through them. */
const GAINING_RATIONS = Object.values(STANDARD_RATIONS)
  .flatMap((one) =>
    "gain" in one && "band" in one
      ? [{ name: one.name, band: one.band, gain: one.gain }]
      : []
  )
  .toSorted((a, b) => (a.band.fromKg ?? 0) - (b.band.fromKg ?? 0));

/** The standard Rations by weight and what each should put on a crossbred bull. */
const RationsTable = () => {
  const { t, language } = useLanguage();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("standards.col.ration")}</TableHead>
          <TableHead>{t("standards.col.band")}</TableHead>
          <TableHead className="text-right">
            {t("standards.col.gain")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {GAINING_RATIONS.map((one) => (
          <TableRow key={one.name.en}>
            <TableCell>{one.name[language]}</TableCell>
            <TableCell>{bandSaid(one.band, { t, language })}</TableCell>
            <TableCell className="text-right tabular-nums">
              {expectedGainSaid(one.gain, { t, language })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** One rule the app keeps, and the figure it keeps it at. */
const Rule = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="text-sm font-medium sm:text-right">{children}</dd>
  </div>
);

/** The farm's settings' own defaults, said for a farm answer this phone cached before the farm had them. */
const UNTOLD = {
  gainReadDays: 28,
  deshiGainPercent: 70,
  femaleGainPercent: 80,
  penGainPercent: 80,
} as const;

/** A figure the farm has set, or its default. */
const settingOf = (
  farm: Record<string, unknown> | null | undefined,
  key: keyof typeof UNTOLD
): number => {
  const value = farm?.[key];
  return typeof value === "number" ? value : UNTOLD[key];
};

/** The days, shares and counts the app judges gains by: fixed ones with their source, and the farm's own settings. */
const Rules = () => {
  const { t, language } = useLanguage();
  const farm = useQuery(orpc.farm.current.queryOptions());
  const figures = farm.data ?? null;
  const number = (value: number) => formatNumber(value, language);
  return (
    <dl className="divide-y">
      <Rule label={t("standards.settling")}>
        {t("standards.settlingDays", { days: number(SETTLING_IN_DAYS) })}
      </Rule>
      <Rule label={t("standards.readOver")}>
        {t("standards.readOverDays", {
          days: number(settingOf(figures, "gainReadDays")),
        })}
      </Rule>
      <Rule label={t("standards.deshi")}>
        {t("standards.shareSet", {
          percent: number(settingOf(figures, "deshiGainPercent")),
        })}
      </Rule>
      <Rule label={t("standards.female")}>
        {t("standards.shareSet", {
          percent: number(settingOf(figures, "femaleGainPercent")),
        })}
      </Rule>
      <Rule label={t("standards.penmates")}>
        {t("standards.penmatesRule", {
          percent: number(settingOf(figures, "penGainPercent")),
          count: number(PEN_NEEDS_GAINS),
        })}
      </Rule>
      <Rule label={t("standards.ownFigures")}>
        {t("standards.ownFiguresFrom", { count: number(FEWEST_FOR_A_FIGURE) })}
      </Rule>
    </dl>
  );
};

const GROUP_WORD: Record<ReferenceGroup, MessageKey> = {
  bangladesh: "standards.group.bangladesh",
  feeding: "standards.group.feeding",
  weighing: "standards.group.weighing",
};

/** A link out of the app, opened beside it rather than in its place. */
const OutLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
    <ExternalLink aria-hidden className="size-3.5 shrink-0" />
  </a>
);

/** One guide: its title as a link, who published it and when, what it is good for, and any second address. */
const Reference = ({ one }: { one: StandardReference }) => {
  const { language } = useLanguage();
  const [first, ...more] = one.links;
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      {first ? <OutLink href={first}>{one.title}</OutLink> : one.title}
      <span className="text-muted-foreground text-xs">
        {one.year ? `${one.publisher} · ${one.year}` : one.publisher}
      </span>
      <span className="text-sm">{one.goodFor[language]}</span>
      {more.map((href) => (
        <OutLink href={href} key={href}>
          {new URL(href).hostname}
        </OutLink>
      ))}
    </li>
  );
};

/**
 * Where the farm's standard figures come from: what each standard Ration should put on a bull, the days and shares a
 * gain is judged by, and the published guides and trials behind them — free to open, for the day a figure is
 * questioned. For the Owner, the Manager and the Vet.
 */
const StandardsPage = () => {
  const { t, language } = useLanguage();
  return (
    <Page>
      <PageHeader
        description={t("standards.subtitle")}
        title={t("nav.standards")}
      />
      <Section
        description={t("standards.usesHint")}
        title={t("standards.usesTitle")}
      >
        <RationsTable />
        <Rules />
      </Section>
      {REFERENCE_GROUPS.map((group) => (
        <Section key={group} title={t(GROUP_WORD[group])}>
          <ul className="divide-y">
            {STANDARD_REFERENCES.filter((one) => one.group === group).map(
              (one) => (
                <Reference key={one.title} one={one} />
              )
            )}
          </ul>
        </Section>
      ))}
      <p className="text-muted-foreground text-xs">
        {t("standards.checked", {
          date: formatDate(
            new Date(`${REFERENCES_CHECKED_ON}T06:00:00.000Z`),
            language,
            "date"
          ),
        })}
      </p>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/standards")({
  beforeLoad: onlyFor("vetOrRunsTheFarm"),
  component: StandardsPage,
});
