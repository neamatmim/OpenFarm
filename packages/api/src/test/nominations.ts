import { uuidv7 } from "@OpenFarm/db/ids";
import { nomination, nominee } from "@OpenFarm/db/schema/venture";
import type { Nominee } from "@OpenFarm/domain";
import { scratchDb, theFarm } from "@OpenFarm/test-harness";

import type { NominationHow } from "../nomination-store";

/** One Nominee collecting the whole, with nothing else known of them: the shape the old single nominee carries over as. */
export const theWhole = (name: string, relation = "স্ত্রী"): Nominee => ({
  name,
  relation,
  phone: null,
  bornOn: null,
  sharePercent: 100,
  receiver: null,
});

/**
 * A Nomination put on file straight into the test farm's tables, as the migration and the seed carry one over — for a
 * test that needs an Investor's Nominees before any paper can record them. Carried over unless said otherwise.
 */
export const nominationOnFile = async ({
  investorId,
  nominees,
  signedOn,
  recordedAt,
  how = "carried_over",
  db = scratchDb(),
}: {
  investorId: string;
  nominees: readonly Nominee[];
  signedOn: string;
  recordedAt: Date;
  how?: NominationHow;
  db?: ReturnType<typeof scratchDb>;
}) => {
  const id = uuidv7(recordedAt);
  await db.insert(nomination).values({
    id,
    farmId: theFarm().id,
    investorId,
    signedOn,
    how,
    recordedAt,
  });
  if (nominees.length > 0) {
    await db.insert(nominee).values(
      nominees.map((one, index) => ({
        nominationId: id,
        place: index + 1,
        name: one.name,
        relation: one.relation,
        phone: one.phone,
        bornOn: one.bornOn,
        sharePercent: one.sharePercent,
        receiverName: one.receiver?.name ?? null,
        receiverRelation: one.receiver?.relation ?? null,
        receiverPhone: one.receiver?.phone ?? null,
      }))
    );
  }
  return id;
};
