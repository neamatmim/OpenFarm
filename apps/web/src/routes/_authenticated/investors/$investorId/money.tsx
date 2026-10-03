import { createFileRoute } from "@tanstack/react-router";

/** An Investor's page's money tab, at its own address. The page draws it with every other tab (`investors/$investorId/route.tsx`). */
export const Route = createFileRoute(
  "/_authenticated/investors/$investorId/money"
)({});
