/** One of the farm's people, as the training form offers them. */
interface Person {
  id: string;
  name: string;
  disabledAt: Date | string | null;
}

/** What one person was last taught of a procedure. */
interface Taught {
  userId: string;
  latest: boolean;
  onVersionInForce: boolean;
}

/**
 * Who may still be marked as taught the Version in force: everybody who may still sign in, but those already taught
 * it. Somebody taught an earlier Version stays on — the change is what they have not been taught — and somebody whose
 * access is gone is not offered, as the farm would refuse them.
 */
export const stillToTeach = <P extends Person>(
  people: readonly P[],
  trained: readonly Taught[]
): P[] => {
  const taught = new Set(
    trained
      .filter((row) => row.latest && row.onVersionInForce)
      .map((row) => row.userId)
  );
  return people.filter(
    (person) => !person.disabledAt && !taught.has(person.id)
  );
};
