import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** A whole number of head, at least one — or nothing typed, which clears it. */
const WHOLE_HEAD = /^\d+$/u;

/**
 * How many head a Pen holds, as the Owner or the Manager reckons it from its space and trough. Emptied, it is
 * unknown again. A pen over it is shown on the sheds page and in a move, never shut.
 */
export const CapacityDialog = ({
  pen,
  onOpenChange,
}: {
  pen: { id: string; name: string; capacity: number | null } | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [typed, setTyped] = useState(
    pen?.capacity === null || pen === null ? "" : String(pen.capacity)
  );
  const set = useMutation(
    orpc.sheds.pens.setCapacity.mutationOptions({
      onSuccess: () => {
        toast.success(t("work.saved"));
        onOpenChange(false);
      },
      onError,
    })
  );
  const trimmed = typed.trim();
  const capacity = WHOLE_HEAD.test(trimmed) ? Number(trimmed) : null;
  const sayable = trimmed === "" || (capacity !== null && capacity > 0);
  return (
    <FormDialog
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (pen !== null) {
          set.mutate({ penId: pen.id, capacity });
        }
      }}
      open={pen !== null}
      pending={set.isPending}
      ready={sayable}
      submitLabel={t("common.save")}
      title={t("herd.capacityTitle", { pen: pen?.name ?? "" })}
    >
      <FormField
        hint={t("herd.capacityHint")}
        id="pen-capacity"
        label={t("herd.capacityLabel")}
      >
        <Input
          id="pen-capacity"
          inputMode="numeric"
          min={1}
          onChange={(event) => setTyped(event.target.value)}
          type="number"
          value={typed}
        />
      </FormField>
    </FormDialog>
  );
};
