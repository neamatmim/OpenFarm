import { formatDate } from "@OpenFarm/i18n";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MoveTable, WeighInTable } from "@/components/animal-histories";
import { CorrectionDialog } from "@/components/correction-dialog";
import { EmptyState, RecordList, RecordRow, Section } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { queueMove } from "@/lib/record-offline";
import { orpc } from "@/utils/orpc";

import type { AnimalDetail, AnimalPowers, PenChoice } from "./animal-types";

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
  const queryClient = useQueryClient();
  const toSide = "fattening" as const;
  const [toPenId, setToPenId] = useState("");
  const move = useMutation(orpc.animals.move.mutationOptions({}));
  return (
    <CorrectionDialog
      description={t("correct.sideHint")}
      onOpen={() => setToPenId("")}
      onSave={async (reason) => {
        const across = { tagNumber, toSide, toPenId, reason };
        // With signal the farm answers now; without it the Move waits on the phone rather than being lost.
        if (navigator.onLine) {
          await move.mutateAsync(across);
        } else {
          await queueMove(across);
          // Said as well as saved: it goes to the farm when the phone finds signal, not now.
          toast.info(t("animals.moveQueued"));
        }
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      }}
      ready={Boolean(toPenId)}
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
              {pen.shedName} / {pen.name}
            </option>
          ))}
        </NativeSelect>
      </div>
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
