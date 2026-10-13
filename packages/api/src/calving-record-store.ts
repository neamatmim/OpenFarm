import type { AnimalState, Side } from "@OpenFarm/domain";
import { MAY_CALVE_FROM, isOpen, mayRaiseByHand } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { raiseDueInstances } from "./instances-store";
import { contentOf } from "./sop-content";
import { calvedCauseOf, calvedPrefixOf } from "./work-cause";

/** The cow a Calving record is opened about, as the farm has her now. */
interface Her {
  id: string;
  sex: string;
  side: Side;
  state: AnimalState;
  penId: string;
  lactationNumber: number;
}

/**
 * The farm's Calving record about her, opened now in her Pen — by the milker who finds her calving at night with no
 * round open, so nobody has to wake the Manager to raise it. About her alone: the board lists only her, and her calving
 * is recorded on it by its Step, as on any round (ADR 0004). Opened twice while one is open it is the
 * same work; one closed on "not calved yet" is followed by another.
 *
 * Refused for an animal that cannot calve, as her calving would be; and while the farm has adopted no procedure whose
 * Step records a Calving, since there is nothing to open.
 */
export const openCalvingRecord = async (
  tx: Tx,
  farmId: string,
  her: Her,
  now: Date
): Promise<{ id: string }> => {
  const mayCalve =
    her.sex === "female" &&
    her.side === "dairy" &&
    (MAY_CALVE_FROM as readonly string[]).includes(her.state);
  if (!mayCalve) {
    throw new ORPCError("BAD_REQUEST", {
      message: "She cannot calve",
      data: { refusal: "calving_of_a_cow_not_in_calf" },
    });
  }
  const live = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    with: { currentVersion: true },
    orderBy: { id: "asc" },
  });
  const record = live.find((one) => {
    if (!one.currentVersion) {
      return false;
    }
    const content = contentOf(one.currentVersion);
    return (
      mayRaiseByHand(content) &&
      content.steps.some(
        (step) => step.repeatPerAnimal && step.effect?.kind === "calving"
      )
    );
  });
  if (!record?.currentVersion) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The farm keeps no Calving record to open",
      data: { refusal: "no_calving_record" },
    });
  }
  const content = contentOf(record.currentVersion);
  const before = await tx.query.sopInstance.findMany({
    where: {
      farmId,
      definitionId: record.id,
      cause: { like: `${calvedPrefixOf(her)}%` },
    },
    columns: { id: true, state: true },
  });
  const open = before.find((one) => isOpen(one.state));
  if (open) {
    return { id: open.id };
  }
  // Closed on "not calved yet", the last one is no use to her calving now: another is opened.
  const cause = calvedCauseOf(her, before.length + 1);
  await raiseDueInstances(
    tx,
    farmId,
    [
      {
        definitionId: record.id,
        versionId: record.currentVersion.id,
        penId: her.penId,
        animalId: her.id,
        dueAt: now,
        cause,
        graceMinutes: content.graceMinutes,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
      },
    ],
    now
  );
  const opened = await tx.query.sopInstance.findFirst({
    where: { farmId, definitionId: record.id, cause },
    columns: { id: true },
  });
  if (!opened) {
    throw new Error("The Calving record just opened is not there");
  }
  return opened;
};
