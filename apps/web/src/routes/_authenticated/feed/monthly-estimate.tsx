import { createFileRoute } from "@tanstack/react-router";

/** The feed page draws this tab and keeps the selected month in its search parameters. */
export const Route = createFileRoute("/_authenticated/feed/monthly-estimate")(
  {}
);
