import { productionWiring } from "@OpenFarm/api/context";
import { runTheSchedule } from "@OpenFarm/api/scheduler";
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

    return { result: { status: "ok" } };
  },
});
