import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/** Only those who run the farm reach the admin screens; everyone else goes home. */
export const Route = createFileRoute("/_auth/admin")({
  beforeLoad: ({ context }) => {
    const { roles } = context.me;
    if (!(roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
