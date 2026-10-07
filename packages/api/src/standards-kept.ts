import { and, eq, isNull } from "@OpenFarm/db/operators";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { nameAsCompared, standardPlaybook } from "@OpenFarm/domain";

import { audited } from "./audit";
import { contentOf, publishedContent } from "./sop-content";
import type { Turning } from "./the-day-turns";
import { lockTheFarm } from "./venture-store";

/** A procedure's Steps by the names it gives them, in order. */
const stepsOf = (content: SopContent) =>
  content.steps.map((step) => step.id).join("\u0000");

/** The standard a procedure was adopted from, read off what it says: called what the standard is called, in either
 *  language, and first published with the standard's own Steps — the names the standard gives them, which a Step
 *  written in the editor never has. Nothing for a procedure the farm wrote itself under a standard's name. */
const standardOf = (
  current: SopContent,
  first: SopContent,
  standards: readonly [string, SopContent][]
): string | null => {
  const called = new Set(
    [current.name.bn, current.name.en]
      .filter((said): said is string => Boolean(said))
      .map(nameAsCompared)
  );
  const found = standards.find(
    ([, standard]) =>
      [standard.name.bn, standard.name.en].some(
        (said) => said !== undefined && called.has(nameAsCompared(said))
      ) && stepsOf(standard) === stepsOf(first)
  );
  return found?.[0] ?? null;
};

/**
 * Writes down which standard procedure each procedure in force was adopted from, where the farm adopted it before it
 * kept which: known then only by what it says. Done while its name still says so — renamed later, a standard adopted
 * before kept no mark, was offered again, and could be adopted a second time to raise the same work twice. One
 * standard to one procedure, the first adopted keeping it; marked behind the farm lock, each only while it is still
 * unmarked, so two turns at once mark it once. Reads only the procedures still unmarked. Returns how many it marked.
 */
export const keepStandardKeys = async (context: Turning): Promise<number> => {
  const farmId = context.farm.id;
  const unmarked = await context.db.query.sopDefinition.findMany({
    where: {
      farmId,
      retiredAt: { isNull: true },
      standardKey: { isNull: true },
    },
    columns: { id: true },
    with: {
      currentVersion: { columns: { content: true } },
      versions: {
        columns: { content: true },
        orderBy: { number: "asc" },
        limit: 1,
      },
    },
    orderBy: { createdAt: "asc", id: "asc" },
  });
  const standards = Object.entries(standardPlaybook());
  const marks = unmarked.flatMap((one) => {
    const current = publishedContent(one);
    const [firstVersion] = one.versions;
    const key =
      current && firstVersion
        ? standardOf(current, contentOf(firstVersion), standards)
        : null;
    return key ? [{ id: one.id, key }] : [];
  });
  if (marks.length === 0) {
    return 0;
  }
  const trail = audited(context).recordEvent;
  return await context.db.transaction(async (tx) => {
    await lockTheFarm(tx, farmId);
    const adopted = await tx.query.sopDefinition.findMany({
      where: {
        farmId,
        retiredAt: { isNull: true },
        standardKey: { isNotNull: true },
      },
      columns: { standardKey: true },
    });
    const taken = new Set(adopted.map((one) => one.standardKey));
    let marked = 0;
    for (const { id, key } of marks) {
      if (taken.has(key)) {
        continue;
      }
      // One at a time, each on the trail as the procedure it marks: a few dozen at most, once.
      // oxlint-disable-next-line no-await-in-loop
      const [row] = await tx
        .update(sopDefinition)
        .set({ standardKey: key })
        .where(and(eq(sopDefinition.id, id), isNull(sopDefinition.standardKey)))
        .returning({ id: sopDefinition.id });
      if (!row) {
        continue;
      }
      taken.add(key);
      marked += 1;
      // oxlint-disable-next-line no-await-in-loop
      await trail(
        tx,
        { entity: "sop", entityId: id, action: "update" },
        { before: { standardKey: null }, after: { standardKey: key } }
      );
    }
    return marked;
  });
};
