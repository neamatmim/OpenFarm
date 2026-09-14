import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/** Only those who run the farm reach the admin screens; everyone else goes home. The audit log is the exception:
 *  everybody may read what was done, and the procedure behind it lets them. */
export const Route = createFileRoute("/_auth/admin")({
  beforeLoad: ({ context, location }) => {
    const { roles } = context.me;
    const everybodys = location.pathname === "/admin/audit";
    if (!(everybodys || roles.includes("owner") || roles.includes("manager"))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
