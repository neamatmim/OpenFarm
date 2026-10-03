import { createFileRoute } from "@tanstack/react-router";

/** The Feed page's Feed In tab — what came into the store, bought or harvested — at its own address. The page draws
 *  it with every other tab (`feed/route.tsx`). */
export const Route = createFileRoute("/_authenticated/feed/feed-in")({});
