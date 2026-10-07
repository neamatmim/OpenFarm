import { Input } from "@OpenFarm/ui/components/input";
import { useState } from "react";

import { figureOf } from "@/lib/typed-figure";

/**
 * A figure the Playbook editor asks for — a range's ends, a grace, days after — typed as the reader types it, Bangla
 * digits too. An empty box is no figure at all, never 0: a Most cleared to 0 warned at every cow's 12 litres, and a
 * grace cleared to 0 made work late the moment it fell due. Kept as typed while it is being typed, so "1." stays.
 */
export const FigureBox = ({
  id,
  value,
  onFigure,
  className,
}: {
  id: string;
  value: number | undefined;
  onFigure: (figure: number | undefined) => void;
  className?: string;
}) => {
  const shown = value === undefined || Number.isNaN(value) ? "" : String(value);
  const [typed, setTyped] = useState(shown);
  // The box says what was typed while it still means the figure held; a figure changed from outside is shown as it is.
  const stillMeant =
    (figureOf(typed) ?? undefined) === value ||
    (typed.trim() === "" && shown === "");
  return (
    <Input
      className={className}
      id={id}
      inputMode="decimal"
      onChange={(event) => {
        setTyped(event.target.value);
        onFigure(figureOf(event.target.value) ?? undefined);
      }}
      value={stillMeant ? typed : shown}
    />
  );
};
