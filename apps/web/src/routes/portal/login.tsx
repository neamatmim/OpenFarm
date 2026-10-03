import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Where an Investor signed in before the page was named for what it says. Kept, and moved for good (308), because an Investor may have kept it, and a runbook named it.
 */
export const Route = createFileRoute("/portal/login")({
  beforeLoad: ({ search }) => {
    throw redirect({ search, statusCode: 308, to: "/portal/sign-in" });
  },
});
