import { isExitState, statesSetByHand } from "@OpenFarm/domain";
import { useQuery } from "@tanstack/react-query";

import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

/** Her record as her page reads it. */
export type AnimalDetail = NonNullable<
  Awaited<ReturnType<typeof orpc.animals.byTag.call>>
>;

/** A Pen somebody may move her to, with its shed's name. */
export interface PenChoice {
  id: string;
  name: string;
  shedName: string;
  /** A quarantine pen. Missing from an answer kept from before pens were marked: read as not one. */
  quarantine?: boolean;
}

/** A person's Scope under each Role they hold, as `people.me` tells a screen. */
type MeScopes = Awaited<ReturnType<typeof client.people.me>>["scopes"];

/** The Pens in somebody's Scope — none for a Scope that is the farm, which is not narrowed to any, or their Cases. */
export const pensOf = (scope: MeScopes[keyof MeScopes]): readonly string[] =>
  scope && "penIds" in scope ? scope.penIds : [];

/** The farm's Pens to move her to, once it is known the reader may see them: a visiting Vet moves nobody, and does
 *  not see the farm's layout. */
export const usePens = (me: { scopes: MeScopes } | undefined): PenChoice[] => {
  // Only somebody here only on a visit is kept from them — every Scope they hold their Cases: a visiting Vet who also
  // works the barn or runs the farm moves animals.
  const scopes = Object.values(me?.scopes ?? {});
  const onlyVisiting =
    scopes.length > 0 && scopes.every((scope) => scope?.kind === "cases");
  const sheds = useQuery({
    ...orpc.herd.list.queryOptions(),
    enabled: me !== undefined && !onlyVisiting,
  });
  return (
    sheds.data?.flatMap((shed) =>
      shed.pens.map((pen) => ({ ...pen, shedName: shed.name }))
    ) ?? []
  );
};

/** What somebody holding these Roles may do on her page. */
export const powersOf = (roles: readonly string[] = [], visiting = false) => {
  const isManager = roles.includes("manager");
  const runsTheFarm = isManager || roles.includes("owner");
  return {
    isVet: roles.includes("vet"),
    // A vet called in for a visit treats her, and does not change her State or cut short a Withdrawal.
    fullVet: roles.includes("vet") && !visiting,
    isManager,
    isOwner: roles.includes("owner"),
    runsTheFarm,
    mayHandle: runsTheFarm || roles.includes("staff"),
    // Barn Staff give the doses and record what they see; what the farm tells the outside world about an animal is
    // not theirs to hand over, so they are not offered it.
    seesPapers: roles.some((role) => role !== "staff"),
  };
};

/** The record-keeping acts her page offers, each written in its own dialog or sheet. */
export type AnimalAct =
  | "move"
  | "state"
  | "retag"
  | "mortality"
  | "disposal"
  | "abortion"
  | "shorten"
  | "purse"
  | "notFound"
  | "writeOff"
  | "dose";

/** What one person may do to her, worked out once for the page: every button and menu item reads from here, so a
 *  control the farm would refuse is never offered — a dead end in the barn. */
export interface AnimalPowers {
  /** Still on the farm: one sold, dead or culled has her record put right, and nothing added to it. */
  stillHere: boolean;
  /** Report what was seen of her: anybody who handles her, and a Vet. */
  mayReport: boolean;
  mayMove: boolean;
  /** Where she may be moved by this person: anywhere for those who run the farm, a Staff member's own Pens. */
  movePens: PenChoice[];
  /** Owner, Manager or a full Vet: a visiting vet does not change her State. */
  mayChangeState: boolean;
  /** A photo and a new ear tag: anybody who handles her. */
  mayHandle: boolean;
  runsTheFarm: boolean;
  isVet: boolean;
  fullVet: boolean;
  seesPapers: boolean;
  /** Sell her between the Farm's herd and a Venture: the Owner's, for a bought Fattening animal still being fattened
   *  and weighed at least once — the one an Internal Sale would take. */
  mayMovePurse: boolean;
  /** Write her off as Lost while the round cannot find her, and find her again once written off: the Owner's. */
  mayWriteOff: boolean;
}

/** Whether there is a State she may simply be set to: a Fattening bull's next steps are each a record of their own —
 *  Ready on its page, a Sale, a Mortality — and are not offered to be refused. */
const hasAStateToSet = (detail: AnimalDetail | undefined): boolean =>
  detail !== undefined && statesSetByHand(detail.state).length > 0;

/** Whether an Internal Sale would take her: a bought Fattening animal still being fattened, and weighed. */
const movesBetweenPurses = (detail: AnimalDetail | undefined): boolean =>
  detail !== undefined &&
  detail.side === "fattening" &&
  detail.source === "bought" &&
  (detail.state === "quarantine" || detail.state === "fattening") &&
  (detail.weighIns?.length ?? 0) > 0;

/** Everything one person may do to her, from their Roles and Scopes. */
export const useAnimalPowers = (detail: AnimalDetail | undefined) => {
  const me = useQuery(orpc.people.me.queryOptions());
  const { isVet, isOwner, fullVet, runsTheFarm, mayHandle, seesPapers } =
    powersOf(me.data?.roles, me.data?.scopes.vet?.kind === "cases");
  const pens = usePens(me.data);
  const ownPens = pensOf(me.data?.scopes.staff);
  // Sold, died or culled: nothing more is written of her — her record is put right, never added to — so nothing that
  // would add to it is offered, only to be refused.
  const stillHere = detail !== undefined && !isExitState(detail.state);
  const powers: AnimalPowers = {
    stillHere,
    mayReport: stillHere && (mayHandle || isVet),
    mayMove:
      stillHere &&
      (runsTheFarm || (mayHandle && ownPens.includes(detail.penId))),
    // An animal in Quarantine is walked only into a quarantine pen until she is released: nowhere else is offered.
    movePens: (runsTheFarm
      ? pens
      : pens.filter((pen) => ownPens.includes(pen.id))
    ).filter(
      (pen) => detail?.state !== "quarantine" || pen.quarantine === true
    ),
    mayChangeState: (runsTheFarm || fullVet) && hasAStateToSet(detail),
    mayHandle: stillHere && mayHandle,
    runsTheFarm,
    isVet,
    fullVet,
    seesPapers,
    mayMovePurse: isOwner && movesBetweenPurses(detail),
    mayWriteOff: isOwner,
  };
  return powers;
};

/** How far back a death is offered her Diagnoses to be linked to: two months, the course of most illnesses that kill. */
const DIAGNOSES_OFFERED_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Her Diagnoses the Vet made lately — on their own, or answering what a round saw — the latest first, once each: what a
 * death may be linked to, so the register names the disease and the office's reference.
 */
export const herRecentDiagnoses = (
  detail: Pick<AnimalDetail, "diagnoses" | "observations">,
  now: Date
): { id: string; disease: string; diagnosedAt: Date }[] => {
  const since = now.getTime() - DIAGNOSES_OFFERED_DAYS * DAY_MS;
  const all = [
    ...detail.diagnoses,
    ...detail.observations.flatMap((seen) => seen.diagnoses),
  ];
  const once = new Map(all.map((one) => [one.id, one]));
  return [...once.values()]
    .map((one) => ({
      id: one.id,
      disease: one.disease,
      diagnosedAt: new Date(one.diagnosedAt),
    }))
    .filter((one) => one.diagnosedAt.getTime() >= since)
    .toSorted((a, b) => b.diagnosedAt.getTime() - a.diagnosedAt.getTime());
};
