import type { ReactNode } from "react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/page-kit";

/**
 * Asking before an entry is taken off one of the farm's lists: a stray tap in a row's menu is not the end of it. The
 * list says what retiring means for it; the dialog names the entry, and the act is the list's own.
 */
export const useRetireConfirm = ({
  retire,
  pending,
  title,
  description,
  confirmLabel,
}: {
  retire: (id: string) => void;
  pending: boolean;
  title: (name: string) => ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
}) => {
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(
    null
  );
  const dialog = (
    <ConfirmDialog
      confirmLabel={confirmLabel}
      description={description}
      onConfirm={() => {
        if (asking) {
          retire(asking.id);
          setAsking(null);
        }
      }}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(null);
        }
      }}
      open={asking !== null}
      pending={pending}
      title={title(asking?.name ?? "")}
    />
  );
  return {
    ask: (id: string, name: string) => setAsking({ id, name }),
    dialog,
  };
};
