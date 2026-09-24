import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stethoscope, UserPlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { EmptyState, RecordList, RecordRow, Section } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** Calling a visiting Vet in, in a dialog: which Vet, and why they are called. */
const OpenCaseDialog = ({
  tagNumber,
  vets,
  open,
  onOpenChange,
}: {
  tagNumber: string;
  vets: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useT();
  const refused = useRefused();
  const ids = useId();
  const [vetId, setVetId] = useState("");
  const [reason, setReason] = useState("");
  const call = useMutation(
    orpc.vetCases.open.mutationOptions({
      onSuccess: () => {
        toast.success(t("cases.opened"));
        setReason("");
        setVetId("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("cases.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() => call.mutate({ tagNumber, vetId, reason: reason.trim() })}
      open={open}
      pending={call.isPending}
      ready={vetId !== "" && reason.trim() !== ""}
      submitLabel={t("cases.open")}
      title={`${t("cases.open")} · ${tagNumber}`}
    >
      <FormField id={`${ids}-vet`} label={t("cases.vet")}>
        <NativeSelect
          id={`${ids}-vet`}
          onChange={(event) => setVetId(event.target.value)}
          required
          value={vetId}
        >
          <option value="">—</option>
          {vets.map((vet) => (
            <option key={vet.id} value={vet.id}>
              {vet.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id={`${ids}-reason`} label={t("cases.reason")}>
        <Input
          id={`${ids}-reason`}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

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
  const refused = useRefused();
  const [calling, setCalling] = useState(false);
  const cases = useQuery({
    ...orpc.vetCases.forAnimal.queryOptions({ input: { tagNumber } }),
    enabled: mayCall,
  });
  const vets = useQuery({
    ...orpc.vetCases.visitingVets.queryOptions(),
    enabled: mayCall,
  });
  const close = useMutation(
    orpc.vetCases.close.mutationOptions({
      onSuccess: () => {
        toast.success(t("cases.closed"));
      },
      onError: refused,
    })
  );

  const nobodyToCall = (vets.data?.length ?? 0) === 0;
  if (!mayCall || (nobodyToCall && (cases.data?.length ?? 0) === 0)) {
    return null;
  }
  return (
    <Section
      action={
        nobodyToCall ? null : (
          <Button
            onClick={() => setCalling(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <UserPlus aria-hidden data-icon="inline-start" />
            {t("cases.open")}
          </Button>
        )
      }
      description={t("cases.hint")}
      title={t("cases.title")}
    >
      {cases.data?.length ? (
        <RecordList>
          {cases.data.map((row) => (
            <RecordRow
              key={row.id}
              leading={
                <Stethoscope
                  aria-hidden
                  className="text-muted-foreground size-4"
                />
              }
              title={t("cases.by", { vet: row.vetName, reason: row.reason })}
              trailing={
                <Button
                  disabled={close.isPending}
                  onClick={() => close.mutate({ id: row.id })}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {close.isPending ? <Spinner /> : null}
                  {t("cases.close")}
                </Button>
              }
            />
          ))}
        </RecordList>
      ) : (
        <EmptyState bare icon={Stethoscope} title={t("cases.none")} />
      )}
      {nobodyToCall ? (
        <p className="text-muted-foreground text-sm">{t("cases.noVets")}</p>
      ) : (
        <OpenCaseDialog
          onOpenChange={setCalling}
          open={calling}
          tagNumber={tagNumber}
          vets={vets.data ?? []}
        />
      )}
    </Section>
  );
};
