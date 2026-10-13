/** Which way the money went, as the register narrows to it. */
export type DirectionFilter = "" | "in" | "out";
/** Where an entry stands with the Owner, as the register narrows to it. */
export type StatusFilter = "" | "awaiting" | "approved";

/** The ways money is paid, which the register narrows to as a whole. */
const PAYMENT_METHODS = ["cash", "mobile_money", "bank"] as const;

export interface Filters {
  direction: DirectionFilter;
  category: string;
  status: StatusFilter;
  search: string;
  /** How it was paid — "cash", "mobile_money" or "bank", whichever account — or one Farm Account by its id: the money
   *  book read against one statement. Empty for all of it. */
  paidThrough: string;
}

export const NO_FILTERS: Filters = {
  direction: "",
  category: "",
  status: "",
  search: "",
  paidThrough: "",
};

/** As much of a Money Event as the filters read. */
interface Filtered {
  direction: "in" | "out";
  approval: string;
  counterpartyName: string | null;
  note: string | null;
  paymentMethod: string;
  farmAccountId: string | null;
}

/** Whether an entry went the way, or through the account, the register is narrowed to. */
const paidThat = (paidThrough: string, event: Filtered): boolean => {
  if (paidThrough === "") {
    return true;
  }
  return (PAYMENT_METHODS as readonly string[]).includes(paidThrough)
    ? event.paymentMethod === paidThrough
    : event.farmAccountId === paidThrough;
};

/** Whether an entry is one the filters let through: which way, its Category, where it stands, how it was paid, and
 *  words in it. */
export const passes = (
  filters: Filters,
  event: Filtered,
  what: string
): boolean => {
  const words = filters.search.trim().toLowerCase();
  const said = [what, event.counterpartyName ?? "", event.note ?? ""]
    .join(" ")
    .toLowerCase();
  return (
    (filters.direction === "" || event.direction === filters.direction) &&
    (filters.category === "" || what === filters.category) &&
    (filters.status === "" || event.approval === filters.status) &&
    paidThat(filters.paidThrough, event) &&
    (words === "" || said.includes(words))
  );
};
