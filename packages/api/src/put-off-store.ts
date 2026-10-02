import { and, eq, like } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type { SopContent } from "@OpenFarm/domain";
import type { SQL } from "drizzle-orm";

import type { Trail, Tx } from "./audit";
import { raiseDueInstances } from "./instances-store";
import { contentOf } from "./sop-content";
import { putOffCauseOf, putOffOf } from "./work-cause";
import { callOffWork } from "./work-transitions";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a procedure lets a bull out of Quarantine: one of its Steps has the release's effect. */
const releases = (content: SopContent): boolean =>
  content.steps.some((step) => step.effect?.kind === "release");

/**
 * His Release put off — its step skipped, or the work closed Missed — while he is still in Quarantine: raised again for
 * him in his Pen, the farm's put-off days later, under the same Version. Again and again until he is out; a replay of
 * the same skip raises nothing more, as its cause is the same. Nothing for any other work.
 */
export const raiseThePutOffRelease = async (
  tx: Tx,
  farmId: string,
  instanceId: string,
  at: Date,
  now: Date
): Promise<void> => {
  const work = await tx.query.sopInstance.findFirst({
    where: { id: instanceId, farmId },
    columns: {
      definitionId: true,
      versionId: true,
      animalId: true,
      cause: true,
    },
    with: { version: { columns: { content: true } } },
  });
  if (!(work?.animalId && work.cause && work.version)) {
    return;
  }
  const content = contentOf(work.version);
  if (!releases(content)) {
    return;
  }
  const him = await tx.query.animal.findFirst({
    where: { id: work.animalId, farmId },
    columns: { state: true, penId: true },
  });
  if (him?.state !== "quarantine") {
    return;
  }
  const farm = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: { putOffDays: true },
  });
  const before = putOffOf(work.cause);
  await raiseDueInstances(
    tx,
    farmId,
    [
      {
        definitionId: work.definitionId,
        versionId: work.versionId,
        penId: him.penId,
        animalId: work.animalId,
        dueAt: new Date(at.getTime() + (farm?.putOffDays ?? 7) * DAY_MS),
        cause: putOffCauseOf(
          before?.original ?? work.cause,
          (before?.n ?? 0) + 1
        ),
        graceMinutes: content.graceMinutes,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
      },
    ],
    now
  );
};

/**
 * His Releases raised again and still open, called off: he is out of Quarantine, by the Release or by hand, and owes no
 * more of them. Found by their cause — the state he entered Quarantine by, put off.
 */
export const callOffPutOffReleases = (
  tx: Tx,
  farmId: string,
  animalId: string,
  trail: Trail
) =>
  callOffWork(
    tx,
    farmId,
    and(
      eq(sopInstance.animalId, animalId),
      like(sopInstance.cause, `state:${animalId}:quarantine:%:again:%`)
    ) as SQL,
    { trail, by: "released" }
  );
