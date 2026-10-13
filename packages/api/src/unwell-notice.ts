import { URGENT_ROUND_WORDS } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { alertParams } from "./instances-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import { unwellThatRaised } from "./work-cause";

/**
 * Tells whoever is on it of the work an urgent sighting has just raised — bloat, labored breathing, a cow down or an
 * afterbirth held — the moment the day raises it, not an hour on when it goes late: those kill within hours, and an
 * hour's grace spent not knowing is the hour. Work about anything else the round saw is told nothing here; it has a day.
 * About the work, so told once however often the day turns. What was raised, for the caller to push once the write has
 * closed.
 */
export const tellOfUrgentUnwell = async (
  tx: Tx,
  farmId: string,
  raised: readonly { id: string; cause: string | null }[],
  now: Date
): Promise<Raised[]> => {
  const workBySighting = new Map(
    raised.flatMap((one) => {
      const sighting = unwellThatRaised(one.cause);
      return sighting ? [[sighting, one.id] as const] : [];
    })
  );
  if (workBySighting.size === 0) {
    return [];
  }
  const urgent = await tx.query.observation.findMany({
    where: {
      farmId,
      id: { in: [...workBySighting.keys()] },
      saw: { in: [...URGENT_ROUND_WORDS] },
    },
    columns: { id: true, saw: true, sawLabel: true },
    with: { animal: { columns: { tagNumber: true } } },
  });
  const told: Raised[] = [];
  const remembering = rememberingPeople();
  for (const sighting of urgent) {
    // oxlint-disable-next-line no-await-in-loop -- one piece of work at a time, each told once by the unique index
    const work = await tx.query.sopInstance.findFirst({
      where: { id: workBySighting.get(sighting.id) ?? "", farmId },
      columns: {
        id: true,
        penId: true,
        assignedRole: true,
        assignedTo: true,
        claimedBy: true,
        dueAt: true,
      },
      with: {
        version: { columns: { content: true } },
        pen: {
          columns: { name: true },
          with: { shed: { columns: { name: true } } },
        },
      },
    });
    if (!work) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "unwell_urgent",
        about: { id: work.id, work },
        facts: {
          ...alertParams(work),
          tag: sighting.animal.tagNumber,
          saw: sighting.saw,
          sawBn: sighting.sawLabel,
        },
      },
      now,
      remembering
    );
    told.push(...rows);
  }
  return told;
};
