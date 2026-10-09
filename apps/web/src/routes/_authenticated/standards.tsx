import type {
  GainFirmness,
  ReferenceGroup,
  StandardReference,
} from "@OpenFarm/domain";
import {
  FEWEST_FOR_A_FIGURE,
  PEN_NEEDS_GAINS,
  REFERENCE_GROUPS,
  REFERENCES_CHECKED_ON,
  SETTLING_IN_DAYS,
  STANDARD_GAIN_FIRMNESS,
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

import { COLUMN_HEADING } from "@/components/data-table";
import { bandSaid, expectedGainSaid } from "@/components/feed/band-words";
import type { Tone } from "@/components/page";
import { Page, PageHeader, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { gainSettingOf } from "@/lib/gain-settings";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** The standard Rations that say what they should put on a bull, with how firm that is, in the order a bull grows
 *  through them. */
const GAINING_RATIONS = Object.entries(STANDARD_RATIONS)
  .flatMap(([key, one]) => {
    const firm =
      key in STANDARD_GAIN_FIRMNESS
        ? STANDARD_GAIN_FIRMNESS[key as keyof typeof STANDARD_GAIN_FIRMNESS]
        : null;
    return "gain" in one && "band" in one && firm
      ? [{ name: one.name, band: one.band, gain: one.gain, firm }]
      : [];
  })
  .toSorted((a, b) => (a.band.fromKg ?? 0) - (b.band.fromKg ?? 0));

const FIRMNESS_LOOK: Record<
  GainFirmness,
  {
    tone: Tone;
    word:
      | "standards.firmness.medium"
      | "standards.firmness.mediumLow"
      | "standards.firmness.low";
  }
> = {
  medium: { tone: "info", word: "standards.firmness.medium" },
  mediumLow: { tone: "neutral", word: "standards.firmness.mediumLow" },
  low: { tone: "warning", word: "standards.firmness.low" },
};

/** The standard Rations by weight and what each should put on a crossbred bull. */
const RationsTable = () => {
  const { t, language } = useLanguage();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>
            {t("standards.col.ration")}
          </TableHead>
          <TableHead className={COLUMN_HEADING}>
            {t("standards.col.band")}
          </TableHead>
          <TableHead className={`${COLUMN_HEADING} text-right`}>
            {t("standards.col.gain")}
          </TableHead>
          <TableHead className={COLUMN_HEADING}>
            {t("standards.col.firmness")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Each cell from its top, as the app's lists read: the first cell runs to a second line. A badge a line tall. */}
        {GAINING_RATIONS.map((one) => (
          <TableRow
            className="[&_[data-slot=badge]]:min-h-5 [&_[data-slot=badge]]:py-0 [&>td]:align-top"
            key={one.name.en}
          >
            <TableCell className="whitespace-normal">
              <span className="flex flex-col gap-0.5">
                <span>{one.name[language]}</span>
                <span className="text-muted-foreground text-xs">
                  {one.firm.why[language]}
                </span>
              </span>
            </TableCell>
            <TableCell>{bandSaid(one.band, { t, language })}</TableCell>
            <TableCell className="text-right tabular-nums">
              {expectedGainSaid(one.gain, { t, language })}
            </TableCell>
            <TableCell>
              <StatusBadge tone={FIRMNESS_LOOK[one.firm.firmness].tone}>
                {t(FIRMNESS_LOOK[one.firm.firmness].word)}
              </StatusBadge>
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
          days: number(gainSettingOf(figures, "gainReadDays")),
        })}
      </Rule>
      <Rule label={t("standards.deshi")}>
        {t("standards.shareSet", {
          percent: number(gainSettingOf(figures, "deshiGainPercent")),
        })}
      </Rule>
      <Rule label={t("standards.breedShare")}>
        {t("standards.breedShareRule")}
      </Rule>
      <Rule label={t("standards.female")}>
        {t("standards.shareSet", {
          percent: number(gainSettingOf(figures, "femaleGainPercent")),
        })}
      </Rule>
      <Rule label={t("standards.penmates")}>
        {t("standards.penmatesRule", {
          percent: number(gainSettingOf(figures, "penGainPercent")),
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
  breeding: "standards.group.breeding",
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

export const Route = createFileRoute("/_authenticated/standards")({
  beforeLoad: onlyFor("vetOrRunsTheFarm"),
  component: StandardsPage,
});
