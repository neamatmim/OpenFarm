import type { Principal } from "@OpenFarm/test-harness";
import {
  FakeClock,
  createTestPrincipal,
  scratchDb,
} from "@OpenFarm/test-harness";
import type {
  InferRouterInitialContext,
  Router,
  RouterClient,
} from "@orpc/server";
import { createRouterClient } from "@orpc/server";

import type { Context } from "../context";
import { buildContext } from "../context";

interface Options {
  /** Which Role calls the API; `null` for an unauthenticated caller. */
  as: Principal | null;
  clock?: FakeClock;
}

/** An in-process client for the router, calling as a given Role with a controllable clock.
 *  This is the primary test seam: no HTTP, no UI, real scratch database. */
export const createTestClient = async <T extends Router<Context>>(
  router: T,
  { as, clock = new FakeClock() }: Options
): Promise<{ client: RouterClient<T>; clock: FakeClock }> => {
  const principal =
    as === null ? null : await createTestPrincipal(as, clock.now());
  const context = await buildContext({
    session:
      principal === null
        ? null
        : { user: principal.user, session: principal.session },
    clock,
    db: scratchDb(),
  });
  // `T extends Router<Context>` guarantees the router's initial context is `Context`;
  // TypeScript cannot reduce the inferred type for an unresolved `T`, hence the cast.
  const options = { context: context as InferRouterInitialContext<T> };
  return { client: createRouterClient(router, options), clock };
};
