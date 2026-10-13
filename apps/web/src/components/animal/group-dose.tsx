import { MANY_AT_ONCE, tooManyAtOnce } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { Pill } from "lucide-react";
import { useRef, useState } from "react";

import { DoseFields, useDoseForm } from "@/components/animal/dose-form";
import type { HerdRow } from "@/components/animal/herd-list";
import { FormDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { refusedLines } from "@/lib/several-refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * The id each ticked animal's dose is written under, kept for as long as this dose is being given: sent again after an
 * answer that never came, the same ids, so the farm finds the doses it wrote and writes nobody's twice.
 */
const useDoseIds = () => {
  const ids = useRef(new Map<string, string>());
  return {
    of: (tagNumber: string) => {
      const known = ids.current.get(tagNumber);
      if (known) {
        return known;
      }
      const made = crypto.randomUUID();
      ids.current.set(tagNumber, made);
      return made;
    },
    /** A new dose: new ids. */
    handleForget: () => ids.current.clear(),
  };
};

/**
 * One dose not prescribed for every animal ticked on the herd list — the pharmacy's wormer for a Pen of calves — rather
 * than her page and the dose dialog once each. Each animal's dose is still her own, held as one given alone; a medicine
 * that may not be given is refused whole and the dialog stays as it was, and the animals the farm would not dose are
 * named with why while the rest are written. The Owner's and the Manager's, as one dose is.
 */
export const GroupDose = ({
  chosen,
  may,
  onDone,
}: {
  chosen: HerdRow[];
  /** Whether this person may write a dose not prescribed: nothing is drawn for one who may not. */
  may: boolean;
  onDone: () => void;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const [open, setOpen] = useState(false);
  const form = useDoseForm(open);
  const ids = useDoseIds();
  const count = formatNumber(chosen.length, language);
  const tooMany = tooManyAtOnce(chosen.length);
  const give = useMutation(
    orpc.treatments.giveNotPrescribedMany.mutationOptions({
      onSuccess: ({ given, refused }) => {
        setOpen(false);
        form.handleClear();
        ids.handleForget();
        if (given.length > 0) {
          toast.success(
            t("dose.groupGiven", {
              count: formatNumber(given.length, language),
            })
          );
        }
        if (refused.length > 0) {
          // Who, and why, and the ticks kept: somebody has something to do about them.
          toast.error(
            t("dose.groupRefused", {
              count: formatNumber(refused.length, language),
            }),
            {
              description: refusedLines(refused, t, (iso) =>
                formatDate(new Date(iso), language, "date")
              ).join(" · "),
            }
          );
          return;
        }
        onDone();
      },
      onError,
    })
  );
  if (!may) {
    return null;
  }
  return (
    <>
      {tooMany ? (
        <span className="text-muted-foreground text-xs">
          {t("several.tooMany", { max: formatNumber(MANY_AT_ONCE, language) })}
        </span>
      ) : null}
      <Button
        disabled={tooMany}
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <Pill aria-hidden data-icon="inline-start" />
        {t("dose.group", { count })}
      </Button>
      <FormDialog
        description={chosen.map((one) => one.tagNumber).join(", ")}
        onOpenChange={setOpen}
        onSubmit={() =>
          give.mutate({
            animals: chosen.map((one) => ({
              tagNumber: one.tagNumber,
              id: ids.of(one.tagNumber),
            })),
            ...form.sent(),
          })
        }
        open={open}
        pending={give.isPending}
        ready={form.ready}
        submitLabel={t("dose.group", { count })}
        title={t("dose.group", { count })}
      >
        <DoseFields form={form} id="group-dose" />
      </FormDialog>
    </>
  );
};
