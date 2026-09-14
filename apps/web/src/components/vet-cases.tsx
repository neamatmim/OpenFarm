import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const SELECT =
  "bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-[3px] md:h-9 md:text-sm";

/**
 * Calling a visiting Vet in about her — the only way one sees her — and the Cases open on her now. For the Owner and
 * the Manager, who grant visiting access.
 */
export const VetCases = ({
  tagNumber,
  mayCall,
}: {
  tagNumber: string;
  mayCall: boolean;
}) => {
  const t = useT();
  const ids = useId();
  const queryClient = useQueryClient();
  const [vetId, setVetId] = useState("");
  const [reason, setReason] = useState("");
  const cases = useQuery({
    ...orpc.vetCases.forAnimal.queryOptions({ input: { tagNumber } }),
    enabled: mayCall,
  });
  const vets = useQuery({
    ...orpc.vetCases.visitingVets.queryOptions(),
    enabled: mayCall,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.vetCases.key() });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));
  const open = useMutation(
    orpc.vetCases.open.mutationOptions({
      onSuccess: async () => {
        toast.success(t("cases.opened"));
        setReason("");
        setVetId("");
        await refresh();
      },
      onError,
    })
  );
  const close = useMutation(
    orpc.vetCases.close.mutationOptions({
      onSuccess: async () => {
        toast.success(t("cases.closed"));
        await refresh();
      },
      onError,
    })
  );

  const nobodyToCall = (vets.data?.length ?? 0) === 0;
  if (!mayCall || (nobodyToCall && (cases.data?.length ?? 0) === 0)) {
    return null;
  }
  return (
    <Section description={t("cases.hint")} title={t("cases.title")}>
      {cases.data?.length ? (
        <ul className="divide-y rounded-lg border">
          {cases.data.map((row) => (
            <li
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              key={row.id}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Stethoscope
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="truncate">
                  {t("cases.by", { vet: row.vetName, reason: row.reason })}
                </span>
              </span>
              <Button
                disabled={close.isPending}
                onClick={() => close.mutate({ id: row.id })}
                size="sm"
                variant="ghost"
              >
                {t("cases.close")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("cases.none")}</p>
      )}
      {nobodyToCall ? (
        <p className="text-muted-foreground text-sm">{t("cases.noVets")}</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            open.mutate({ tagNumber, vetId, reason: reason.trim() });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-vet`}>{t("cases.vet")}</Label>
            <select
              className={SELECT}
              id={`${ids}-vet`}
              onChange={(event) => setVetId(event.target.value)}
              required
              value={vetId}
            >
              <option value="">—</option>
              {(vets.data ?? []).map((vet) => (
                <option key={vet.id} value={vet.id}>
                  {vet.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-reason`}>{t("cases.reason")}</Label>
            <Input
              id={`${ids}-reason`}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </div>
          <Button
            disabled={open.isPending || !vetId || !reason.trim()}
            type="submit"
          >
            {open.isPending ? <Spinner /> : null}
            {t("cases.open")}
          </Button>
        </form>
      )}
    </Section>
  );
};
