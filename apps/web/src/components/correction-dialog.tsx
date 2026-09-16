import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import type { Answers } from "@/lib/correcting";
import { asShown, changesFrom, readyToSend } from "@/lib/correcting";
import { isChangedSince } from "@/lib/correction-refusal";
import type { OwnWords } from "@/lib/saying";
import { sayWhy } from "@/lib/saying";

/**
 * Putting a record right: what to change, and why. The original stays readable in the trail beside the correction,
 * so the reason is asked for every time — a correction nobody can explain is a record nobody can trust.
 *
 * Its answers start from what the record says each time it opens. When somebody else corrected the record since, the
 * farm refuses what was typed against the old values (ADR 0005): the dialog closes, the page is read again, and opening
 * it again starts from what the record says now.
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
  ready?: boolean;
}) => {
  const t = useT();
  const queryClient = useQueryClient();
  const id = useId();
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
      toast.error(sayWhy(error, t, ownWords));
      if (isChangedSince(error)) {
        setOpen(false);
        await queryClient.invalidateQueries();
      }
    }
  };

  return (
    <Dialog
      onOpenChange={(opening) => {
        if (opening) {
          onOpen();
        }
        setOpen(opening);
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <PencilLine aria-hidden />
            {trigger ?? t("correct.open")}
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? t("correct.hint")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {children}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-why`}>{t("correct.why")}</Label>
            <Input
              id={`${id}-why`}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button disabled={saving || !ready || !reason.trim()} type="submit">
              {saving ? <Spinner /> : null}
              {t("correct.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** A labelled box inside a correction, filled with what the record says now. */
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
  type?: "text" | "number" | "date" | "tel";
  inputMode?: "decimal" | "numeric" | "tel";
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        step={type === "number" ? "any" : undefined}
        type={type}
        value={value}
      />
    </div>
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
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
      </select>
    </div>
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
