import { Input } from "@OpenFarm/ui/components/input";
import { useId, useState } from "react";

import { FormDialog, FormField } from "@/components/page-kit";

/**
 * A name for a Shed or a Pen: a new one, or a new name for one the farm already has. A rename waits until the name is
 * different; the old one stays in the audit trail and the animals in it do not move.
 */
export const NameDialog = ({
  open,
  onOpenChange,
  title,
  description,
  label,
  current = "",
  submitLabel,
  pending,
  handleSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  /** The name it has now, for a rename; nothing for a new Shed or Pen. */
  current?: string;
  submitLabel: string;
  pending: boolean;
  handleSubmit: (name: string) => void;
}) => {
  const id = useId();
  const [name, setName] = useState(current);
  const typed = name.trim();
  return (
    <FormDialog
      description={description}
      onOpenChange={onOpenChange}
      onSubmit={() => handleSubmit(typed)}
      open={open}
      pending={pending}
      ready={typed !== "" && typed !== current}
      submitLabel={submitLabel}
      title={title}
    >
      <FormField id={id} label={label}>
        <Input
          autoComplete="off"
          id={id}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
    </FormDialog>
  );
};
