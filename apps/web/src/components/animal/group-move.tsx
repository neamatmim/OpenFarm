import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";

import type { PenChoice } from "@/components/animal/animal-types";
import { pensOf, powersOf, usePens } from "@/components/animal/animal-types";
import type { HerdRow } from "@/components/animal/herd-list";
import type { RowSelection } from "@/components/data-table";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { queueMove } from "@/lib/record-offline";
import { refreshTheScreen } from "@/lib/refresh";
import { toast } from "@/lib/toast";
import { client, orpc } from "@/utils/orpc";

/**
 * The animals ticked on the herd list, moved to one Pen together — a weaning, a release from Quarantine, a Pen
 * re-banded — rather than one page and one Move dialog each. Every animal is still her own Move, asked of the farm one
 * after another with signal and held on the phone without it, so each is refused or taken on its own and the trail
 * reads the same as moves made one at a time.
 */
export const GroupMove = ({
  chosen,
  pens,
  onDone,
  onClear,
}: {
  chosen: HerdRow[];
  /** Where this person may move them: every Pen for those who run the farm, a Staff member's own. */
  pens: PenChoice[];
  onDone: () => void;
  onClear: () => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toPenId, setToPenId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  // An animal in Quarantine is walked only into a quarantine pen until she is released, so a group with one in it is.
  const offered = chosen.some((one) => one.state === "quarantine")
    ? pens.filter((pen) => pen.quarantine === true)
    : pens;
  const count = formatNumber(chosen.length, language);

  const moveThem = async () => {
    setPending(true);
    let moved = 0;
    let refused = 0;
    // One already standing there has nowhere to go: she is said, not moved.
    const toGo = chosen.filter((each) => each.penId !== toPenId);
    const already = chosen.length - toGo.length;
    for (const one of toGo) {
      const wanted = {
        tagNumber: one.tagNumber,
        toPenId,
        reason: reason || undefined,
      };
      try {
        // One after another: each is its own Move, and the farm answers one before the next is asked.
        // oxlint-disable-next-line no-await-in-loop
        await (navigator.onLine
          ? client.animals.move(wanted)
          : queueMove(wanted));
        moved += 1;
      } catch {
        refused += 1;
      }
    }
    setPending(false);
    setOpen(false);
    setToPenId("");
    setReason("");
    if (moved > 0) {
      toast.success(
        t(navigator.onLine ? "animals.groupMoved" : "animals.groupQueued", {
          count: formatNumber(moved, language),
        })
      );
    }
    if (already > 0) {
      toast.info(
        t("animals.groupAlreadyThere", {
          count: formatNumber(already, language),
        })
      );
    }
    if (refused > 0) {
      toast.error(
        t("animals.groupRefused", { count: formatNumber(refused, language) })
      );
    }
    refreshTheScreen(queryClient);
    onDone();
  };

  return (
    <>
      <div className="bg-accent text-accent-foreground flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2">
        <span aria-live="polite" className="text-sm font-medium">
          {t("animals.groupChosen", { count })}
        </span>
        <div className="flex items-center gap-2">
          <Button onClick={onClear} type="button" variant="ghost">
            {t("signOff.clearSelection")}
          </Button>
          <Button onClick={() => setOpen(true)} type="button">
            <ArrowRightLeft aria-hidden data-icon="inline-start" />
            {t("animals.groupMove", { count })}
          </Button>
        </div>
      </div>
      <FormDialog
        description={chosen.map((one) => one.tagNumber).join(", ")}
        onOpenChange={setOpen}
        onSubmit={moveThem}
        open={open}
        pending={pending}
        ready={toPenId !== ""}
        submitLabel={t("animals.groupMove", { count })}
        title={t("animals.groupMove", { count })}
      >
        <FormField id="group-move-pen" label={t("animals.moveTo")}>
          <NativeSelect
            id="group-move-pen"
            onChange={(event) => setToPenId(event.target.value)}
            required
            value={toPenId}
          >
            <option value="">—</option>
            {offered.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.shedName} / {pen.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="group-move-reason" label={t("animals.reason")}>
          <Input
            id="group-move-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </FormField>
      </FormDialog>
    </>
  );
};

/**
 * Which of the herd list's animals this person may tick to move together, and where to: as her own page offers a Move —
 * any animal still here for those who run the farm, a Staff member's in the Pens they keep. Nothing to tick for anybody
 * who may move none.
 */
export const useHerdTicking = (
  rows: HerdRow[]
): {
  selection: RowSelection<HerdRow> | undefined;
  chosen: HerdRow[];
  movePens: PenChoice[];
  handleClear: () => void;
} => {
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const { runsTheFarm, mayHandle } = powersOf(
    me.data?.roles,
    me.data?.scopes.vet?.kind === "cases"
  );
  const pens = usePens(me.data);
  const ownPens = pensOf(me.data?.scopes.staff);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  // The list holds only animals still here, so whose Pen she stands in is all there is to ask.
  const mayMove = (row: HerdRow) =>
    runsTheFarm ||
    (mayHandle && row.penId !== null && ownPens.includes(row.penId));
  const chosen = rows.filter((row) => ticked.has(row.id) && mayMove(row));
  return {
    selection: rows.some(mayMove)
      ? {
          selected: new Set(chosen.map((row) => row.id)),
          onChange: setTicked,
          selectable: mayMove,
          label: (row) => t("animals.groupTick", { tag: row.tagNumber }),
        }
      : undefined,
    chosen,
    movePens: runsTheFarm
      ? pens
      : pens.filter((pen) => ownPens.includes(pen.id)),
    handleClear: () => setTicked(new Set()),
  };
};
