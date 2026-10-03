import { createFileRoute } from "@tanstack/react-router";

/** Milk page's giving less tab, at its own address. The page draws it with every other tab (`milk/route.tsx`). */
export const Route = createFileRoute("/_authenticated/milk/giving-less")({});
