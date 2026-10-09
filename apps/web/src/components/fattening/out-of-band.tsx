import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRightLeft, ArrowUp } from "lucide-react";
import { useState } from "react";

import type { PenChoice } from "@/components/animal/animal-types";
import { MoveDialog } from "@/components/animal/move-dialog";
import { bandSaid } from "@/components/feed/band-words";
import { Section, StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type OutOfBandRow = Awaited<
  ReturnType<typeof orpc.fattening.outOfBand.call>
>[number];

/** Bulls in the same wrong Pen for the same reason, with the same Pens to go to: said once, each bull a chip. */
interface OutOfBandGroup {
  key: string;
  rows: OutOfBandRow[];
}

/** The bulls grouped by where they stand, which way they are out, and where they would fit, in the order first met. */
const groupsOf = (rows: readonly OutOfBandRow[]): OutOfBandGroup[] => {
  const groups = new Map<string, OutOfBandRow[]>();
  for (const row of rows) {
    const key = [
      row.pen.penId,
      row.standing,
      ...row.fitsIn.map((one) => one.penId),
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups].map(([key, grouped]) => ({ key, rows: grouped }));
};

/**
 * One wrong Pen and why, said once: which way they are out, how many, the Pen and what its Ration is written for, the
 * Pens whose Ration suits them — and each bull as a chip with what he weighed, which opens his Move already pointed at
 * the first of them.
 */
const OutOfBandGroupLine = ({
  group,
  onMove,
}: {
  group: OutOfBandGroup;
  onMove: (row: OutOfBandRow) => void;
}) => {
  const { t, language } = useLanguage();
  const [first] = group.rows;
  if (!first) {
    return null;
  }
  const outgrown = first.standing === "outgrown";
  const band = bandSaid(first.pen.band, { t, language }) ?? "";
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          icon={outgrown ? ArrowUp : ArrowDown}
          tone={outgrown ? "warning" : "info"}
        >
          {outgrown ? t("band.outgrown") : t("band.tooLight")}
        </StatusBadge>
        <span className="text-sm font-medium">
          {t("animals.count", {
            count: formatNumber(group.rows.length, language),
          })}
        </span>
        <span className="text-muted-foreground text-sm">
          {t("band.inPen", {
            pen: first.pen.penName,
            ration: first.pen.rationName,
            band,
          })}
        </span>
      </div>
      <span className="text-sm">
        {first.fitsIn.length > 0
          ? t("band.fitsIn", {
              pens: first.fitsIn
                .map((one) => `${one.penName} (${one.rationName})`)
                .join(", "),
            })
          : t("band.noPenFits")}
      </span>
      <ul className="flex flex-wrap gap-2">
        {group.rows.map((row) => (
          <li key={row.tagNumber}>
            <Button
              aria-label={t("band.moveTag", { tag: row.tagNumber })}
              onClick={() => onMove(row)}
              size="sm"
              type="button"
              variant="outline"
            >
              <ArrowRightLeft aria-hidden data-icon="inline-start" />
              <TagChip>{row.tagNumber}</TagChip>
              <span className="text-muted-foreground tabular-nums">
                {t("intake.kg", { kg: formatNumber(row.weightKg, language) })}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </li>
  );
};

/**
 * The bulls the scale says are in the wrong Pen for their size — grown past the weight band of their Pen's Ration, or
 * not yet up to it — grouped where they stand, each a chip that opens his Move already pointed at the first Pen whose
 * Ration suits him. Nothing is drawn while every bull fits, or no Ration has a band.
 */
export const OutOfBand = () => {
  const { t } = useLanguage();
  const rows = useQuery(orpc.fattening.outOfBand.queryOptions());
  const sheds = useQuery(orpc.sheds.list.queryOptions());
  const [moving, setMoving] = useState<OutOfBandRow | null>(null);
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
  return (
    <Section description={t("band.hint")} title={t("band.title")}>
      <ul className="divide-y">
        {groupsOf(rows.data).map((group) => (
          <OutOfBandGroupLine
            group={group}
            key={group.key}
            onMove={setMoving}
          />
        ))}
      </ul>
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
