import { createContext } from "@OpenFarm/api/context";
import type { Context } from "@OpenFarm/api/context";
import { appRouter } from "@OpenFarm/api/routers/index";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { createFileRoute } from "@tanstack/react-router";
import type { RequestLogger } from "evlog";

import { whyRefused } from "@/lib/rpc-door";

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

/** The farm's own public address, besides whatever address this request was sent to. */
const trustedOrigins = process.env.BETTER_AUTH_URL
  ? [process.env.BETTER_AUTH_URL]
  : [];

/** Answers a request; one the browser gave up on — a page moving on before its reply came — is not an error. */
const handle = async ({ request }: { request: Request }) => {
  const refused = whyRefused(request, trustedOrigins);
  if (refused === "another-site") {
    return new Response("Forbidden", { status: 403 });
  }
  if (refused === "not-by-link") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "POST" },
    });
  }
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

/**
 * Puts who is asking on this request's log line — by id, never by name or email — from the context already built,
 * so the session is not looked up a second time to say it. evlog's Nitro module keeps the line on the request.
 */
const nameTheCaller = (request: Request, context: Context) => {
  const { log } =
    (request as Request & { context?: { log?: RequestLogger } }).context ?? {};
  log?.set({
    actor: context.actor?.id ?? null,
    role: context.roleUsed ?? null,
    shedPhone: context.device?.id ?? null,
  });
};

const answer = async (request: Request) => {
  const context = await createContext({ req: request });
  nameTheCaller(request, context);
  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context,
  });
  if (rpcResult.response) {
    return rpcResult.response;
  }

  // The reference lists every procedure the farm has. It is for whoever is building the app, so a running farm
  // does not hand it to anybody who asks.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
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
