/** One of the farm's people as the People list answers, as far as a Cover needs them. */
export interface PersonForCover {
  id: string;
  name: string;
  roles: readonly string[];
  penIds: readonly string[];
  disabledAt: Date | string | null;
}

/** Barn Staff still on the farm: the only people with Pens to be away from, or to cover. */
const barnStaff = (people: readonly PersonForCover[]) =>
  people.filter(
    (person) => person.roles.includes("staff") && person.disabledAt === null
  );

/** Who may be away with somebody covering them: Barn Staff who keep at least one Pen. */
export const whoMayBeAway = (
  people: readonly PersonForCover[]
): PersonForCover[] =>
  barnStaff(people).filter((person) => person.penIds.length > 0);

/** Who may cover the one away: any other Barn Staff still on the farm. */
export const whoMayCover = (
  people: readonly PersonForCover[],
  awayId: string
): PersonForCover[] =>
  barnStaff(people).filter((person) => person.id !== awayId);

/** A person's name from the list, or nothing for somebody it no longer holds. */
export const nameIn = (people: readonly PersonForCover[], id: string): string =>
  people.find((person) => person.id === id)?.name ?? "";
