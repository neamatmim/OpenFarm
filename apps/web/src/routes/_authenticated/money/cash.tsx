import { createFileRoute } from "@tanstack/react-router";

/** Money page's cash tab, at its own address. The page draws it with every other tab (`money/route.tsx`). */
export const Route = createFileRoute("/_authenticated/money/cash")({});
