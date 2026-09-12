/** The clinical record's shared reads. */

import { z } from "zod";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 180;
/** One screenful of a fortnight's rounds. */
export const MAX_SEEN_ROWS = 200;

/**
 * How far back a health screen looks, and for which of the farm's own words. Shared, because
 * the Manager's sweep of what the rounds have seen and the Vet's queue of what nobody has
 * answered are the same question asked with a different default.
 */
export const seenLatelyInput = (defaultDays: number) =>
  z
    .object({
      /** One kind of thing seen, by the Version's own word for it. */
      saw: z.string().trim().max(60).optional(),
      days: z.number().int().min(1).max(MAX_DAYS).default(defaultDays),
    })
    .default(() => ({ days: defaultDays }));

/**
 * Everything one round saw in the window that still stands. A withdrawn Observation is kept —
 * somebody did say it — but it is not what the farm saw.
 */
export const seenLately = ({
  farmId,
  saw,
  days,
  now,
}: {
  farmId: string;
  saw?: string;
  days: number;
  now: Date;
}) => ({
  farmId,
  seenAt: { gte: new Date(now.getTime() - days * DAY_MS) },
  withdrawnAt: { isNull: true as const },
  ...(saw ? { saw } : {}),
});

/**
 * A Diagnosis as the farm reads it: the Vet's name beside their conclusion. The act is
 * theirs in law, so their name travels with it rather than being looked up by whoever
 * happens to be reading.
 */
export const diagnosisView = <T extends { vet: { name: string } }>(row: T) => {
  const { vet, ...rest } = row;
  return { ...rest, diagnosedByName: vet.name };
};
