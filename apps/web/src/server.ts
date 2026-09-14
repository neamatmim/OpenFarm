import { productionWiring } from "@OpenFarm/api/context";
import { runTheSchedule, startTheSchedule } from "@OpenFarm/api/scheduler";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// The farm's clock runs on the server from the moment it starts: the day's work raised, late work and ending
// withdrawals told about, the digest carried — whether or not anybody has the app open.
startTheSchedule(() => runTheSchedule(productionWiring()));

export default createServerEntry({
  fetch: (request) => handler.fetch(request),
});
