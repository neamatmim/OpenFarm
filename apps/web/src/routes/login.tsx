import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Where the farm's sign-in was before it was named for what it says, «Sign in». Kept, and moved for good (308), because people type /login from habit, and a bookmark may hold it.
 */
export const Route = createFileRoute("/login")({
  beforeLoad: ({ search }) => {
    throw redirect({ search, statusCode: 308, to: "/sign-in" });
  },
});
