import { createFileRoute } from "@tanstack/react-router";

/** Sops page's proposals tab, at its own address. The page draws it with every other tab (`sops/route.tsx`). */
export const Route = createFileRoute("/_authenticated/sops/proposals")({});
