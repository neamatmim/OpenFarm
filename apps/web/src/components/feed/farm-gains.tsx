import type { FarmGainFigure, GainGroup } from "@OpenFarm/domain";
import { findExpectedGainProblems, GAIN_GROUPS } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import { expectedGainSaid } from "./band-words";

/**
 * What the farm's own animals have put on eating each Ration, said beside what the Ration is written to give: on its
 * card, in its editor as a range to take, and on the settings page against the deshi and female shares.
 */

type FarmGains = Awaited<ReturnType<typeof orpc.feed.farmGains.call>>;
type OnRation = FarmGains[number];

/** The farm's own figures by Ration, for the Owner and the Manager — nobody else is asked, as nobody else may read
 *  them. Empty while they have not come, or for anybody else. */
export const useFarmGains = (mayRead: boolean): Map<string, OnRation> => {
  const gains = useQuery({
    ...orpc.feed.farmGains.queryOptions(),
    enabled: mayRead,
  });
  return new Map((gains.data ?? []).map((one) => [one.rationId, one]));
};

const GROUP_WORD: Record<GainGroup, MessageKey> = {
  cross: "farmGains.group.cross",
  deshi: "farmGains.group.deshi",
  unrecorded: "farmGains.group.unrecorded",
  female: "farmGains.group.female",
};

/** One line on a Ration's card: each kind of animal with enough of a figure, its middle gain and how many. Nothing
 *  while no kind has five. */
export const FarmGainsLine = ({ gains }: { gains: OnRation | undefined }) => {
  const { t, language } = useLanguage();
  const said = GAIN_GROUPS.flatMap((group) => {
    const figure = gains?.figures[group];
    return figure
      ? [
          t("farmGains.figure", {
            group: t(GROUP_WORD[group]),
            gain: t("gain.perDay", {
              kg: formatNumber(figure.medianKg, language),
            }),
            count: formatNumber(figure.animals, language),
          }),
        ]
      : [];
  });
  if (said.length === 0) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-xs">
      <span className="text-foreground font-medium">
        {t("farmGains.yourFarm")}:
      </span>{" "}
      {said.join(" · ")}
    </p>
  );
};

/** In the Ration's editor, the middle half of the farm's own crossbred bulls on it — whom a Ration's figures are for —
 *  offered as its Expected Gain. Nothing until five have a gain, while the slowest quarter put on nothing, or while the
 *  range is one the Ration could not be saved with: a mistyped weighing can put a bull over what any bull gains. */
export const FarmGainsOffer = ({
  gains,
  onUse,
}: {
  gains: OnRation | undefined;
  onUse: (figure: FarmGainFigure) => void;
}) => {
  const { t, language } = useLanguage();
  const figure = gains?.figures.cross;
  const takeable =
    figure !== undefined &&
    figure.lowKg > 0 &&
    findExpectedGainProblems({
      lowKg: figure.lowKg,
      highKg: figure.highKg,
    }).length === 0;
  if (!(figure && takeable)) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-muted-foreground text-xs">
        {t("farmGains.offer", {
          range:
            expectedGainSaid(
              { lowKg: figure.lowKg, highKg: figure.highKg },
              { t, language }
            ) ?? "",
          count: formatNumber(figure.animals, language),
        })}
      </p>
      <Button
        onClick={() => onUse(figure)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Sparkles aria-hidden data-icon="inline-start" />
        {t("farmGains.use")}
      </Button>
    </div>
  );
};

const PERCENT = 100;

/**
 * Under the deshi or the female share on the settings page: what the farm's own animals of that kind put on against
 * its own crossbred bulls, Ration by Ration, wherever both have a figure — so a setting the farm's weigh-ins disagree
 * with is seen to. Nothing where no Ration has both.
 */
export const FarmShareNote = ({ kind }: { kind: "deshi" | "female" }) => {
  const { t, language } = useLanguage();
  const gains = useFarmGains(true);
  const shares = [...gains.values()].flatMap((one) => {
    const { cross } = one.figures;
    const other = one.figures[kind];
    return cross && other && cross.medianKg > 0
      ? [
          t(
            kind === "deshi" ? "farmGains.deshiShare" : "farmGains.femaleShare",
            {
              ration: one.rationName,
              percent: formatNumber(
                Math.round((other.medianKg / cross.medianKg) * PERCENT),
                language
              ),
            }
          ),
        ]
      : [];
  });
  return shares.length === 0 ? null : (
    <p className="text-muted-foreground text-xs">{shares.join(" ")}</p>
  );
};
