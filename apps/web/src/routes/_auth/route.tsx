import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";

const AuthLayout = () => <Outlet />;

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async ({ context, location }) => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    const me = await context.queryClient.ensureQueryData(
      context.orpc.people.me.queryOptions()
    );
    if (!me.farm && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    return { session, me };
  },
});
