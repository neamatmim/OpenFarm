import type { MessageKey } from "@OpenFarm/i18n";

import { tagMatches, tagNumbered, tagSought } from "@/lib/tag-search";

import type { NavGroup } from "./navigation";

/** How many of each the box shows as one is typed: enough to choose from, few enough to read at once. */
const SHOWN = 6;

/** One thing the Go to box can open: a page the reader's menu holds, or an animal by her Tag Number. */
export type GoToChoice =
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
  ].slice(0, SHOWN);
};

/** The reader's pages whose menu words hold what is typed: those whose words start with it first. */
const placesFor = (
  groups: readonly NavGroup[],
  say: (key: MessageKey) => string,
  typed: string
): GoToChoice[] => {
  const sought = typed.toLocaleLowerCase();
  const starting: GoToChoice[] = [];
  const holding: GoToChoice[] = [];
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
  return [...starting, ...holding].slice(0, SHOWN);
};

/** Whether what was typed reads as a Tag Number: a Side's letter and a dash — D-, F-, ডি- — or digits in it. */
const readsAsATag = (sought: string): boolean => /^[DF]-|\d/u.test(sought);

/**
 * What the Go to box shows for what is typed: the reader's own pages, by the words their menu says them in, and the
 * farm's animals by Tag Number — the animals first when it reads as a tag, the pages first when it reads as words.
 */
export const goToChoicesFor = ({
  places,
  say,
  tags,
  typed,
}: {
  places: readonly NavGroup[];
  say: (key: MessageKey) => string;
  tags: readonly string[];
  typed: string;
}): GoToChoice[] => {
  const trimmed = typed.trim();
  if (!trimmed) {
    return [];
  }
  const sought = tagSought(trimmed);
  const animals: GoToChoice[] = tagsFor(tags, sought).map((tag) => ({
    kind: "animal",
    tag,
  }));
  const pages = placesFor(places, say, trimmed);
  return readsAsATag(sought) ? [...animals, ...pages] : [...pages, ...animals];
};
