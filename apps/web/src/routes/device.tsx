import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Where a Shed Phone was set up before the page was named for it. Kept, and moved for good (308), because a Shed Phone sits on this page all day, and may have it on its home screen.
 */
export const Route = createFileRoute("/device")({
  beforeLoad: ({ search }) => {
    throw redirect({ search, statusCode: 308, to: "/shed-phone" });
  },
});
