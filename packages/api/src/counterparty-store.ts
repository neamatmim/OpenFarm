import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, asc, eq, sql } from "@OpenFarm/db/operators";
import { counterparty } from "@OpenFarm/db/schema/fattening";

import type { Tx } from "./audit";

/** A name as the farm keeps and compares it: one Unicode form — য় typed as one letter or as য and its nukta is the same
 *  name — trimmed. */
const oneForm = (name: string) => name.normalize("NFC").trim();

/** The trader this farm wrote down by this name, whatever letters were capitalized and however the keyboard spelled its
 *  letters; the first where two differ only so. Asked by the sheets as a Sale finds him, so what they say of his debts is
 *  said of the man the Sale goes to. */
export const knownAs = async (
  tx: Pick<Tx, "select">,
  farmId: string,
  name: string
) => {
  const [known] = await tx
    .select({
      id: counterparty.id,
      address: counterparty.address,
      phone: counterparty.phone,
    })
    .from(counterparty)
    .where(
      and(
        eq(counterparty.farmId, farmId),
        sql`lower(normalize(${counterparty.name}, NFC)) = lower(${oneForm(name)})`
      )
    )
    .orderBy(asc(counterparty.createdAt), asc(counterparty.id))
    .limit(1);
  return known;
};

/**
 * The trader, recorded once per Farm — the same person whether the farm is buying from him or
 * selling to him, which is the whole point of one Counterparty and not a seller column here and
 * a buyer column there.
 *
 * Found by name rather than chosen from a list, because that is how the Manager knows him: a
 * farm does not carry a customer database, it carries the names of the people it deals with — and
 * found whatever letters she capitalized today, the first written down where two differ only so.
 */
export const counterpartyNamed = async (
  tx: Tx,
  farmId: string,
  said: { name: string; address?: string; phone?: string },
  now: Date
): Promise<string> => {
  const known = await knownAs(tx, farmId, said.name);
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
  // Two phones naming the same new trader at once write him once: the second finds the first rather than failing.
  const [written] = await tx
    .insert(counterparty)
    .values({
      id,
      farmId,
      // Kept in the one form it is compared in.
      name: oneForm(said.name),
      address: said.address ?? null,
      phone: said.phone ?? null,
      createdAt: now,
    })
    .onConflictDoNothing({ target: [counterparty.farmId, counterparty.name] })
    .returning({ id: counterparty.id });
  if (written) {
    return written.id;
  }
  const already = await knownAs(tx, farmId, said.name);
  if (!already) {
    throw new Error(`Counterparty ${said.name} was neither written nor found`);
  }
  return already.id;
};
