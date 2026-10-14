import { createFileRoute } from "@tanstack/react-router";

/** The Feed page's tab of feed made on the farm — home mixes and silage — at its own address. The page draws it with
 *  every other tab (`feed/route.tsx`). */
export const Route = createFileRoute("/_authenticated/feed/made")({});
