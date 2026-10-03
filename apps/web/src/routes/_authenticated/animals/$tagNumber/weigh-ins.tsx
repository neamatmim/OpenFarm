import { createFileRoute } from "@tanstack/react-router";

/** An Animal's page's weigh ins tab, at its own address. The page draws it with every other tab (`animals/$tagNumber/route.tsx`). */
export const Route = createFileRoute(
  "/_authenticated/animals/$tagNumber/weigh-ins"
)({});
