import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";

import { useLanguage } from "@/i18n/language-provider";

/** Which Season an animal joins: the next Eid, which the farm fills in, or a window somebody says. */
export type WindowPick =
  | { kind: "eid" }
  | { kind: "other"; start: string; end: string };

export const NEXT_EID: WindowPick = { kind: "eid" };

/** What is sent: nothing for the next Eid — the farm works it out, a phone out of signal included — or the window. */
export const windowOf = (
  pick: WindowPick
): { start: string; end: string } | undefined =>
  pick.kind === "eid" ? undefined : { start: pick.start, end: pick.end };

/** Whether what was picked can be sent: the next Eid always; another window once both its days are said, in order. */
export const windowReady = (pick: WindowPick): boolean =>
  pick.kind === "eid" ||
  (pick.start !== "" && pick.end !== "" && pick.start <= pick.end);

/**
 * The Season an animal joins, asked where she comes to the Farm's Fattening side other than by Intake: walked across
 * from Dairy, or bought back from a Venture. The next Eid first, as an Intake defaults to it.
 */
export const WindowChoice = ({
  id,
  pick,
  onPick,
}: {
  id: string;
  pick: WindowPick;
  onPick: (pick: WindowPick) => void;
}) => {
  const { t } = useLanguage();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t("window.title")}</legend>
      <label className="flex items-start gap-2 text-sm" htmlFor={`${id}-eid`}>
        <input
          checked={pick.kind === "eid"}
          id={`${id}-eid`}
          name={id}
          onChange={() => onPick(NEXT_EID)}
          type="radio"
        />
        <span className="flex flex-col">
          {t("window.nextEid")}
          <span className="text-muted-foreground text-xs">
            {t("window.nextEidHint")}
          </span>
        </span>
      </label>
      <label
        className="flex items-center gap-2 text-sm"
        htmlFor={`${id}-other`}
      >
        <input
          checked={pick.kind === "other"}
          id={`${id}-other`}
          name={id}
          onChange={() => onPick({ kind: "other", start: "", end: "" })}
          type="radio"
        />
        {t("window.other")}
      </label>
      {pick.kind === "other" ? (
        <div className="grid grid-cols-2 gap-2 pl-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{t("window.from")}</Label>
            <Input
              id={`${id}-start`}
              onChange={(event) =>
                onPick({ ...pick, start: event.target.value })
              }
              type="date"
              value={pick.start}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-end`}>{t("window.to")}</Label>
            <Input
              id={`${id}-end`}
              onChange={(event) => onPick({ ...pick, end: event.target.value })}
              type="date"
              value={pick.end}
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
};
