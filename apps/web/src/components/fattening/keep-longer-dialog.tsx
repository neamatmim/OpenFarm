import { Input } from "@OpenFarm/ui/components/input";
import { useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

import type { Suggestion } from "./fattening-types";

/**
 * "Keep it longer", and why, in a dialog over the suggestions. The reason is asked for every time: a queue cleared
 * without a word is a queue nobody can audit. The page keys the dialog on the animal, so a second one starts blank.
 */
export const KeepLongerDialog = ({
  row,
  pending,
  onOpenChange,
  onKeep,
}: {
  row: Suggestion | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onKeep: (row: Suggestion, reason: string) => void;
}) => {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  return (
    <FormDialog
      description={t("ready.setAsideHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (row) {
          onKeep(row, reason.trim());
        }
      }}
      open={row !== null}
      pending={pending}
      ready={row !== null && reason.trim() !== ""}
      submitLabel={t("ready.setAside")}
      title={t("ready.setAsideTitle", { tag: row?.tagNumber ?? "" })}
    >
      <FormField id="keep-longer-why" label={t("ready.setAsideWhy")}>
        <Input
          autoComplete="off"
          id="keep-longer-why"
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};
