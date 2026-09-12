import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { counterparty } from "@OpenFarm/db/schema/fattening";

import type { Tx } from "./audit";

/**
 * The trader, recorded once per Farm — the same person whether the farm is buying from him or
 * selling to him, which is the whole point of one Counterparty and not a seller column here and
 * a buyer column there.
 *
 * Found by name rather than chosen from a list, because that is how the Manager knows him: a
 * farm does not carry a customer database, it carries the names of the people it deals with.
 */
export const counterpartyNamed = async (
  tx: Tx,
  farmId: string,
  said: { name: string; address?: string; phone?: string },
  now: Date
): Promise<string> => {
  const known = await tx.query.counterparty.findFirst({
    where: { farmId, name: said.name },
    columns: { id: true, address: true, phone: true },
  });
  if (known) {
    // An address or a phone the farm did not have before is worth keeping; one it already has
    // is not overwritten, because the man standing at the lorry today may not be the one who
    // gave his number last year and a merge should never lose what was already known.
    const learned = {
      ...(known.address === null && said.address
        ? { address: said.address }
        : {}),
      ...(known.phone === null && said.phone ? { phone: said.phone } : {}),
    };
    if (Object.keys(learned).length > 0) {
      await tx
        .update(counterparty)
        .set(learned)
        .where(eq(counterparty.id, known.id));
    }
    return known.id;
  }
  const id = newId(now);
  await tx.insert(counterparty).values({
    id,
    farmId,
    name: said.name,
    address: said.address ?? null,
    phone: said.phone ?? null,
    createdAt: now,
  });
  return id;
};
