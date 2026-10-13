import type { SopContent } from "@OpenFarm/domain";
import { mayRaiseByHand } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import { useId, useState } from "react";

import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * Work the clock does not raise — a weigh-in, a vaccination campaign, the calving pen, a stock count — raised by the
 * Manager now, in one Pen or several at once: a Campaign over a whole shed is one act, a piece of work in each Pen. It
 * lands on today's list like any other, and asking twice for the same Pen on the same day raises it once.
 */
export const RaiseWork = ({
  definitionId,
  penId,
  penIds,
  size,
  label,
}: {
  definitionId?: string;
  /** "sm" in a table's row, whose buttons are the small size so their words sit on the row's line. */
  size?: "sm";
  /** Raised from a page already narrowed to one Pen: that Pen, chosen already — still hers to change. */
  penId?: string;
  /** Raised for the Pens holding animals owed it: those, chosen already. */
  penIds?: readonly string[];
  /** The button's own words, where the place it stands says more than "Raise work". */
  label?: string;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const ids = useId();
  const chosenAtFirst = penIds ?? (penId ? [penId] : []);
  const [open, setOpen] = useState(false);
  const [sop, setSop] = useState(definitionId ?? "");
  const [pens, setPens] = useState<readonly string[]>(chosenAtFirst);
  const sops = useQuery({ ...orpc.sops.list.queryOptions(), enabled: open });
  const sheds = useQuery({ ...orpc.sheds.list.queryOptions(), enabled: open });
  const raise = useMutation(
    orpc.work.raiseNow.mutationOptions({
      onSuccess: ({ raised, openAlready }) => {
        if (raised > 0) {
          toast.success(
            t("work.raisedIn", { count: formatNumber(raised, language) })
          );
        }
        // A Campaign already standing open in a Pen was not raised there again: walked where it stands.
        if (openAlready > 0) {
          toast.info(
            t("work.raisedOpenAlready", {
              count: formatNumber(openAlready, language),
            })
          );
        }
        if (raised === 0 && openAlready === 0) {
          toast.success(t("work.raisedAlready"));
        }
        setOpen(false);
        setPens(chosenAtFirst);
      },
      onError: refused,
    })
  );

  const choices = (sops.data ?? []).flatMap((row) => {
    if (row.retiredAt || !row.currentVersion) {
      return [];
    }
    const content = row.currentVersion.content as SopContent;
    // A dose is raised by its Prescription, never from here.
    if (!mayRaiseByHand(content)) {
      return [];
    }
    const { name } = content;
    return [
      { id: row.id, name: language === "en" && name.en ? name.en : name.bn },
    ];
  });
  const everyPen = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((one) => ({ id: one.id, name: `${shed.name} / ${one.name}` }))
  );
  const chosen = new Set(pens);
  const allChosen =
    everyPen.length > 0 && everyPen.every((one) => chosen.has(one.id));
  const choose = (id: string, yes: boolean) =>
    setPens((current) =>
      yes ? [...current, id] : current.filter((one) => one !== id)
    );

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={size}
        type="button"
        variant={definitionId ? "outline" : "default"}
      >
        <CirclePlus aria-hidden data-icon="inline-start" />
        {label ?? t("work.raise")}
      </Button>
      <FormDialog
        description={t("work.raiseHint")}
        onOpenChange={setOpen}
        onSubmit={() => raise.mutate({ definitionId: sop, penIds: [...pens] })}
        open={open}
        pending={raise.isPending}
        ready={sop !== "" && pens.length > 0}
        submitLabel={t("work.raiseSubmit")}
        title={t("work.raiseTitle")}
      >
        {definitionId ? null : (
          <FormField id={`${ids}-sop`} label={t("work.raiseSop")}>
            <NativeSelect
              id={`${ids}-sop`}
              onChange={(event) => setSop(event.target.value)}
              required
              value={sop}
            >
              <option value="">—</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">
            {t("work.raisePens")}
          </legend>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium md:min-h-0">
            <Checkbox
              checked={allChosen}
              onCheckedChange={(checked) =>
                setPens(checked === true ? everyPen.map((one) => one.id) : [])
              }
            />
            {t("work.raiseEveryPen")}
          </label>
          {everyPen.map((one) => (
            <label
              className="inline-flex min-h-11 items-center gap-2 text-sm md:min-h-0"
              key={one.id}
            >
              <Checkbox
                checked={chosen.has(one.id)}
                onCheckedChange={(checked) => choose(one.id, checked === true)}
              />
              {one.name}
            </label>
          ))}
        </fieldset>
      </FormDialog>
    </>
  );
};
