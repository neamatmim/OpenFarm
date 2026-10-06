import { Input } from "@OpenFarm/ui/components/input";
import { useState } from "react";

import { sameList } from "@/lib/sop-draft";

/**
 * A comma-separated list box — times, choices, reasons to skip — kept as it is typed. Rebuilt from the list on every
 * key, it swallowed a comma typed after the last item before the next could be written; kept as typed, it takes the
 * list from outside again only when the list there has changed (a Step moved, a procedure reloaded).
 */
export const ListInput = ({
  id,
  shown,
  onTyped,
  placeholder,
}: {
  id: string;
  /** The list as the procedure holds it, joined. */
  shown: string;
  /** What was typed, whole, for the caller to read its list from. */
  onTyped: (typed: string) => void;
  placeholder?: string;
}) => {
  const [typed, setTyped] = useState(shown);
  const [lastShown, setLastShown] = useState(shown);
  // Taken again while rendering, when the list from outside has moved on — not from an effect after it.
  if (shown !== lastShown) {
    setLastShown(shown);
    if (!sameList(typed, shown)) {
      setTyped(shown);
    }
  }
  return (
    <Input
      id={id}
      onChange={(event) => {
        setTyped(event.target.value);
        onTyped(event.target.value);
      }}
      placeholder={placeholder}
      value={typed}
    />
  );
};
