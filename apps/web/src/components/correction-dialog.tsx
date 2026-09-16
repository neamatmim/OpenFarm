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
import type { Fields } from "@/lib/correcting";
import { anythingChanged, asShown, changesFrom } from "@/lib/correcting";
import {
  correctionRefusalMessage,
  isChangedSince,
} from "@/lib/correction-refusal";

/**
 * Putting a record right: what to change, and why. The original stays readable in the trail beside the correction,
 * so the reason is asked for every time — a correction nobody can explain is a record nobody can trust.
 *
 * Its fields start from what the record says each time it opens. When somebody else corrected the record since, the
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
}: {
  title: string;
  description?: string;
  /** The button's words; "Correct" by default. */
  trigger?: string;
  children: ReactNode;
  /** Puts the fields back to what the record says now, as the dialog opens. */
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
      toast.error(
        correctionRefusalMessage(error, t) ??
          ((error as Error).message || t("common.error"))
      );
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
export const CorrectionField = ({
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

/**
 * A record being put right: the fields it has, filled from what it says now, and what was typed into them.
 *
 * The screen says which fields a Correction edits and what kind each one is; what changed, and whether anything did,
 * is worked out from the record itself rather than compared by hand. A Correction that changes nothing is not offered
 * to the farm at all.
 */
export const useCorrecting = (fields: Fields) => {
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    asShown(fields)
  );
  return {
    /** What each box shows now. */
    typed,
    /** One box's words, as somebody types them. */
    set: (name: string, value: string) =>
      setTyped((boxes) => ({ ...boxes, [name]: value })),
    /** Back to what the record says, which is what opening the dialog does. */
    handleOpen: () => setTyped(asShown(fields)),
    /** Whether there is a Correction to make at all. */
    changed: anythingChanged(fields, typed),
    /** What the farm is told changed. */
    changes: () => changesFrom(fields, typed),
  };
};
