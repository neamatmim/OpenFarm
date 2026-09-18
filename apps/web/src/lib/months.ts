import { farmDayOf } from "@OpenFarm/domain";

/**
 * The month before this one, on the farm's own clock: at one in the morning in Dhaka it is still
 * yesterday in UTC, and a farm settling August would otherwise be offered July.
 */
export const lastMonth = (): string => {
  const today = farmDayOf(new Date());
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
};
