import { createFileRoute, redirect } from "@tanstack/react-router";

import { LANDING, primaryRole } from "@/components/shell/navigation";

/**
 * The farm's own address, bare: where signing in, and every screen a person may not open, sends them. Not a page of
 * its own but the one their Role starts the day on — the Owner's overview, the Manager's day, the vet's list, a
 * milker's jobs. Somebody not signed in is sent to the sign-in by the layout around it, where a Shed Phone is set up
 * too.
 */
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: LANDING[primaryRole(context.me.roles)] });
  },
});
