import type { Step } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { Smartphone } from "lucide-react";
import { useState } from "react";

import { EvidenceSheet } from "@/components/work/evidence-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { toast } from "@/lib/toast";

/** The Steps whose lines the phone reads from the farm when the work is done, which a preview has none of. */
const FILLED_BY_THE_FARM: ReadonlySet<string> = new Set([
  "feeding",
  "stock_count",
  "medicine_count",
  "registration_renewal",
]);

/**
 * A Step as the phone in the shed will draw it, from the very screen the phone draws it with — every answer it asks,
 * its labels and its skip — so the Owner checks it before the shed meets it. Nothing is recorded: answering it says
 * so. A new key each time it opens, so it starts unanswered.
 */
export const StepPreview = ({
  step,
  position,
}: {
  step: Step;
  position: number;
}) => {
  const { t } = useLanguage();
  const [opened, setOpened] = useState(0);
  const [open, setOpen] = useState(false);
  const fromTheFarm =
    step.effect !== undefined && FILLED_BY_THE_FARM.has(step.effect.kind);
  return (
    <>
      <Button
        aria-label={t("sop.previewStep", { number: position + 1 })}
        onClick={() => {
          setOpened((count) => count + 1);
          setOpen(true);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Smartphone aria-hidden />
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
          closeLabel={t("common.close")}
        >
          <SheetHeader className="border-b">
            <SheetTitle>
              {t("sop.previewTitle", { number: position + 1 })}
            </SheetTitle>
            <SheetDescription>{t("sop.previewHint")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {/* What the phone fills in from the farm — the Pen's Ration, the store's lines, the Registration — is not
                here to fill in, and the preview says so rather than drawing a screen the shed never sees. */}
            {fromTheFarm ? (
              <p className="text-muted-foreground border-b px-4 py-3 text-sm">
                {t("sop.previewFromTheFarm")}
              </p>
            ) : null}
            {/* The phone's own width, as the shed sees it. */}
            <div className="bg-background mx-auto max-w-[360px]">
              <EvidenceSheet
                correcting={false}
                key={opened}
                onCancel={() => setOpen(false)}
                onRecord={() => toast.info(t("sop.previewNothingRecorded"))}
                step={step}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
