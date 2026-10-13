import { tagMatches, tagNumbered, tagSought } from "@/lib/tag-search";

import type { NavGroup } from "./navigation";

/** How many of each the box offers as one is typed: enough to choose from, few enough to read at once. */
const OFFERED = 6;

/** One thing the box can open: a page the reader's menu holds, or an animal by her Tag Number. */
export type Offer =
  | { kind: "place"; to: string; label: string }
  | { kind: "animal"; tag: string };

/** The Tag Numbers the farm has that hold what is typed: the one numbered so first, then those that start with it. */
const tagsFor = (tags: readonly string[], needle: string): string[] => {
  // A bare number typed — "12", or ১২ — is first the one animal numbered so: D-0012 before D-0120.
  const numbered = tagNumbered(tags, needle);
  const rest = tags.filter((tag) => tag !== numbered);
  const starting = rest.filter((tag) => tag.startsWith(needle));
  const holding = rest.filter(
    (tag) => !tag.startsWith(needle) && tagMatches(tag, needle)
  );
  return [
    ...(numbered === null ? [] : [numbered]),
    ...starting,
    ...holding,
  ].slice(0, OFFERED);
};

/** The reader's pages whose menu words hold what is typed: those whose words start with it first. */
const placesFor = (
  groups: readonly NavGroup[],
  say: (key: string) => string,
  typed: string
): Offer[] => {
  const sought = typed.toLocaleLowerCase();
  const starting: Offer[] = [];
  const holding: Offer[] = [];
  for (const item of groups.flatMap((group) => group.items)) {
    const label = say(item.label);
    const words = label.toLocaleLowerCase();
    if (!words.includes(sought)) {
      continue;
    }
    (words.startsWith(sought) ? starting : holding).push({
      kind: "place",
      to: item.to,
      label,
    });
  }
  return [...starting, ...holding].slice(0, OFFERED);
};

/**
 * What the box offers for what is typed: the reader's own pages, by the words their menu says them in, and the farm's
 * animals by Tag Number.
 */
export const offeredFor = ({
  places,
  say,
  tags,
  typed,
}: {
  places: readonly NavGroup[];
  say: (key: string) => string;
  tags: readonly string[];
  typed: string;
}): Offer[] => {
  const trimmed = typed.trim();
  if (!trimmed) {
    return [];
  }
  const animals: Offer[] = tagsFor(tags, tagSought(trimmed)).map((tag) => ({
    kind: "animal",
    tag,
  }));
  // Pages first: no menu says a number, so a Tag Number typed matches no page and its animals lead all the same.
  return [...placesFor(places, say, trimmed), ...animals];
};
