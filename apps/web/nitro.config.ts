import { fileURLToPath } from "node:url";

import evlog from "evlog/nitro/v3";
import { defineConfig } from "nitro";

const turnDayTask = fileURLToPath(
  new URL("server/tasks/farm/turn-day.ts", import.meta.url)
);

export default defineConfig({
  // Deploys copy only `.output`; bundle runtime dependencies so that artifact is
  // genuinely self-contained and cannot resolve packages from a build machine.
  noExternals: true,
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
