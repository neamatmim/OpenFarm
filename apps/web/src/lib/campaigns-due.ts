/**
 * The Pens a Campaign is raised in from the list of those due: each holding an animal whose day has come, and none
 * whose Campaign already stands open — raised already, it is walked there, not raised again. Those only coming due wait
 * for their day.
 */
export const pensToRaise = (
  animals: readonly {
    penId: string;
    standing: "due" | "soon";
    raisedOpen: boolean;
  }[]
): string[] => [
  ...new Set(
    animals
      .filter((one) => one.standing === "due" && !one.raisedOpen)
      .map((one) => one.penId)
  ),
];
