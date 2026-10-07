import type { FarmIdentity } from "@OpenFarm/domain";

import type { Tx } from "./audit";

/** The farm as it names itself today, as an Agreement keeps it on the day it is signed. */
export const farmAsItIs = async (
  tx: Pick<Tx, "query">,
  farmId: string
): Promise<FarmIdentity | null> =>
  (await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      name: true,
      address: true,
      phone: true,
      registrationNumber: true,
      registrationOffice: true,
      registrationIssuedOn: true,
      registrationExpiresOn: true,
    },
  })) ?? null;

const dayOf = (value: unknown): Date | null =>
  typeof value === "string" || value instanceof Date ? new Date(value) : null;

/**
 * What a copy of a stamped Agreement is headed with: the farm as it was the day it was signed, where the Agreement kept
 * it — renamed or registered anew since, a copy headed with today's would differ from the paper it copies. An Agreement
 * signed before that was kept is headed with the farm as it is.
 */
export const farmOnTheStampedDay = <Farm extends FarmIdentity>(
  kept: unknown,
  today: Farm
): Farm => {
  if (kept === null || typeof kept !== "object") {
    return today;
  }
  const then = kept as Record<string, unknown>;
  const text = (key: keyof FarmIdentity) =>
    typeof then[key] === "string" ? (then[key] as string) : null;
  return {
    ...today,
    name: text("name") ?? today.name,
    address: text("address"),
    phone: text("phone"),
    registrationNumber: text("registrationNumber"),
    registrationOffice: text("registrationOffice"),
    registrationIssuedOn: dayOf(then.registrationIssuedOn),
    registrationExpiresOn: dayOf(then.registrationExpiresOn),
  };
};
