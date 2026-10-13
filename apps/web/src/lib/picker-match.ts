import { tagMatches, tagSought } from "./tag-search";

/**
 * Whether a picker's choice answers what was typed, as typed — in its name or in what tells it apart. Where the choices
 * are Tag Numbers, what was typed is also read as a tag, so ডি১২ and ১২ find D-0012. Anywhere else — a pen, a person, a
 * feed — it is only read as typed: a name begun in Bangla is not a tag, and «ডি» must find ডিপু, not every D on the farm.
 */
export const pickerMatches = (
  option: { label: string; detail?: string },
  typed: string,
  ofTags: boolean
): boolean => {
  const looking = typed.trim().toLowerCase();
  if (looking === "") {
    return true;
  }
  const asTyped = `${option.label} ${option.detail ?? ""}`
    .toLowerCase()
    .includes(looking);
  return asTyped || (ofTags && tagMatches(option.label, tagSought(typed)));
};
