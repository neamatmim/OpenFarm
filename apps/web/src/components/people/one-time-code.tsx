import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useT } from "@/i18n/language-provider";

/** How long "copied" stays on the button before it offers to copy again. */
const COPIED_FOR_MS = 2000;

/** The code, large and set apart, with a button that puts it on the clipboard where the browser allows one. */
const CodeBox = ({ code }: { code: string }) => {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FOR_MS);
    } catch {
      // A browser that will not share its clipboard still shows the code, large, to be read out or written down.
      setCopied(false);
    }
  };
  return (
    <div className="bg-muted/60 flex flex-col items-center gap-3 rounded-xl border p-4 sm:flex-row sm:justify-between">
      <output
        aria-live="polite"
        className="font-mono text-3xl font-semibold tracking-[0.25em] break-all tabular-nums select-all"
      >
        {code}
      </output>
      <Button
        className="w-full sm:w-auto"
        onClick={handleCopy}
        type="button"
        variant="outline"
      >
        {copied ? (
          <Check aria-hidden className="text-success" />
        ) : (
          <Copy aria-hidden />
        )}
        {copied ? t("people.copied") : t("people.copy")}
      </Button>
    </div>
  );
};

/**
 * A code the farm shows once and never again — an invitation, a forgotten password, a Shed Phone's enrolment — in a
 * dialog of its own, so it cannot scroll away or be lost under the next thing on the page. It closes only when somebody
 * says they are done with it: a stray tap beside it does not throw the code away.
 */
export const OneTimeCode = ({
  code,
  title,
  description,
  note,
  onDone,
}: {
  /** The code to hand over; nothing is drawn without one. */
  code: string | null;
  title: ReactNode;
  description?: ReactNode;
  /** A line of warning under the code — how long it lasts, that it is shown only now. */
  note?: ReactNode;
  onDone: () => void;
}) => {
  const t = useT();
  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) {
          onDone();
        }
      }}
      open={code !== null}
    >
      <DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound aria-hidden className="text-primary size-5 shrink-0" />
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {code ? <CodeBox code={code} /> : null}
        <p className="bg-warning-surface text-warning border-warning/30 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {note ?? t("people.codeOnce")}
        </p>
        <DialogFooter>
          <Button onClick={onDone} type="button">
            {t("people.codeDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
