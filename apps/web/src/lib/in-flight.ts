import { useCallback, useState } from "react";

/**
 * Which rows are waiting for the farm's answer. A mutation remembers only the last thing it was asked, so a Manager
 * who approves one row and then another would see the first row's buttons come back while it is still saving; this
 * keeps every row that has been asked until its own answer arrives.
 */
export const useInFlight = () => {
  const [keys, setKeys] = useState(() => new Set<string>());
  const start = useCallback(
    (key: string) => setKeys((current) => new Set(current).add(key)),
    []
  );
  const end = useCallback(
    (key: string) =>
      setKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      }),
    []
  );
  return { has: (key: string) => keys.has(key), start, end };
};
