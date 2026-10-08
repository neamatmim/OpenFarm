import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import type { TemplateContent, TemplateKind } from "@OpenFarm/domain";
import {
  asTheFarmHeldItBefore,
  scratchDb,
  theFarm,
} from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";

/** The Owner's client, as far as opening the wording page goes. */
interface WordingReader {
  templates: { list: () => Promise<unknown> };
}

/** Puts the farm back on an earlier standard wording of one kind, published by nobody, as a farm given it then holds
 *  it; then opens the wording page, which catches it up. The wording in force afterwards. */
export const caughtUpFrom = async (
  owner: WordingReader,
  kind: TemplateKind,
  content: TemplateContent
) => {
  await owner.templates.list();
  const db = scratchDb();
  const template = await db.query.paperTemplate.findFirst({
    where: { farmId: theFarm().id, kind },
  });
  if (!template?.currentVersionId) {
    throw new Error("expected the farm's wording");
  }
  const { currentVersionId } = template;
  await asTheFarmHeldItBefore((tx) =>
    tx
      .update(paperTemplateVersion)
      .set({ content })
      .where(eq(paperTemplateVersion.id, currentVersionId))
  );
  await owner.templates.list();
  const caughtUp = await db.query.paperTemplate.findFirst({
    where: { id: template.id },
    with: { currentVersion: true },
  });
  return { before: currentVersionId, caughtUp };
};
