import { productionWiring } from "@OpenFarm/api/context";
import { runTheSchedule } from "@OpenFarm/api/scheduler";
import { pingTheWatch } from "@OpenFarm/api/the-watch";
import { env } from "@OpenFarm/env/server";
import { defineTask } from "nitro/task";

export default defineTask({
  meta: {
    name: "farm:turn-day",
    description: "Raise due work and deliver the farm's scheduled notices",
  },
  run: async () => {
    if (process.env.OPENFARM_SCHEDULER === "off") {
      return { result: { status: "disabled" } };
    }

    const result = await runTheSchedule(productionWiring());
    if (!result.ok) {
      throw new Error(result.error ?? "The farm schedule failed");
    }
    // A whole turn, told to the watch outside the farm: when these stop, it is the watch that tells the Owner.
    await pingTheWatch(env.OPENFARM_WATCH_URL);

    return { result: { status: "ok" } };
  },
});
