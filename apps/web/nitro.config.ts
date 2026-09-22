import { fileURLToPath } from "node:url";

import evlog from "evlog/nitro/v3";
import { defineConfig } from "nitro";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const turnDayTask = here("server/tasks/farm/turn-day.ts");

export default defineConfig({
  // Deploys copy only `.output`; bundle runtime dependencies so that artifact is
  // genuinely self-contained and cannot resolve packages from a build machine.
  noExternals: true,
  // Named here rather than scanned: Nitro 3 does not read `server/` on its own, and until this line the
  // development log drain was never built, so development wrote no log files.
  plugins: [
    here("server/plugins/env-check.ts"),
    here("server/plugins/exit-when-it-cannot-serve.ts"),
    here("server/plugins/evlog-drain.ts"),
  ],
  experimental: {
    asyncContext: true,
    tasks: true,
  },
  tasks: {
    "farm:turn-day": {
      handler: turnDayTask,
      description: "Raise due work and deliver the farm's scheduled notices",
    },
  },
  // Node deployments run this task in-process. The Vercel preset emits the
  // equivalent protected Vercel Cron configuration into its build output.
  scheduledTasks: {
    "*/5 * * * *": ["farm:turn-day"],
  },
  modules: [
    evlog({
      env: { service: "OpenFarm-web" },
    }),
  ],
});
