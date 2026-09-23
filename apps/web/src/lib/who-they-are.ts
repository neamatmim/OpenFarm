/**
 * Who the farm says this person is, with what the phone remembers as the fallback.
 *
 * The farm is asked first and its answer wins: Roles taken away, an account disabled, a farm that is not there any
 * more — a remembered answer would go on letting them onto screens the farm refuses, and every page on it would
 * quietly fail. The remembered one stands only when the farm cannot be reached at all, which is a dropped signal
 * rather than a change of who they are, and is what keeps a milker working through it.
 */
export const whoTheyAre = async <Person>({
  known,
  ask,
}: {
  known: Person | undefined;
  ask: () => Promise<Person>;
}): Promise<Person | undefined> => {
  try {
    return await ask();
  } catch {
    return known;
  }
};
