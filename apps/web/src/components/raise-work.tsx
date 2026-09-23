import type { SopContent } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * Work the clock does not raise — a weigh-in, a vaccination campaign, the calving pen, a stock count — raised by the
 * Manager for a Pen, now. It lands on today's list like any other, and asking twice for the same Pen on the same day
 * raises it once.
 */
export const RaiseWork = ({ definitionId }: { definitionId?: string }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [sop, setSop] = useState(definitionId ?? "");
  const [pen, setPen] = useState("");
  const sops = useQuery({ ...orpc.sops.list.queryOptions(), enabled: open });
  const sheds = useQuery({ ...orpc.herd.list.queryOptions(), enabled: open });
  const raise = useMutation(
    orpc.instances.raiseNow.mutationOptions({
      onSuccess: ({ raised }) => {
        toast.success(raised > 0 ? t("work.raised") : t("work.raisedAlready"));
        setOpen(false);
        setPen("");
      },
      onError: refused,
    })
  );

  const choices = (sops.data ?? []).flatMap((row) => {
    if (row.retiredAt || !row.currentVersion) {
      return [];
    }
    const { name } = row.currentVersion.content as SopContent;
    return [
      { id: row.id, name: language === "en" && name.en ? name.en : name.bn },
    ];
  });
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((one) => ({ id: one.id, name: `${shed.name} / ${one.name}` }))
  );

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        type="button"
        variant={definitionId ? "outline" : "default"}
      >
        <CirclePlus aria-hidden data-icon="inline-start" />
        {t("work.raise")}
      </Button>
      <FormDialog
        description={t("work.raiseHint")}
        onOpenChange={setOpen}
        onSubmit={() => raise.mutate({ definitionId: sop, penId: pen })}
        open={open}
        pending={raise.isPending}
        ready={sop !== "" && pen !== ""}
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
        <FormField id={`${ids}-pen`} label={t("work.raisePen")}>
          <NativeSelect
            id={`${ids}-pen`}
            onChange={(event) => setPen(event.target.value)}
            required
            value={pen}
          >
            <option value="">—</option>
            {pens.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </FormDialog>
    </>
  );
};
