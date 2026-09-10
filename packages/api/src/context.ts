import { auth } from "@OpenFarm/auth";

import type { Clock } from "./clock";
import { systemClock } from "./clock";

export type Session = typeof auth.$Infer.Session;

export interface Context {
  auth: null;
  session: Session | null;
  clock: Clock;
}

/** The one place a Context is assembled — production and tests both go through it. */
export const buildContext = ({
  session,
  clock,
}: {
  session: Session | null;
  clock: Clock;
}): Context => ({ auth: null, session, clock });

export const createContext = async ({
  req,
  clock = systemClock,
}: {
  req: Request;
  clock?: Clock;
}): Promise<Context> =>
  buildContext({
    session: await auth.api.getSession({ headers: req.headers }),
    clock,
  });
