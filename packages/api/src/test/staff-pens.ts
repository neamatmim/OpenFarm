import { penAssignment } from "@OpenFarm/db/schema/herd";
import {
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";

/**
 * This file's Barn Staff member keeps these Pens. A Shed Phone holds Barn Staff alone, so work a test does on one is
 * done by a Staff member, and Barn Staff record only in the Pens they keep.
 */
export const staffKeep = async (...penIds: string[]) => {
  // The Staff member this file's farm has, made if no test before this one made them.
  await createTestPrincipal("staff", new Date());
  for (const penId of penIds) {
    // oxlint-disable-next-line no-await-in-loop -- one Pen after another
    await scratchDb()
      .insert(penAssignment)
      .values({
        id: `pa-staff-${penId}`,
        farmId: theFarm().id,
        userId: thePerson("staff").id,
        penId,
      })
      .onConflictDoNothing();
  }
};
