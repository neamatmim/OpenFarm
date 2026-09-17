import type { RoleName } from "@OpenFarm/api/roles";

import type { orpc } from "@/utils/orpc";

/** Everybody the farm has a name for, in one list: those who work here, those invited and not yet approved, and
 *  those approved who have not signed up. What each of them is waiting for is said beside their name rather
 *  than by which of three lists they are in. */
export type Standing =
  | { kind: "working" }
  | { kind: "visiting"; until: Date }
  | { kind: "gone" }
  | { kind: "waitingForTheOwner"; inviteId: string }
  | { kind: "waitingToSignUp"; inviteId: string };

export type StandingKind = Standing["kind"];

export interface Listed {
  key: string;
  name: string;
  email: string;
  roles: RoleName[];
  /** Their own page, for somebody the farm has: an invitation has none until it is taken up. */
  userId: string | null;
  pens: number;
  standing: Standing;
}

export type PeopleList = Awaited<ReturnType<typeof orpc.people.list.call>>;

export const STANDING_WORD = {
  working: "people.standing.working",
  visiting: "visit.until",
  gone: "people.standing.gone",
  waitingForTheOwner: "people.standing.waitingForTheOwner",
  waitingToSignUp: "people.standing.waitingToSignUp",
} as const;

export const STANDING_TONE = {
  working: "success",
  visiting: "warning",
  gone: "danger",
  waitingForTheOwner: "warning",
  waitingToSignUp: "neutral",
} as const;

/** Sorted by standing, whoever the farm is waiting on comes first, and those no longer here last. */
export const STANDING_ORDER = {
  waitingForTheOwner: 0,
  waitingToSignUp: 1,
  visiting: 2,
  working: 3,
  gone: 4,
} as const;

/**
 * What the farm is waiting on for somebody who already has an account.
 *
 * Written to survive an answer the farm gave some other week. The phone keeps what it last knew for a
 * fortnight and shows it before it has asked again, so a screen written this morning is handed payloads
 * shaped the way the farm shaped them when that phone was last in signal.
 */
const standingOf = (person: {
  disabledAt?: Date | null;
  visitUntil?: Date | null;
}): Standing => {
  if (person.disabledAt) {
    return { kind: "gone" };
  }
  return person.visitUntil
    ? { kind: "visiting", until: new Date(person.visitUntil) }
    : { kind: "working" };
};

/** Everybody on one list, whoever the farm is waiting on first: an invitation nobody has approved is somebody not
 *  working yet. */
export const listedFrom = (list: PeopleList | undefined): Listed[] => {
  const people = (list?.people ?? []).map((person): Listed => ({
    key: person.id,
    userId: person.id,
    name: person.name,
    email: person.email,
    // A phone's own copy of an older answer may be missing either of these.
    roles: person.roles ?? [],
    pens: person.penIds?.length ?? 0,
    standing: standingOf(person),
  }));
  const pending = (list?.pendingInvites ?? []).map((one): Listed => ({
    key: one.id,
    userId: null,
    name: one.name,
    email: one.email,
    roles: one.roles ?? [],
    pens: 0,
    standing: { kind: "waitingForTheOwner", inviteId: one.id },
  }));
  const waiting = (list?.awaitingSignup ?? []).map((one): Listed => ({
    key: one.id,
    userId: null,
    name: one.name,
    email: one.email,
    roles: one.roles ?? [],
    pens: 0,
    standing: { kind: "waitingToSignUp", inviteId: one.id },
  }));
  return [...pending, ...waiting, ...people];
};

/** What the list is narrowed to: words in a name or an email, a Role, a standing. Empty is everybody. */
export interface PeopleFilter {
  looking: string;
  role: RoleName | "";
  standing: StandingKind | "";
}

/** Where the person's name is looked for: their name and the email the farm writes to; then their Role and standing. */
export const matching = (rows: Listed[], filter: PeopleFilter): Listed[] => {
  const needle = filter.looking.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!needle ||
        (row.name ?? "").toLowerCase().includes(needle) ||
        (row.email ?? "").toLowerCase().includes(needle)) &&
      (!filter.role || row.roles.includes(filter.role)) &&
      (!filter.standing || row.standing.kind === filter.standing)
  );
};
