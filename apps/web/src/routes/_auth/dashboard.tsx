import { createFileRoute, redirect } from "@tanstack/react-router";

import { LANDING, primaryRole } from "@/components/shell/navigation";

/**
 * Where signing in, and every screen a person may not open, sends them: not a page of its own but the one their
 * Role starts the day on — the Owner's overview, the Manager's day, the vet's list, a milker's jobs.
 */
export const Route = createFileRoute("/_auth/dashboard")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: LANDING[primaryRole(context.me.roles)] });
  },
});
