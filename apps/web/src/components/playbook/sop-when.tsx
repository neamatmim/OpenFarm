import type { SopContent, TriggerKind } from "@OpenFarm/domain";
import {
  CALVING_LEADS,
  FARM_EVENTS,
  HEAT,
  LIVE_STATES,
  MAX_TRIGGER_OFFSET_DAYS,
  SERVICE,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Clock, Plus, Trash2, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import type { HappeningTrigger } from "@/lib/sop-draft";
import {
  emptyHappening,
  happeningTriggers,
  scheduleEveryOtherWeek,
  scheduleTimes,
  scheduleWeekdays,
  splitList,
  withEveryOtherWeek,
  withHappeningTriggers,
  withScheduleTimes,
  withScheduleWeekdays,
} from "@/lib/sop-draft";

/** A happening whose work the farm times by its own Parameters rather than days on the Trigger. */
const farmTimed = (happening: HappeningTrigger): boolean =>
  happening.kind === "before_calving" ||
  (happening.kind === "event" &&
    (happening.event === HEAT || happening.event === SERVICE));

/** The same trigger, as another kind of thing that raises work — keeping the days-after
 *  count where the new kind has one to keep. */
const ofKind = (
  kind: TriggerKind,
  happening: HappeningTrigger
): HappeningTrigger => {
  if (kind === "prescription") {
    return { kind: "prescription" };
  }
  if (kind === "notifiable_disease") {
    return { kind: "notifiable_disease" };
  }
  if (kind === "before_calving") {
    return { kind: "before_calving", lead: "dry_off" };
  }
  if (kind === "registration_renewal") {
    return { kind: "registration_renewal" };
  }
  const offsetDays =
    "offsetDays" in happening ? happening.offsetDays : undefined;
  return kind === "event"
    ? { kind: "event", event: "move", offsetDays }
    : { kind: "state", state: "dry", offsetDays };
};

/** A quiet line beside a trigger, saying what there is not to choose. */
const Aside = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground self-center text-sm">{children}</p>
);

