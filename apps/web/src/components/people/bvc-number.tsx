import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { SettingsSection } from "@/components/farm-parameters";
import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * A Vet's Bangladesh Veterinary Council registration number, printed beside their name on every paper that names them
 * prescribing or diagnosing. The Vet's own on Settings; whoever runs the farm writes it on the Vet's page from the
 * council's certificate. Left out, it is the signed-in Vet's own.
 */
export const BvcNumberSection = ({
  userId,
  bvcNumber,
}: {
  userId?: string;
  bvcNumber: string | null;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation(
    orpc.people.setBvcNumber.mutationOptions({
      onSuccess: () => {
        toast.success(t("people.bvc.saved"));
        setDraft(null);
      },
      onError: refused,
    })
  );
  const saved = bvcNumber ?? "";
  const shown = draft ?? saved;
  return (
    <SettingsSection
      changed={draft !== null && draft.trim() !== saved}
      description={t("people.bvc.why")}
      id="bvc-number"
      onReset={() => setDraft(null)}
      onSubmit={() => save.mutate({ userId, bvcNumber: shown.trim() || null })}
      pending={save.isPending}
      saveLabel={t("people.bvc.save")}
      title={t("people.bvc.title")}
    >
      <FormField
        className="sm:w-72"
        id="bvc-number-field"
        label={t("people.bvc.number")}
      >
        <Input
          id="bvc-number-field"
          maxLength={40}
          onChange={(event) => setDraft(event.target.value)}
          value={shown}
        />
      </FormField>
    </SettingsSection>
  );
};
