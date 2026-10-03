import { createFileRoute } from "@tanstack/react-router";

/** Milk page's records tab, at its own address. The page draws it with every other tab (`milk/route.tsx`). */
export const Route = createFileRoute("/_authenticated/milk/records")({});
