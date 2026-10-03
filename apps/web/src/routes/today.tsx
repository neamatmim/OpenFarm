import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Where the work list was before it was named for its own work, `/work` beside `/work/$instanceId`. Kept because an
 * app put on a phone's home screen opens here, and a notice already on a phone may still point here.
 */
export const Route = createFileRoute("/today")({
  // 308, moved for good: a 307 would tell a browser to keep asking here.
  beforeLoad: () => {
    throw redirect({ statusCode: 308, to: "/work" });
  },
});
