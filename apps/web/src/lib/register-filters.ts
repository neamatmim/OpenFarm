import type { PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS } from "@OpenFarm/domain";

/** Which way the money went, as the register narrows to it. */
export type DirectionFilter = "" | "in" | "out";
/** Where an entry stands with the Owner, as the register narrows to it. */
export type StatusFilter = "" | "awaiting" | "approved";

/** How the money was paid, as the register narrows to it: any way, one way whichever account, or one Farm Account —
 *  the money book read against one statement. */
export type PaidThrough =
  | { kind: "any" }
  | { kind: "method"; method: PaymentMethod }
  | { kind: "account"; accountId: string };

export interface Filters {
  direction: DirectionFilter;
  category: string;
  status: StatusFilter;
  search: string;
  paidThrough: PaidThrough;
}

export const NO_FILTERS: Filters = {
  direction: "",
  category: "",
  status: "",
  search: "",
  paidThrough: { kind: "any" },
};

/** What a choice of how it was paid is written as in the list a person picks from: a way and an account never read as
 *  each other, whatever an account's id looks like. */
export const paidThroughValue = (one: PaidThrough): string => {
  switch (one.kind) {
    case "method": {
      return `method:${one.method}`;
    }
    case "account": {
      return `account:${one.accountId}`;
    }
    default: {
      return "";
    }
  }
};

/** The choice a value from that list stands for; anything it does not know is no choice at all. */
export const paidThroughOf = (value: string): PaidThrough => {
  if (value.startsWith("account:")) {
    return { kind: "account", accountId: value.slice("account:".length) };
  }
  const method = PAYMENT_METHODS.find((one) => value === `method:${one}`);
  return method ? { kind: "method", method } : { kind: "any" };
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
const paidThat = (paidThrough: PaidThrough, event: Filtered): boolean => {
  switch (paidThrough.kind) {
    case "method": {
      return event.paymentMethod === paidThrough.method;
    }
    case "account": {
      return event.farmAccountId === paidThrough.accountId;
    }
    default: {
      return true;
    }
  }
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
