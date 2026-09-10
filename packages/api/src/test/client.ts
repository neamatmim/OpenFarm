import { FakeClock, createTestPrincipal } from "@OpenFarm/test-harness";
import type { Role } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import type {
  InferRouterInitialContext,
  Router,
  RouterClient,
} from "@orpc/server";

import type { Context } from "../context";

interface Options {
  /** Which Role calls the API; `null` for an unauthenticated caller. */
  as: Role | null;
  clock?: FakeClock;
}

/** An in-process client for the router, calling as a given Role with a controllable clock.
 *  This is the primary test seam: no HTTP, no UI, real scratch database. */
export const createTestClient = async <T extends Router<Context>>(
  router: T,
  { as, clock = new FakeClock() }: Options
): Promise<{ client: RouterClient<T>; clock: FakeClock }> => {
  const session =
    as === null ? null : await createTestPrincipal(as, clock.now());
  const context: Context = {
    auth: null,
    session:
      session === null
        ? null
        : { user: session.user, session: session.session },
    clock,
  };
  // `T extends Router<Context>` guarantees the router's initial context is `Context`;
  // TypeScript cannot reduce the inferred type for an unresolved `T`, hence the cast.
  const options = { context: context as InferRouterInitialContext<T> };
  return { client: createRouterClient(router, options), clock };
};
