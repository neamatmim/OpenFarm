import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  DATABASE_IS_BEHIND,
  databaseIsBehind,
} from "@OpenFarm/api/readiness";
import type { env } from "@OpenFarm/env/server";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, runnerImport } from "vite-plus";
import type { Plugin } from "vite-plus";

/**
 * The development server refuses a database behind the code before it listens, as the built server does as it
 * starts. Left to Nitro's plugin, the refusal happened in a worker Nitro kept restarting, behind a server that went on
 * answering 500 — which is how a sign-in that failed for want of a table looked like a broken sign-in.
 *
 * Loaded through Vite rather than imported: the workspace packages are TypeScript this config cannot read directly.
 */
const refuseAnOldDatabase = (): Plugin => ({
  name: "openfarm:refuse-an-old-database",
  apply: "serve",
  configureServer: async (server) => {
    // Its own runner, not the server's: Nitro owns the server's SSR environment and it is not runnable from here.
    const through = { configFile: false as const, root: server.config.root };
    const [{ module: config }, { module: readiness }] = await Promise.all([
      runnerImport<{ env: typeof env }>("@OpenFarm/env/server", through),
      runnerImport<{
        DATABASE_IS_BEHIND: typeof DATABASE_IS_BEHIND;
        databaseIsBehind: typeof databaseIsBehind;
      }>("@OpenFarm/api/readiness", through),
    ]);
    if (await readiness.databaseIsBehind(config.env.DATABASE_URL)) {
      throw new Error(readiness.DATABASE_IS_BEHIND);
    }
  },
});

/**
 * A request the browser gave up on is not an error, in development as the RPC route already says it is not. Nitro's
 * dev middleware hands on whatever reading the request threw, and a browser that closes a request mid-body — a page
 * refreshing its list once the day is raised, cancelling the answer it no longer wants — makes Node throw `aborted`.
 * Vite then paints that over every open page as though the page had broken. Registered after Vite's own middleware
 * and before its error handler, so any other error still reaches it.
 */
const aGivenUpRequestIsNotAnError = (): Plugin => ({
  name: "openfarm:a-given-up-request-is-not-an-error",
  apply: "serve",
  configureServer: (server) => () => {
    server.middlewares.use(
      (
        thrown: NodeJS.ErrnoException,
        request: IncomingMessage,
        response: ServerResponse,
        passOn: (thrown?: unknown) => void
      ) => {
        // Connect knows an error handler by its four parameters, not their names.
        const givenUp = thrown.code === "ECONNRESET" && request.destroyed;
        if (!givenUp) {
          passOn(thrown);
          return;
        }
        response.destroy();
      }
    );
  },
});

export default defineConfig(({ command }) => ({
  // The deploy artifact has no workspace node_modules tree. Development still
  // externalizes Node-oriented CommonJS packages such as `pg`, which Vite's
  // module runner cannot safely inline.
  ssr: command === "build" ? { noExternal: true } : undefined,
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    refuseAnOldDatabase(),
    aGivenUpRequestIsNotAnError(),
    tailwindcss(),
    tanstackStart(),
    // Nitro defaults to node-server for Docker/systemd and detects Vercel's
    // Build Output API when Vercel runs the build.
    nitro(),
    viteReact(),
  ],
}));
