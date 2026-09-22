import { productionDatabase } from "@OpenFarm/api/context";
import { schemaIsCurrent } from "@OpenFarm/api/readiness";
import { createFileRoute } from "@tanstack/react-router";

const unavailable = () =>
  Response.json(
    { status: "unavailable" },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "retry-after": "5",
      },
    }
  );

const ready = async (): Promise<Response> => {
  try {
    // Not only SELECT 1: a reachable database that has not applied the newest migration is not ready to serve.
    if (!(await schemaIsCurrent(productionDatabase()))) {
      return unavailable();
    }
    return Response.json(
      { status: "ready" },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return unavailable();
  }
};

export const Route = createFileRoute("/api/ready")({
  server: { handlers: { GET: ready } },
});
