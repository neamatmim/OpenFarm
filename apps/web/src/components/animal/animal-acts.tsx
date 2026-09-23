import type { Disposal, MortalityKind } from "@OpenFarm/domain";
import { DISPOSALS, MORTALITY_KINDS, statesSetByHand } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { MoveDialog } from "@/components/animal/move-dialog";
import {
  FormDialog,
  FormField,
  FormSheet,
  NativeSelect,
} from "@/components/page-kit";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { AnimalAct, AnimalDetail, PenChoice } from "./animal-types";

/**
 * The record-keeping acts on her page, each in its own dialog — or, for how she left the herd, a sheet — opened from
 * the page's header or from the part of her page it belongs to, rather than standing open on the page all the time.
 * Every one closes when the farm has taken it and says so; her page is read again, as the screen is after any save.
 */

interface ActProps {
  detail: AnimalDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Her State, to one the farm allows from where she is now. */
const StateDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [nextState, setNextState] = useState("");
  const [reason, setReason] = useState("");
  const setState = useMutation(
    orpc.animals.setState.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.stateChanged"));
        setNextState("");
        setReason("");
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("animals.manageHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        setState.mutate({
          tagNumber: detail.tagNumber,
          state: nextState as Parameters<typeof setState.mutate>[0]["state"],
          reason: reason || undefined,
        })
      }
      open={open}
      pending={setState.isPending}
      ready={nextState !== ""}
      submitLabel={t("animals.setState")}
      title={`${t("animals.setState")} · ${detail.tagNumber}`}
    >
      <FormField id="act-state" label={t("animals.state")}>
        <NativeSelect
          id="act-state"
          onChange={(event) => setNextState(event.target.value)}
          required
          value={nextState}
        >
          <option value="">—</option>
          {statesSetByHand(detail.state).map((one) => (
            <option key={one} value={one}>
              {t(`state.${one}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="act-state-reason" label={t("animals.reason")}>
        <Input
          id="act-state-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

/** A new ear tag, and why the old one went. */
const RetagDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [reason, setReason] = useState("");
  const retag = useMutation(
    orpc.animals.retag.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.retagged"));
        setReason("");
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("animals.manageHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => retag.mutate({ tagNumber: detail.tagNumber, reason })}
      open={open}
      pending={retag.isPending}
      ready={reason.trim() !== ""}
      submitLabel={t("animals.retag")}
      title={`${t("animals.retag")} · ${detail.tagNumber}`}
    >
      <FormField id="act-retag-reason" label={t("animals.reason")}>
        <Input
          id="act-retag-reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * How she left the herd, written down by an Owner or a Manager. Disposal is evidence: the burial rule is six feet and
 * an inspector may ask which it was, so the farm records it beside the cause rather than leaving it in memory.
 */
const MortalitySheet = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [kind, setKind] = useState<MortalityKind>("died");
  const [cause, setCause] = useState("");
  const [disposal, setDisposal] = useState<Disposal>("buried");
  const [note, setNote] = useState("");
  const [happenedAt, setHappenedAt] = useState("");
  const record = useMutation(
    orpc.animals.recordMortality.mutationOptions({
      onSuccess: () => {
        setCause("");
        toast.success(t("mortality.recorded"));
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormSheet
      description={detail.tagNumber}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          tagNumber: detail.tagNumber,
          kind,
          cause: cause.trim(),
          disposal,
          ...(note.trim() ? { disposalNote: note.trim() } : {}),
          // The round finds her at dawn and the record is written at noon; which was which is the farm's business,
          // so it can be said.
          ...(happenedAt ? { happenedAt: new Date(happenedAt) } : {}),
        })
      }
      open={open}
      pending={record.isPending}
      ready={cause.trim() !== ""}
      submitLabel={t("mortality.record")}
      title={t("mortality.record")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="mortality-kind" label={t("mortality.kind")}>
          <NativeSelect
            id="mortality-kind"
            onChange={(event) => setKind(event.target.value as MortalityKind)}
            value={kind}
          >
            {MORTALITY_KINDS.map((one) => (
              <option key={one} value={one}>
                {t(`mortality.${one}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="mortality-when" label={t("mortality.happenedAt")}>
          <Input
            id="mortality-when"
            onChange={(event) => setHappenedAt(event.target.value)}
            type="datetime-local"
            value={happenedAt}
          />
        </FormField>
      </div>
      <FormField id="mortality-cause" label={t("mortality.cause")}>
        <Input
          id="mortality-cause"
          onChange={(event) => setCause(event.target.value)}
          required
          value={cause}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="mortality-disposal" label={t("mortality.disposal")}>
          <NativeSelect
            id="mortality-disposal"
            onChange={(event) => setDisposal(event.target.value as Disposal)}
            value={disposal}
          >
            {DISPOSALS.map((one) => (
              <option key={one} value={one}>
                {t(`mortality.${one}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="mortality-note" label={t("mortality.disposalNote")}>
          <Input
            id="mortality-note"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </FormField>
      </div>
    </FormSheet>
  );
};

/** What was done with a stillborn calf's carcass, written afterwards by the Owner or the Manager: her calving
 *  recorded her death, and nobody at the calving could say. */
const DisposalDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [disposal, setDisposal] = useState<Disposal>("buried");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.animals.recordDisposal.mutationOptions({
      onSuccess: () => {
        toast.success(t("mortality.recorded"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          tagNumber: detail.tagNumber,
          disposal,
          ...(note.trim() ? { disposalNote: note.trim() } : {}),
        })
      }
      open={open}
      pending={record.isPending}
      ready
      submitLabel={t("mortality.recordDisposal")}
      title={`${t("mortality.recordDisposal")} · ${detail.tagNumber}`}
    >
      <FormField id="afterwards-disposal" label={t("mortality.disposal")}>
        <NativeSelect
          id="afterwards-disposal"
          onChange={(event) => setDisposal(event.target.value as Disposal)}
          value={disposal}
        >
          {DISPOSALS.map((one) => (
            <option key={one} value={one}>
              {t(`mortality.${one}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="afterwards-note" label={t("mortality.disposalNote")}>
        <Input
          id="afterwards-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/** A pregnancy she lost before calving — the Vet's act from the Vet's own phone; nobody else is offered it. */
const AbortionDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [abortedAt, setAbortedAt] = useState("");
  const [stageMonths, setStageMonths] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.breeding.recordAbortion.mutationOptions({
      onSuccess: () => {
        setNote("");
        toast.success(t("abortion.recorded"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          tagNumber: detail.tagNumber,
          abortedAt: abortedAt ? new Date(abortedAt) : new Date(),
          stageMonths: Number(stageMonths),
          note,
        })
      }
      open={open}
      pending={record.isPending}
      ready={note.trim() !== "" && stageMonths !== ""}
      submitLabel={t("abortion.record")}
      title={`${t("abortion.record")} · ${detail.tagNumber}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="abortion-when" label={t("abortion.when")}>
          <Input
            id="abortion-when"
            onChange={(event) => setAbortedAt(event.target.value)}
            type="datetime-local"
            value={abortedAt}
          />
        </FormField>
        <FormField id="abortion-stage" label={t("abortion.stageMonths")}>
          <Input
            id="abortion-stage"
            inputMode="numeric"
            max={9}
            min={1}
            onChange={(event) => setStageMonths(event.target.value)}
            type="number"
            value={stageMonths}
          />
        </FormField>
      </div>
      <FormField id="abortion-note" label={t("abortion.note")}>
        <Input
          id="abortion-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/** A Withdrawal cut short — the Vet's alone, with a reason. Left blank, a hold ends now; one she is not under is not
 *  touched at all. */
const ShortenDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [milkUntil, setMilkUntil] = useState("");
  const [meatUntil, setMeatUntil] = useState("");
  const [reason, setReason] = useState("");
  const shorten = useMutation(
    orpc.withdrawals.shorten.mutationOptions({
      onSuccess: () => {
        setReason("");
        toast.success(t("withdrawal.shortened"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      onOpenChange={onOpenChange}
      onSubmit={() =>
        shorten.mutate({
          animalTag: detail.tagNumber,
          ...(detail.milkWithdrawalUntil
            ? { milkUntil: milkUntil ? new Date(milkUntil) : null }
            : {}),
          ...(detail.meatWithdrawalUntil
            ? { meatUntil: meatUntil ? new Date(meatUntil) : null }
            : {}),
          reason: reason.trim(),
        })
      }
      open={open}
      pending={shorten.isPending}
      ready={reason.trim() !== ""}
      submitLabel={t("withdrawal.shorten")}
      title={`${t("withdrawal.shorten")} · ${detail.tagNumber}`}
    >
      {detail.milkWithdrawalUntil ? (
        <FormField
          hint={t("withdrawal.endNow")}
          id="milk-until"
          label={t("withdrawal.milkUntil")}
        >
          <Input
            id="milk-until"
            onChange={(event) => setMilkUntil(event.target.value)}
            type="datetime-local"
            value={milkUntil}
          />
        </FormField>
      ) : null}
      {detail.meatWithdrawalUntil ? (
        <FormField id="meat-until" label={t("withdrawal.meatUntil")}>
          <Input
            id="meat-until"
            onChange={(event) => setMeatUntil(event.target.value)}
            type="datetime-local"
            value={meatUntil}
          />
        </FormField>
      ) : null}
      <FormField id="shorten-reason" label={t("withdrawal.reason")}>
        <Input
          id="shorten-reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

/** Whichever act is open, drawn once for the page — only the ones this person may do are ever asked for. */
export const AnimalActs = ({
  act,
  detail,
  movePens,
  onClose,
}: {
  act: AnimalAct | null;
  detail: AnimalDetail;
  movePens: PenChoice[];
  onClose: () => void;
}) => {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
  const shared = { detail, onOpenChange: handleOpenChange };
  return (
    <>
      <MoveDialog
        animal={{
          tagNumber: detail.tagNumber,
          penId: detail.penId,
          penName: `${detail.pen.shed.name} / ${detail.pen.name}`,
        }}
        onOpenChange={handleOpenChange}
        open={act === "move"}
        pens={movePens}
      />
      <StateDialog {...shared} open={act === "state"} />
      <RetagDialog {...shared} open={act === "retag"} />
      <MortalitySheet {...shared} open={act === "mortality"} />
      <DisposalDialog {...shared} open={act === "disposal"} />
      <AbortionDialog {...shared} open={act === "abortion"} />
      <ShortenDialog {...shared} open={act === "shorten"} />
      <InternalSaleSheet
        key={detail.tagNumber}
        onOpenChange={handleOpenChange}
        open={act === "purse"}
        startWith={{ tagNumber: detail.tagNumber }}
      />
    </>
  );
};
