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
  | "shorten";

/** What one person may do to her, worked out once for the page: every button and menu item reads from here, so a
 *  control the farm would refuse is never offered — a dead end in the barn. */
export interface AnimalPowers {
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
}

/** Everything one person may do to her, from their Roles and Scopes. */
export const useAnimalPowers = (detail: AnimalDetail | undefined) => {
  const me = useQuery(orpc.people.me.queryOptions());
  const { isVet, fullVet, runsTheFarm, mayHandle, seesPapers } = powersOf(
    me.data?.roles,
    me.data?.scopes.vet?.kind === "cases"
  );
  const pens = usePens(me.data);
  const ownPens = pensOf(me.data?.scopes.staff);
  const powers: AnimalPowers = {
    mayReport: mayHandle || isVet,
    mayMove:
      detail !== undefined &&
      (runsTheFarm || (mayHandle && ownPens.includes(detail.penId))),
    movePens: runsTheFarm
      ? pens
      : pens.filter((pen) => ownPens.includes(pen.id)),
    mayChangeState: runsTheFarm || fullVet,
    mayHandle,
    runsTheFarm,
    isVet,
    fullVet,
    seesPapers,
  };
  return powers;
};
