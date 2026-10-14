import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  Loaded,
  Notice,
  Section,
  StatusBadge,
} from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Drills = Awaited<ReturnType<typeof orpc.backups.drills.call>>;
type Drill = Drills["drills"][number];

/** The refusals writing a drill down meets, in the farm's words. */
const REFUSALS = {
  drill_not_done_yet: "backups.drill.refused.notDoneYet",
  drill_says_what_went_wrong: "backups.drill.refused.whatWentWrong",
} as const;

/** A farm day as the reader's date. */
const dayIn = (day: string, language: Language) =>
  formatDate(startOfFarmDay(day), language, "date");

/** Writing a drill down: the day, how it went, the copy restored, and what was checked — what was missing, when it did
 *  not go well. */
const RecordDrill = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [doneOn, setDoneOn] = useState(() => farmDayOf(new Date()));
  const [how, setHow] = useState<"well" | "badly">("well");
  const [backupUsed, setBackupUsed] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.backups.recordDrill.mutationOptions({
      onSuccess: () => {
        toast.success(t("backups.drill.saved"));
        setHow("well");
        setBackupUsed("");
        setNote("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const saysWhatWentWrong = how === "well" || note.trim() !== "";
  return (
    <FormSheet
      description={t("backups.drill.recordWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({
          doneOn,
          wentWell: how === "well",
          backupUsed: backupUsed.trim() || undefined,
          note: note.trim() || undefined,
        })
      }
      open={open}
      pending={record.isPending}
      ready={doneOn !== "" && saysWhatWentWrong}
      submitLabel={t("backups.drill.save")}
      title={t("backups.drill.record")}
    >
      <FormField id="drill-day" label={t("backups.drill.doneOn")}>
        <Input
          id="drill-day"
          max={farmDayOf(new Date())}
          onChange={(event) => setDoneOn(event.target.value)}
          required
          type="date"
          value={doneOn}
        />
      </FormField>
      <FormField id="drill-how" label={t("backups.drill.how")}>
        <NativeSelect
          id="drill-how"
          onChange={(event) =>
            setHow(event.target.value === "badly" ? "badly" : "well")
          }
          value={how}
        >
          <option value="well">{t("backups.drill.wentWell")}</option>
          <option value="badly">{t("backups.drill.wentBadly")}</option>
        </NativeSelect>
      </FormField>
      <FormField
        hint={t("backups.drill.backupUsedHint")}
        id="drill-copy"
        label={t("backups.drill.backupUsed")}
      >
        <Input
          id="drill-copy"
          maxLength={200}
          onChange={(event) => setBackupUsed(event.target.value)}
          value={backupUsed}
        />
      </FormField>
      <FormField
        hint={t("backups.drill.noteHint")}
        id="drill-note"
        label={t("backups.drill.note")}
      >
        <Textarea
          id="drill-note"
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          required={how === "badly"}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/** One drill: its day, who wrote it down, how it went, and its note. */
const DrillRow = ({ drill }: { drill: Drill }) => {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {t("backups.drill.doneBy", {
            day: dayIn(drill.doneOn, language),
            name: drill.recordedByName,
          })}
        </span>
        <StatusBadge tone={drill.wentWell ? "success" : "danger"}>
          {t(
            drill.wentWell
              ? "backups.drill.wentWell"
              : "backups.drill.wentBadly"
          )}
        </StatusBadge>
      </div>
      {drill.backupUsed ? (
        <span className="text-muted-foreground text-xs">
          {t("backups.drill.copyWas", { copy: drill.backupUsed })}
        </span>
      ) : null}
      {drill.note ? (
        <span className="text-sm break-words">{drill.note}</span>
      ) : null}
    </li>
  );
};

/** When the next drill falls due, or that it already has, or that there is no copy yet to restore. */
const NextDrill = ({ drills }: { drills: Drills }) => {
  const { t, language } = useLanguage();
  if (drills.dueOn === null) {
    return <Notice title={t("backups.drill.noCopy")} tone="info" />;
  }
  const day = dayIn(drills.dueOn, language);
  return drills.overdue ? (
    <Notice title={t("backups.drill.overdue", { day })} tone="warning">
      {t("backups.drill.overdueWhat")}
    </Notice>
  ) : (
    <p className="text-sm">{t("backups.drill.dueOn", { day })}</p>
  );
};

/**
 * The quarterly **Restore Drill** on the Backups page: when the next is due — or that it is overdue, as the Owner's
 * notices also say — every drill written down, how each went, and the act to write one down.
 */
export const RestoreDrillSection = () => {
  const { t } = useLanguage();
  const drills = useQuery(orpc.backups.drills.queryOptions());
  const [recording, setRecording] = useState(false);
  return (
    <Section
      action={
        <Button onClick={() => setRecording(true)} variant="outline">
          {t("backups.drill.record")}
        </Button>
      }
      description={t("backups.drill.why")}
      id="restore-drill"
      title={t("backups.drill.title")}
    >
      <Loaded query={drills}>
        {drills.data ? <NextDrill drills={drills.data} /> : null}
        {drills.data?.drills.length ? (
          <ul className="flex flex-col">
            {drills.data.drills.map((drill) => (
              <DrillRow drill={drill} key={drill.id} />
            ))}
          </ul>
        ) : (
          <EmptyState
            bare
            icon={ClipboardCheck}
            title={t("backups.drill.none")}
          />
        )}
      </Loaded>
      <RecordDrill onOpenChange={setRecording} open={recording} />
    </Section>
  );
};
