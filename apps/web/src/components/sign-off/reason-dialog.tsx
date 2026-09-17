import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useId, useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";

/**
 * A judgement written down before it is made: why work goes back, why it was never done, what was decided about an
 * entry. The act waits until something has been written, and the dialog closes only when the farm has taken it.
 */
export const ReasonDialog = ({
  open,
  onOpenChange,
  title,
  description,
  label,
  submitLabel,
  pending,
  handleSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The question the reason answers, as the label over the box. */
  label: string;
  submitLabel: string;
  pending: boolean;
  handleSubmit: (reason: string) => void;
}) => {
  const id = useId();
  const [reason, setReason] = useState("");
  const said = reason.trim();
  return (
    <FormDialog
      description={description}
      onOpenChange={onOpenChange}
      onSubmit={() => handleSubmit(said)}
      open={open}
      pending={pending}
      ready={said !== ""}
      submitLabel={submitLabel}
      title={title}
    >
      <FormField id={id} label={label}>
        <Textarea
          id={id}
          onChange={(event) => setReason(event.target.value)}
          required
          rows={3}
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};
