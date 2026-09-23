import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRightLeft, ArrowUp } from "lucide-react";
import { useState } from "react";

import type { PenChoice } from "@/components/animal/animal-types";
import { MoveDialog } from "@/components/animal/move-dialog";
import { TagLink } from "@/components/fattening/fattening-words";
import { bandSaid } from "@/components/feed/band-words";
import { Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** How many are listed before the rest are asked for: a band set for the first time can put half the herd here, and the
 *  board beneath is what the page is for. */
const SHOWN_AT_FIRST = 5;

type OutOfBandRow = Awaited<
  ReturnType<typeof orpc.fattening.outOfBand.call>
>[number];

/** One bull in the wrong Pen for his size: what he weighed and when, where he is and what that Pen's Ration is written
 *  for, the Pens whose Ration suits him, and the way to move him there. */
const OutOfBandLine = ({
  row,
  onMove,
}: {
  row: OutOfBandRow;
  onMove: (row: OutOfBandRow) => void;
}) => {
  const { t, language } = useLanguage();
  const outgrown = row.standing === "outgrown";
  const band = bandSaid(row.pen.band, { t, language }) ?? "";
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <TagLink tagNumber={row.tagNumber} />
          <StatusBadge
            icon={outgrown ? ArrowUp : ArrowDown}
            tone={outgrown ? "warning" : "info"}
          >
            {outgrown ? t("band.outgrown") : t("band.tooLight")}
          </StatusBadge>
          <span className="text-sm tabular-nums">
            {t("band.weighed", {
              weight: formatNumber(row.weightKg, language),
              date: row.weighedAt
                ? formatDate(new Date(row.weighedAt), language, "date")
                : "—",
            })}
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {t("band.inPen", {
            pen: row.pen.penName,
            ration: row.pen.rationName,
            band,
          })}
        </span>
        <span className="text-xs">
          {row.fitsIn.length > 0
            ? t("band.fitsIn", {
                pens: row.fitsIn
                  .map((one) => `${one.penName} (${one.rationName})`)
                  .join(", "),
              })
            : t("band.noPenFits")}
        </span>
      </div>
      <Button
        className="shrink-0 self-start sm:self-center"
        onClick={() => onMove(row)}
        size="sm"
        type="button"
        variant="outline"
      >
        <ArrowRightLeft aria-hidden data-icon="inline-start" />
        {t("animals.move")}
      </Button>
    </li>
  );
};

/**
 * The bulls the scale says are in the wrong Pen for their size — grown past the weight band of their Pen's Ration, or
 * not yet up to it — each with a Move already pointed at the first Pen whose Ration suits him. Nothing is drawn while
 * every bull fits, or no Ration has a band.
 */
export const OutOfBand = () => {
  const { t, language } = useLanguage();
  const rows = useQuery(orpc.fattening.outOfBand.queryOptions());
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const [moving, setMoving] = useState<OutOfBandRow | null>(null);
  const [all, setAll] = useState(false);
  const pens: PenChoice[] = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({
      id: pen.id,
      name: pen.name,
      shedName: shed.name,
    }))
  );
  if (!rows.data?.length) {
    return null;
  }
  const shown = all ? rows.data : rows.data.slice(0, SHOWN_AT_FIRST);
  const someHidden = shown.length < rows.data.length;
  return (
    <Section description={t("band.hint")} title={t("band.title")}>
      <ul className="divide-y">
        {shown.map((row) => (
          <OutOfBandLine key={row.tagNumber} onMove={setMoving} row={row} />
        ))}
      </ul>
      {someHidden ? (
        <Button
          className="self-start"
          onClick={() => setAll(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("band.showAll", {
            count: formatNumber(rows.data.length, language),
          })}
        </Button>
      ) : null}
      {moving ? (
        <MoveDialog
          animal={{
            tagNumber: moving.tagNumber,
            penId: moving.pen.penId,
            penName: moving.pen.penName,
          }}
          chosenPenId={moving.fitsIn[0]?.penId ?? ""}
          key={moving.tagNumber}
          onOpenChange={(open) => {
            if (!open) {
              setMoving(null);
            }
          }}
          open
          pens={pens}
        />
      ) : null}
    </Section>
  );
};
