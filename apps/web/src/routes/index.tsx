import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

/**
 * The farm's own address, bare. Nobody but the farm's own people comes here, so there is nothing to show them: somebody
 * signed in goes to the page their Role starts on, and everybody else to the sign-in, where a Shed Phone is set up too.
 * A phone that cannot ask is sent to the sign-in, which keeps the form rather than guessing.
 */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof getUser>> = null;
    try {
      session = await getUser();
    } catch {
      throw redirect({ to: "/login" });
    }
    throw redirect({ to: session ? "/dashboard" : "/login" });
  },
});
