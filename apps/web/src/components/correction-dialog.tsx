import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import type { StillMissing } from "@/components/page-kit";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import type { Answers } from "@/lib/correcting";
import { asShown, changesFrom, readyToSend } from "@/lib/correcting";
import { isChangedSince } from "@/lib/correction-refusal";
import { useRefused } from "@/lib/refused";
import type { OwnWords } from "@/lib/saying";
import { sayWhy } from "@/lib/saying";
import { toast } from "@/lib/toast";

/**
 * Putting a record right: what to change, and why. The original stays readable in the trail beside the correction,
 * so the reason is asked for every time — a correction nobody can explain is a record nobody can trust.
 *
 * Its answers start from what the record says each time it opens. When somebody else corrected the record since, the
 * farm refuses what was typed against the old values (ADR 0005): the dialog closes, the page is read again, and opening
 * it again starts from what the record says now. Any other refusal is said at the dialog's top, and it stays open.
 *
 * The kit's form dialog, as every other short form is: Cancel beside the act, what is still missing said at its foot
 * in the farm's words, and a close with something typed in it asked about first.
 */
export const CorrectionDialog = ({
  title,
  description,
  trigger,
  children,
  onOpen,
  onSave,
  ready = true,
  ownWords,
}: {
  title: string;
  description?: string;
  /** The button's words; "Correct" by default. */
  trigger?: string;
  children: ReactNode;
  /** This screen's own words for the refusals only it can meet. */
  ownWords?: OwnWords;
  /** Puts the answers back to what the record says now, as the dialog opens. */
  onOpen: () => void;
  /** Resolves when the farm has taken the correction; the dialog closes then, and stays open on a refusal. */
  onSave: (reason: string) => Promise<unknown>;
  /** Whether something has been changed that the farm could take. */
  ready?: boolean;
}) => {
  const t = useT();
  const queryClient = useQueryClient();
  const refused = useRefused(ownWords);
  const id = useId();
  const whyId = `${id}-why`;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(reason.trim());
      setSaving(false);
      toast.success(t("correct.saved"));
      setReason("");
      setOpen(false);
    } catch (error) {
      setSaving(false);
      if (isChangedSince(error)) {
        // Closed first, so the refusal is said beside the page read again rather than in a dialog going away.
        setOpen(false);
        toast.error(sayWhy(error, t, ownWords));
        await queryClient.invalidateQueries();
        return;
      }
      refused(error);
    }
  };

  const reasonGiven = reason.trim() !== "";
  let missing: StillMissing | null = null;
  if (!ready) {
    missing = { said: t("correct.nothingChanged") };
  } else if (!reasonGiven) {
    missing = { said: t("correct.whyMissing"), at: whyId };
  }

  return (
    <>
      <Button
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PencilLine aria-hidden />
        {trigger ?? t("correct.open")}
      </Button>
      <FormDialog
        description={description ?? t("correct.hint")}
        missing={missing}
        onOpenChange={setOpen}
        onSubmit={save}
        open={open}
        pending={saving}
        ready={ready && reasonGiven}
        submitLabel={t("correct.save")}
        title={title}
      >
        {children}
        <FormField id={whyId} label={t("correct.why")}>
          <Input
            id={whyId}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </FormField>
      </FormDialog>
    </>
  );
};

/** A labeled box inside a correction, filled with what the record says now. */
export const CorrectionAnswer = ({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date" | "datetime-local" | "tel";
  inputMode?: "decimal" | "numeric" | "tel";
}) => {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <Input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        step={type === "number" ? "any" : undefined}
        type={type}
        value={value}
      />
    </FormField>
  );
};

/** One of a fixed few words, inside a correction: how she went, what was done with her. */
export const CorrectionChoice = ({
  label,
  value,
  options,
  onChange,
  unchosen,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  /** What an unanswered choice reads as, for a record the farm is still waiting on. Left out, one must be chosen. */
  unchosen?: string;
}) => {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <NativeSelect
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {unchosen === undefined ? null : <option value="">{unchosen}</option>}
        {options.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
};

/**
 * A record being put right: the answers it has, filled from what it says now, and what was typed into them.
 *
 * The screen says which answers a Correction edits and what kind each one is; what changed, and whether anything did,
 * is worked out from the record itself rather than compared by hand. A Correction that changes nothing is not offered
 * to the farm at all.
 */
export const useCorrecting = (answers: Answers) => {
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    asShown(answers)
  );
  return {
    /** What each box shows now. */
    typed,
    /** One box's words, as somebody types them. */
    set: (name: string, value: string) =>
      setTyped((boxes) => ({ ...boxes, [name]: value })),
    /** Back to what the record says, which is what opening the dialog does. */
    handleOpen: () => setTyped(asShown(answers)),
    /** Whether there is a Correction the farm could take: something changed, and everything typed can be sent. */
    changed: readyToSend(answers, typed),
    /** What the farm is told changed. */
    changes: () => changesFrom(answers, typed),
  };
};
