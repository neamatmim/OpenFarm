import { createContext } from "@OpenFarm/api/context";
import { appRouter } from "@OpenFarm/api/routers/index";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { createFileRoute } from "@tanstack/react-router";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const openAPIGenerator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const specPromise = openAPIGenerator.generate(appRouter, {
  base: {
    info: {
      title: "OpenFarm API",
      version: "1.0.0",
    },
  },
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferenceHandlerPlugin({
      spec: () => specPromise,
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

/** Answers a request; one the browser gave up on — a page moving on before its reply came — is not an error. */
const handle = async ({ request }: { request: Request }) => {
  try {
    return await answer(request);
  } catch (error) {
    if (request.signal.aborted) {
      // Nobody is waiting for this reply. 499 is what servers say for a client that closed the request.
      return new Response(null, { status: 499 });
    }
    throw error;
  }
};

const answer = async (request: Request) => {
  const context = await createContext({ req: request });
  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context,
  });
  if (rpcResult.response) {
    return rpcResult.response;
  }

  const apiResult = await apiHandler.handle(request, {
    prefix: "/api/rpc/api-reference",
    context,
  });
  if (apiResult.response) {
    return apiResult.response;
  }

  return new Response("Not found", { status: 404 });
};

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
