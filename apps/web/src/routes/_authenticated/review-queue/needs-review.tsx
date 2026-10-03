import { createFileRoute } from "@tanstack/react-router";

/** Review queue page's needs review tab, at its own address. The page draws it with every other tab (`review-queue/route.tsx`). */
export const Route = createFileRoute(
  "/_authenticated/review-queue/needs-review"
)({});
