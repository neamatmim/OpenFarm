import { auth } from "@OpenFarm/auth";

import { systemClock } from "./clock";
import type { Clock } from "./clock";

type Session = typeof auth.$Infer.Session;

export interface Context {
  auth: null;
  session: Session | null;
  clock: Clock;
}

export const createContext = async ({
  req,
  clock = systemClock,
}: {
  req: Request;
  clock?: Clock;
}): Promise<Context> => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    auth: null,
    session,
    clock,
  };
};
