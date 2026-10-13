import { useEffect, useState } from "react";

const A_MINUTE = 60_000;

/** The time now, read again every minute: a list that sorts work by when it is wanted moves the feeding from later
 *  into now as its hour comes round, with nobody touching the screen. */
export const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), A_MINUTE);
    return () => clearInterval(tick);
  }, []);
  return now;
};
