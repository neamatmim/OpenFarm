import { formatDate } from "@OpenFarm/i18n";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { Scale, Tag } from "lucide-react";
import { useState } from "react";

import { MoveTable, WeighInTable } from "@/components/animal-histories";
import { CorrectionDialog } from "@/components/correction-dialog";
import {
  NEXT_EID,
  WindowChoice,
  windowOf,
  windowReady,
} from "@/components/fattening/window-choice";
import type { WindowPick } from "@/components/fattening/window-choice";
import { EmptyState, RecordList, RecordRow, Section } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { keptOnThePhone, queueMove, sendOrKeep } from "@/lib/record-offline";
import { toast } from "@/lib/toast";
import { client } from "@/utils/orpc";

import type { AnimalDetail, AnimalPowers, PenChoice } from "./animal-types";
import { PenOverCapacity, usePenChoiceLabel } from "./pen-room";

/** Across to Fattening — a bull calf, or an animal put on the wrong side — into a Pen there. A Move like any other, so
 *  whoever may move her may take her across, and a phone out of signal keeps it until it can send it. */
const ChangeSide = ({
  tagNumber,
  pens,
}: {
  tagNumber: string;
  pens: PenChoice[];
}) => {
  const { t } = useLanguage();
  const penLabel = usePenChoiceLabel();
  const toSide = "fattening" as const;
  const [toPenId, setToPenId] = useState("");
  // The Season she joins on the Fattening side: the next Eid, worked out by the farm even for a phone out of signal,
  // unless another window is said.
  const [windowPick, setWindowPick] = useState<WindowPick>(NEXT_EID);
  const move = useMutation({
    ...keptOnThePhone,
    mutationFn: (across: Parameters<typeof client.animals.move>[0]) =>
      sendOrKeep({
        online: navigator.onLine,
        send: () => client.animals.move(across),
        keep: () => queueMove(across),
      }),
  });
  return (
    <CorrectionDialog
      description={t("correct.sideHint")}
      onOpen={() => {
        setToPenId("");
        setWindowPick(NEXT_EID);
      }}
      onSave={async (reason) => {
        const across = {
          tagNumber,
          toSide,
          toPenId,
          reason,
          targetWindow: windowOf(windowPick),
        };
        // With signal the farm answers now; without it — bars and no data included — the Move waits on the phone
        // rather than being lost.
        const how = await move.mutateAsync(across);
        if (how === "kept") {
          // Said as well as saved: it goes to the farm when the phone finds signal, not now.
          toast.info(t("animals.moveQueued"));
        }
      }}
      ready={Boolean(toPenId) && windowReady(windowPick)}
      title={t("correct.side")}
      trigger={`${t("correct.toSide")}: ${t(`animals.side.${toSide}`)}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`side-pen-${tagNumber}`}>{t("correct.toPen")}</Label>
        <NativeSelect
          id={`side-pen-${tagNumber}`}
          onChange={(event) => setToPenId(event.target.value)}
          required
          value={toPenId}
        >
          <option value="">—</option>
          {pens.map((pen) => (
            <option key={pen.id} value={pen.id}>
              {penLabel(pen)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <PenOverCapacity
        coming={1}
        pen={pens.find((pen) => pen.id === toPenId)}
      />
      <WindowChoice
        id={`side-season-${tagNumber}`}
        onPick={setWindowPick}
        pick={windowPick}
      />
    </CorrectionDialog>
  );
};

/**
 * Where she has stood and what she has weighed: every time she has been on the scale, newest first — the whole list,
 * because fattening is the difference between two readings — every Pen she has been in, and the ear tags she has worn.
 */
export const WeightMovesTab = ({
  detail,
  powers,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
}) => {
  const { t, language } = useLanguage();
  const mayCrossSides = powers.mayMove && detail.side === "dairy";
  return (
    <div className="flex flex-col gap-6">
      <Section title={t("weighIn.title")}>
        {detail.weighIns.length > 0 ? (
          <WeighInTable readings={detail.weighIns} />
        ) : (
          <EmptyState bare icon={Scale} title={t("gain.noneYet")} />
        )}
      </Section>

      <Section
        action={
          mayCrossSides ? (
            <ChangeSide pens={powers.movePens} tagNumber={detail.tagNumber} />
          ) : null
        }
        description={mayCrossSides ? t("correct.sideHint") : undefined}
        title={t("animals.movesHistory")}
      >
        <MoveTable moves={detail.moves} />
      </Section>

      {detail.retags.length > 0 ? (
        <Section title={t("animals.retagsHistory")}>
          <RecordList>
            {detail.retags.map((r) => (
              <RecordRow
                key={r.id}
                leading={
                  <Tag aria-hidden className="text-muted-foreground size-4" />
                }
                meta={formatDate(new Date(r.retaggedAt), language, "dateTime")}
                title={r.reason}
              />
            ))}
          </RecordList>
        </Section>
      ) : null}
    </div>
  );
};
