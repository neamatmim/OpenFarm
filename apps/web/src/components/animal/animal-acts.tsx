import type { Disposal, MortalityKind } from "@OpenFarm/domain";
import {
  ADULT_DEATH_CAUSES,
  CALF_DEATH_CAUSES,
  DISPOSALS,
  daysOfADoseNotPrescribed,
  MORTALITY_KINDS,
  statesSetByHand,
} from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DeathPhotoField } from "@/components/animal/death-photo";
import { MoveDialog } from "@/components/animal/move-dialog";
import { Notice } from "@/components/page";
import {
  FormDialog,
  FormField,
  FormSheet,
  NativeSelect,
} from "@/components/page-kit";
import { InternalSaleSheet } from "@/components/ventures/internal-sale-sheet";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { AnimalAct, AnimalDetail, PenChoice } from "./animal-types";
import { herRecentDiagnoses } from "./animal-types";

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
  // Out of Quarantine by hand: not while an arrival dose is still owed him, as by his Release — said before it is asked.
  const owed = useQuery({
    ...orpc.animals.dosesOwed.queryOptions({
      input: { tagNumber: detail.tagNumber },
    }),
    enabled: open && detail.state === "quarantine",
  });
  const stillOwed = (owed.data ?? []).filter((one) => !one.excused);
  const heldIn = detail.state === "quarantine" && stillOwed.length > 0;
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
      ready={nextState !== "" && !heldIn}
      submitLabel={t("animals.setState")}
      title={`${t("animals.setState")} · ${detail.tagNumber}`}
    >
      {heldIn ? (
        <Notice
          title={t("work.releaseOwesDoses", {
            doses: stillOwed.map((one) => one.name.bn).join(", "),
          })}
          tone="warning"
        />
      ) : null}
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
  const { t, language } = useLanguage();
  const onError = useRefused();
  const [kind, setKind] = useState<MortalityKind>("died");
  const [cause, setCause] = useState("");
  const [disposal, setDisposal] = useState<Disposal>("buried");
  const [note, setNote] = useState("");
  const [happenedAt, setHappenedAt] = useState("");
  const [diagnosisId, setDiagnosisId] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  // Her Vet's recent conclusions, one of which she may have died of: linked, the register names the disease and the
  // office's reference. Only those who read her clinical record are sent any.
  const diagnoses = herRecentDiagnoses(detail, new Date());
  const causes =
    detail.state === "calf" ? CALF_DEATH_CAUSES : ADULT_DEATH_CAUSES;
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
          ...(diagnosisId ? { diagnosisId } : {}),
          ...(photo ? { photo } : {}),
        })
      }
      open={open}
      pending={record.isPending}
      ready={cause.trim() !== "" && photo !== null}
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
      {/* What calves, or grown cattle, most often die of, one tap away — kept in Bangla so the loss figures count each
          once. Another cause is still typed. */}
      <div className="flex flex-wrap gap-2">
        {causes.map((one) => (
          <Button
            key={one.bn}
            onClick={() => setCause(one.bn)}
            size="sm"
            type="button"
            variant={cause === one.bn ? "secondary" : "outline"}
          >
            {language === "en" ? one.en : one.bn}
          </Button>
        ))}
      </div>
      {diagnoses.length > 0 ? (
        <FormField
          hint={t("mortality.diagnosisHint")}
          id="mortality-diagnosis"
          label={t("mortality.diagnosis")}
        >
          <NativeSelect
            id="mortality-diagnosis"
            onChange={(event) => setDiagnosisId(event.target.value)}
            value={diagnosisId}
          >
            <option value="">{t("mortality.noDiagnosis")}</option>
            {diagnoses.map((one) => (
              <option key={one.id} value={one.id}>
                {`${one.disease} · ${formatDate(one.diagnosedAt, language, "date")}`}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
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
      <DeathPhotoField id="mortality-photo" onChange={setPhoto} />
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
  const [photo, setPhoto] = useState<Photo | null>(null);
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
          ...(photo ? { photo } : {}),
        })
      }
      open={open}
      pending={record.isPending}
      ready={photo !== null}
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
      <DeathPhotoField id="afterwards-photo" onChange={setPhoto} />
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

/** What the chosen medicine will hold her for: its own days, the Vet's default, or nothing yet — ask the Vet. */
const DoseDays = ({
  product,
  byDefault,
}: {
  product: {
    milkWithdrawalDays: number | null;
    meatWithdrawalDays: number | null;
  };
  byDefault: { milkDays: number | null; meatDays: number | null } | undefined;
}) => {
  const { t } = useLanguage();
  const days = daysOfADoseNotPrescribed(product, {
    milkDays: byDefault?.milkDays ?? null,
    meatDays: byDefault?.meatDays ?? null,
  });
  if (!days) {
    return <p className="text-danger text-sm">{t("dose.askTheVet")}</p>;
  }
  const milk = product.milkWithdrawalDays ?? days.milkWithdrawalDays ?? 0;
  const meat = product.meatWithdrawalDays ?? days.meatWithdrawalDays ?? 0;
  const tookTheDefault =
    days.milkWithdrawalDays !== null || days.meatWithdrawalDays !== null;
  return (
    <p className="bg-muted rounded-md px-3 py-2 text-sm">
      {t(tookTheDefault ? "dose.holdsDefault" : "dose.holdsOwn", {
        milk,
        meat,
      })}
    </p>
  );
};

/**
 * A dose not prescribed: medicine the pharmacy or anybody advised, given before the Vet saw her. Written by the Owner
 * or the Manager so her milk and meat are held as any dose holds them; the Vet is told at once.
 */
const DoseDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const drugs = useQuery({ ...orpc.drugs.list.queryOptions(), enabled: open });
  const byDefault = useQuery({
    ...orpc.drugs.defaultDays.queryOptions(),
    enabled: open,
  });
  const [productId, setProductId] = useState("");
  const [givenAt, setGivenAt] = useState("");
  const [advice, setAdvice] = useState("");
  const give = useMutation(
    orpc.treatments.giveNotPrescribed.mutationOptions({
      onSuccess: () => {
        setProductId("");
        setGivenAt("");
        setAdvice("");
        toast.success(t("dose.recorded"));
        onOpenChange(false);
      },
      onError,
    })
  );
  const products = (drugs.data ?? []).filter((one) => one.retiredAt === null);
  const chosen = products.find((one) => one.id === productId);
  const mayBeGiven =
    chosen !== undefined &&
    daysOfADoseNotPrescribed(chosen, {
      milkDays: byDefault.data?.milkDays ?? null,
      meatDays: byDefault.data?.meatDays ?? null,
    }) !== null;
  return (
    <FormDialog
      description={t("dose.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        give.mutate({
          animalTag: detail.tagNumber,
          productId,
          advice: advice.trim(),
          ...(givenAt ? { givenAt: new Date(givenAt) } : {}),
        })
      }
      open={open}
      pending={give.isPending}
      ready={mayBeGiven && advice.trim() !== ""}
      submitLabel={t("dose.give")}
      title={`${t("dose.give")} · ${detail.tagNumber}`}
    >
      <FormField id="dose-product" label={t("dose.product")}>
        <NativeSelect
          id="dose-product"
          onChange={(event) => setProductId(event.target.value)}
          required
          value={productId}
        >
          <option value="">{t("dose.pick")}</option>
          {products.map((one) => (
            <option key={one.id} value={one.id}>
              {language === "en" ? (one.nameEn ?? one.nameBn) : one.nameBn}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {chosen ? <DoseDays byDefault={byDefault.data} product={chosen} /> : null}
      <FormField id="dose-when" label={t("dose.givenAt")}>
        <Input
          id="dose-when"
          onChange={(event) => setGivenAt(event.target.value)}
          type="datetime-local"
          value={givenAt}
        />
      </FormField>
      <FormField id="dose-advice" label={t("dose.advice")}>
        <Input
          id="dose-advice"
          maxLength={300}
          onChange={(event) => setAdvice(event.target.value)}
          required
          value={advice}
        />
      </FormField>
    </FormDialog>
  );
};

/** Whichever act is open, drawn once for the page — only the ones this person may do are ever asked for. */
/** Not found: the Manager has walked a Pen that did not count right and knows which animal is not in it. She stays in
 *  the herd while the farm looks for her, and the Owner and the Manager are told at once, as by the round. */
const NotFoundDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const mark = useMutation(
    orpc.animals.notFound.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.markedNotFound", { tag: detail.tagNumber }));
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("animals.markNotFoundHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => mark.mutate({ tagNumber: detail.tagNumber })}
      open={open}
      pending={mark.isPending}
      ready
      submitLabel={t("animals.markNotFound")}
      title={`${t("animals.markNotFound")} · ${detail.tagNumber}`}
    >
      {/* Where the farm thinks she is: the Pen the Manager has just walked. */}
      <p className="text-sm">
        {detail.pen.shed.name} / {detail.pen.name}
      </p>
    </FormDialog>
  );
};

/**
 * The Owner writes her off as Lost: the round could not find her and nobody has since. What became of her in the
 * Owner's words, and — stolen — the thana's GD number, which the farm asks for.
 */
const WriteOffDialog = ({ detail, open, onOpenChange }: ActProps) => {
  const { t } = useLanguage();
  const onError = useRefused({ venture_owns_her: "animals.writeOffVenture" });
  const [cause, setCause] = useState("");
  const [stolen, setStolen] = useState(false);
  const [gdNumber, setGdNumber] = useState("");
  const writeOff = useMutation(
    orpc.animals.writeOff.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.writeOffDone", { tag: detail.tagNumber }));
        setCause("");
        setStolen(false);
        setGdNumber("");
        onOpenChange(false);
      },
      onError,
    })
  );
  const gdSaid = gdNumber.trim() !== "";
  return (
    <FormDialog
      description={t("animals.writeOffHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        writeOff.mutate({
          tagNumber: detail.tagNumber,
          cause: cause.trim(),
          stolen,
          ...(stolen && gdSaid ? { gdNumber: gdNumber.trim() } : {}),
        })
      }
      open={open}
      pending={writeOff.isPending}
      ready={cause.trim() !== "" && (!stolen || gdSaid)}
      submitLabel={t("animals.writeOff")}
      title={`${t("animals.writeOff")} · ${detail.tagNumber}`}
    >
      <FormField id="write-off-cause" label={t("animals.writeOffCause")}>
        <Input
          id="write-off-cause"
          onChange={(event) => setCause(event.target.value)}
          required
          value={cause}
        />
      </FormField>
      <label
        className="has-data-checked:border-primary/40 has-data-checked:bg-primary/5 hover:bg-muted/50 flex h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm md:h-9"
        htmlFor="write-off-stolen"
      >
        <Checkbox
          checked={stolen}
          id="write-off-stolen"
          onCheckedChange={setStolen}
        />
        {t("animals.writeOffStolen")}
      </label>
      {stolen ? (
        <FormField id="write-off-gd" label={t("animals.writeOffGd")}>
          <Input
            id="write-off-gd"
            onChange={(event) => setGdNumber(event.target.value)}
            required
            value={gdNumber}
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
};

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
      <NotFoundDialog {...shared} open={act === "notFound"} />
      <WriteOffDialog {...shared} open={act === "writeOff"} />
      <DoseDialog {...shared} open={act === "dose"} />
      <InternalSaleSheet
        key={detail.tagNumber}
        onOpenChange={handleOpenChange}
        open={act === "purse"}
        startWith={{ tagNumber: detail.tagNumber }}
      />
    </>
  );
};
