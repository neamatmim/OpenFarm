import { eq } from "@OpenFarm/db/operators";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { nameAsCompared, standardPlaybook } from "@OpenFarm/domain";

import { audited } from "./audit";
import type { Turning } from "./the-day-turns";

/**
 * Writes down which standard procedure each procedure in force was adopted from, where the farm adopted it before it
 * kept which: known then only by its name, in either language. Done while the name still says so — renamed later, a
 * standard adopted before kept no mark, was offered again, and could be adopted a second time to raise the same work
 * twice. One standard to one procedure: the first adopted keeps it. Nothing to do once every one is written, so a turn
 * of the day after the first writes nothing. Returns how many it wrote.
 */
export const keepStandardKeys = async (context: Turning): Promise<number> => {
  const farmId = context.farm.id;
  const inForce = await context.db.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true, standardKey: true, createdAt: true },
    with: { currentVersion: { columns: { content: true } } },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const taken = new Set(
    inForce.flatMap((one) => (one.standardKey ? [one.standardKey] : []))
  );
  const byName = new Map<string, string>();
  for (const [key, content] of Object.entries(standardPlaybook())) {
    for (const name of [content.name.bn, content.name.en]) {
      if (name) {
        byName.set(nameAsCompared(name), key);
      }
    }
  }
  let kept = 0;
  for (const one of inForce) {
    const name = (one.currentVersion?.content as SopContent | undefined)?.name;
    const key = [name?.bn, name?.en]
      .filter((said): said is string => Boolean(said))
      .map((said) => byName.get(nameAsCompared(said)))
      .find((found) => found !== undefined);
    if (one.standardKey || !key || taken.has(key)) {
      continue;
    }
    taken.add(key);
    kept += 1;
    // One at a time, each on the trail as the procedure it marks: a few dozen at most, once.
    // oxlint-disable-next-line no-await-in-loop
    await audited(context).write(
      {
        entity: "sop",
        entityId: one.id,
        action: "update",
        before: { standardKey: null },
        after: { standardKey: key },
      },
      (tx) =>
        tx
          .update(sopDefinition)
          .set({ standardKey: key })
          .where(eq(sopDefinition.id, one.id))
    );
  }
  return kept;
};