/** What exactly one trigger waits for: which happening, which State, which calving lead, and how many days after. */
const TriggerDetail = ({
  happening,
  index,
  onChange,
}: {
  happening: HappeningTrigger;
  index: number;
  onChange: (next: HappeningTrigger) => void;
}) => {
  const t = useT();
  return (
    <>
      {happening.kind === "before_calving" ? (
        <NativeSelect
          aria-label={t("sop.trigger.beforeCalving")}
          className="sm:w-auto"
          onChange={(e) =>
            onChange({ ...happening, lead: e.target.value as never })
          }
          value={happening.lead}
        >
          {CALVING_LEADS.map((lead) => (
            <option key={lead} value={lead}>
              {t(`calvingLead.${lead}`)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {happening.kind === "prescription" ? (
        // A Prescription says when its own doses fall due, so there is nothing here to
        // choose and nothing to count days from.
        <Aside>{t("sop.trigger.perDose")}</Aside>
      ) : null}
      {happening.kind === "notifiable_disease" ? (
        // Due the moment the Diagnosis is made: the Act says without delay.
        <Aside>{t("sop.trigger.withoutDelay")}</Aside>
      ) : null}
      {happening.kind === "event" ? (
        <NativeSelect
          aria-label={t("sop.trigger.event")}
          className="sm:w-auto"
          onChange={(e) =>
            onChange({ ...happening, event: e.target.value as never })
          }
          value={happening.event}
        >
          {FARM_EVENTS.map((event) => (
            <option key={event} value={event}>
              {t(`event.${event}`)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {happening.kind === "state" ? (
        <NativeSelect
          aria-label={t("sop.trigger.state")}
          className="sm:w-auto"
          onChange={(e) =>
            onChange({ ...happening, state: e.target.value as never })
          }
          value={happening.state}
        >
          {LIVE_STATES.map((state) => (
            <option key={state} value={state}>
              {t(`state.${state}`)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {farmTimed(happening) ? (
        // A Heat's and a Service's work — and calving work — are timed by the farm's own
        // Parameters, and the Playbook refuses a number of days here, so it does not offer one.
        <Aside>{t("sop.trigger.farmTimed")}</Aside>
      ) : null}
      {(happening.kind === "event" || happening.kind === "state") &&
      !farmTimed(happening) ? (
        <div className="flex items-center gap-2">
          <label
            className="text-muted-foreground text-sm whitespace-nowrap"
            htmlFor={`after-${index}`}
          >
            {t("sop.trigger.after")}
          </label>
          <Input
            className="w-24"
            id={`after-${index}`}
            max={MAX_TRIGGER_OFFSET_DAYS}
            min={0}
            onChange={(e) =>
              onChange({
                ...happening,
                offsetDays: Number(e.target.value) || 0,
              })
            }
            type="number"
            value={happening.offsetDays ?? 0}
          />
        </div>
      ) : null}
    </>
  );
};

/** What raises this work besides the clock: a Move, an arrival, a cow reaching a State, or a
 *  Prescription — one dose of which is one piece of work. Only what the farm actually records
 *  can be picked, because a Trigger nobody writes is work that never arrives. */
const TriggerFields = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (next: SopContent) => void;
}) => {
  const t = useT();
  const happenings = happeningTriggers(content);
  const replace = (index: number, next: HappeningTrigger | null) =>
    onChange(
      withHappeningTriggers(
        content,
        next === null
          ? happenings.filter((_, at) => at !== index)
          : happenings.map((current, at) => (at === index ? next : current))
      )
    );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Zap aria-hidden className="text-muted-foreground size-4" />
        {t("sop.triggers")}
      </legend>
      {content.triggers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("sop.trigger.byHand")}
        </p>
      ) : null}
      {happenings.map((happening, index) => (
        <div
          className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center"
          key={`${happening.kind}-${index}`}
        >
          <NativeSelect
            aria-label={t("sop.triggers")}
            className="sm:w-auto"
            onChange={(e) =>
              replace(index, ofKind(e.target.value as TriggerKind, happening))
            }
            value={happening.kind}
          >
            <option value="event">{t("sop.trigger.event")}</option>
            <option value="state">{t("sop.trigger.state")}</option>
            <option value="prescription">
              {t("sop.trigger.prescription")}
            </option>
            <option value="notifiable_disease">
              {t("sop.trigger.notifiable")}
            </option>
            <option value="before_calving">
              {t("sop.trigger.beforeCalving")}
            </option>
            <option value="registration_renewal">
              {t("sop.trigger.registrationRenewal")}
            </option>
          </NativeSelect>
          <TriggerDetail
            happening={happening}
            index={index}
            onChange={(next) => replace(index, next)}
          />
          <Button
            aria-label={t("sop.trigger.remove")}
            className="text-danger self-end sm:ml-auto sm:self-center"
            onClick={() => replace(index, null)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() =>
          onChange(
            withHappeningTriggers(content, [...happenings, emptyHappening()])
          )
        }
        type="button"
        variant="outline"
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t("sop.trigger.add")}
      </Button>
    </fieldset>
  );
};

/** The days of the week, Sunday first, as the farm's schedule numbers them. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Which days the scheduled work falls on — every day when none is ticked — and whether only every other week. */
const ScheduleDays = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (content: SopContent) => void;
}) => {
  const t = useT();
  const days = scheduleWeekdays(content);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{t("sop.days")}</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => {
          const on = days.includes(day);
          return (
            <Button
              aria-pressed={on}
              className="min-w-12"
              key={day}
              onClick={() =>
                onChange(
                  withScheduleWeekdays(
                    content,
                    on ? days.filter((d) => d !== day) : [...days, day]
                  )
                )
              }
              size="sm"
              type="button"
              variant={on ? "default" : "outline"}
            >
              {t(`sop.weekday.${day}`)}
            </Button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {days.length === 0 ? t("sop.everyDay") : t("sop.onTheseDays")}
      </p>
      {days.length > 0 ? (
        <label className="inline-flex min-h-11 items-center gap-2 text-sm md:min-h-0">
          <input
            checked={scheduleEveryOtherWeek(content)}
            className="size-4"
            onChange={(event) =>
              onChange(withEveryOtherWeek(content, event.target.checked))
            }
            type="checkbox"
          />
          {t("sop.everyOtherWeek")}
        </label>
      ) : null}
    </fieldset>
  );
};

/**
 * When the procedure's work comes up: on the clock — its times of day and the days they fall on — and when something
 * the farm records happens. Neither, and it is work the Manager raises on the day.
 */
export const WhenSection = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (content: SopContent) => void;
}) => {
  const t = useT();
  return (
    <Section
      description={t("sop.editor.whenHint")}
      id="sop-when"
      title={t("sop.editor.when")}
    >
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Clock aria-hidden className="text-muted-foreground size-4" />
          {t("sop.editor.clock")}
        </h3>
        <FormField
          className="sm:max-w-sm"
          hint={t("sop.timesHelp")}
          id="times"
          label={t("sop.times")}
        >
          <Input
            id="times"
            onChange={(e) =>
              onChange(withScheduleTimes(content, splitList(e.target.value)))
            }
            placeholder={t("sop.timesHelp")}
            value={scheduleTimes(content).join(", ")}
          />
        </FormField>
        <ScheduleDays content={content} onChange={onChange} />
        <div className="flex min-h-11 items-start gap-2 text-sm md:min-h-0">
          <input
            checked={content.wholeFarm === true}
            className="mt-0.5 size-4"
            id="sop-whole-farm"
            onChange={(event) =>
              onChange({
                ...content,
                wholeFarm: event.target.checked ? true : undefined,
              })
            }
            type="checkbox"
          />
          <label className="flex flex-col gap-0.5" htmlFor="sop-whole-farm">
            {t("sop.wholeFarm")}
            <span className="text-muted-foreground text-xs">
              {t("sop.wholeFarmHint")}
            </span>
          </label>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <TriggerFields content={content} onChange={onChange} />
      </div>
    </Section>
  );
};
