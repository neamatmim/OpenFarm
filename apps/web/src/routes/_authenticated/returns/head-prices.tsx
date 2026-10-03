import { createFileRoute } from "@tanstack/react-router";

/** Returns page's head prices tab, at its own address. The page draws it with every other tab (`returns/route.tsx`). */
export const Route = createFileRoute("/_authenticated/returns/head-prices")({});
