import type { SopContent } from "@OpenFarm/domain";
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
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const SELECT =
  "bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-[3px] md:h-9 md:text-sm";

/**
 * Work the clock does not raise — a weigh-in, a vaccination campaign, the calving pen, a stock count — raised by the
 * Manager for a Pen, now. It lands on today's list like any other, and asking twice for the same Pen on the same day
 * raises it once.
 */
export const RaiseWork = ({ definitionId }: { definitionId?: string }) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [sop, setSop] = useState(definitionId ?? "");
  const [pen, setPen] = useState("");
  const sops = useQuery({ ...orpc.sops.list.queryOptions(), enabled: open });
  const sheds = useQuery({ ...orpc.herd.list.queryOptions(), enabled: open });
  const raise = useMutation(
    orpc.instances.raiseNow.mutationOptions({
      onSuccess: async ({ raised }) => {
        toast.success(raised > 0 ? t("work.raised") : t("work.raisedAlready"));
        setOpen(false);
        setPen("");
        await queryClient.invalidateQueries({ queryKey: orpc.instances.key() });
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  const choices = (sops.data ?? [])
    .filter((row) => !row.retiredAt && row.currentVersion)
    .map((row) => {
      const { name } = row.currentVersion?.content as SopContent;
      return { id: row.id, name: language === "en" && name.en ? name.en : name.bn };
    });
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((one) => ({ id: one.id, name: `${shed.name} / ${one.name}` }))
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button variant={definitionId ? "outline" : "default"}>
            <CirclePlus aria-hidden />
            {t("work.raise")}
          </Button>
        }
      />
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("work.raiseTitle")}</DialogTitle>
          <DialogDescription>{t("work.raiseHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            raise.mutate({ definitionId: sop, penId: pen });
          }}
        >
          {definitionId ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-sop`}>{t("work.raiseSop")}</Label>
              <select
                className={SELECT}
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
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-pen`}>{t("work.raisePen")}</Label>
            <select
              className={SELECT}
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
            </select>
          </div>
          <DialogFooter>
            <Button disabled={raise.isPending || !sop || !pen} type="submit">
              {raise.isPending ? <Spinner /> : null}
              {t("work.raiseSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
