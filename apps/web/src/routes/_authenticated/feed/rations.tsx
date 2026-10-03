import { createFileRoute } from "@tanstack/react-router";

/** The Feed page's rations tab, at its own address. The page draws it with every other tab (`feed/route.tsx`). */
export const Route = createFileRoute("/_authenticated/feed/rations")({});
