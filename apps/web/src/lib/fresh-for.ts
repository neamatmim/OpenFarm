import { useState } from "react";

/**
 * Empties a sheet's boxes when it is opened on a different subject.
 *
 * The sheets are mounted once and shown by a flag, so what somebody typed into one survives closing it.
 * Reopening the same sheet on the same Venture and finding the figure still there is a kindness. Opening
 * it on **another** Venture and finding it there is how the wrong figure gets recorded — the Agreement
 * sheet will offer the last Venture's Units and the last Venture's stamp serial against a different
 * Venture's paper, and a stamp serial is not a thing to notice going past.
 *
 * Only on a change of subject, and never on closing: clearing the boxes as the sheet slides shut would
 * empty them in front of the person who is watching it go.
 *
 * Written once because five sheets had worked it out for themselves and fifteen had not.
 */
export const useFreshFor = (
  subjectId: string | undefined,
  empty: () => void
): void => {
  const [openedOn, setOpenedOn] = useState<string | undefined>();
  if (subjectId !== undefined && subjectId !== openedOn) {
    // Set during the render that first sees the new subject, which is what React asks for when state
    // has to follow a prop: it re-renders at once with the boxes already empty, and nothing flickers.
    setOpenedOn(subjectId);
    empty();
  }
};
