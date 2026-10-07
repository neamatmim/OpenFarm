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
