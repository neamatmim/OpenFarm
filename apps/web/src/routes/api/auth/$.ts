import { authFor } from "@OpenFarm/auth";
import { hostOf } from "@OpenFarm/auth/hosts";
import { createFileRoute } from "@tanstack/react-router";

/** Answered by the sign-in of the address the request was sent to: each of the farm's two trusts only itself. */
const answeredAtItsAddress = ({ request }: { request: Request }) =>
  authFor(hostOf(request.url)).handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: answeredAtItsAddress,
      POST: answeredAtItsAddress,
    },
  },
});
