import { productionDatabase } from "@OpenFarm/api/context";
import { createFileRoute } from "@tanstack/react-router";

const ready = async (): Promise<Response> => {
  try {
    // This deliberately reads an application table rather than only SELECT 1:
    // a reachable database with unapplied migrations is not ready to serve.
    await productionDatabase().query.farm.findFirst({
      columns: { id: true },
    });
    return Response.json(
      { status: "ready" },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "retry-after": "5",
        },
      }
    );
  }
};

export const Route = createFileRoute("/api/ready")({
  server: { handlers: { GET: ready } },
});
