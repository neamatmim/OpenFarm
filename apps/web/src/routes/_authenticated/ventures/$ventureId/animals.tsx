import { createFileRoute } from "@tanstack/react-router";

/** A Venture's page's animals tab, at its own address. The page draws it with every other tab (`ventures/$ventureId/route.tsx`). */
export const Route = createFileRoute(
  "/_authenticated/ventures/$ventureId/animals"
)({});
