import type { Principal } from "@OpenFarm/test-harness";
import {
  FakeClock,
  createTestDevice,
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
  /** Call as this Role PIN-switched in on a Shed Phone, rather than from their own phone. */
  onShedPhone?: boolean;
}

/** An in-process client for the router, calling as a given Role with a controllable clock —
 *  from their own phone, or PIN-switched in on a Shed Phone. This is the primary test seam:
 *  no HTTP, no UI, real scratch database. */
export const createTestClient = async <T extends Router<Context>>(
  router: T,
  { as, clock = new FakeClock(), onShedPhone = false }: Options
): Promise<{ client: RouterClient<T>; clock: FakeClock; context: Context }> => {
  const principal =
    as === null ? null : await createTestPrincipal(as, clock.now());
  const device =
    as !== null && onShedPhone ? await createTestDevice(as, clock.now()) : null;
  const context = await buildContext({
    session:
      principal === null || device
        ? null
        : { user: principal.user, session: principal.session },
    device,
    clock,
    db: scratchDb(),
  });
  // `T extends Router<Context>` guarantees the router's initial context is `Context`;
  // TypeScript cannot reduce the inferred type for an unresolved `T`, hence the cast.
  const options = { context: context as InferRouterInitialContext<T> };
  return { client: createRouterClient(router, options), clock, context };
};
