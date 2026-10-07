import type { NoticePath } from "@OpenFarm/domain";
import { describe, expectTypeOf, it } from "vitest";

import type { FileRoutesByTo } from "../routeTree.gen";

describe("the places a notice leads", () => {
  it("are each a page the app has", () => {
    expectTypeOf<Exclude<NoticePath, keyof FileRoutesByTo>>().toBeNever();
  });
});
