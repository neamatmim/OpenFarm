import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";

import { SegmentedControl } from "@/components/page";
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
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" data-slot="form-label">
        {t("window.title")}
      </span>
      <SegmentedControl
        label={t("window.title")}
        name={id}
        onChange={(kind) =>
          onPick(kind === "eid" ? NEXT_EID : { kind, start: "", end: "" })
        }
        options={[
          { value: "eid", label: t("window.nextEid") },
          { value: "other", label: t("window.other") },
        ]}
        value={pick.kind}
      />
      {pick.kind === "eid" ? (
        <p className="text-muted-foreground text-sm">
          {t("window.nextEidHint")}
        </p>
      ) : null}
      {pick.kind === "other" ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
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
    </div>
  );
};
