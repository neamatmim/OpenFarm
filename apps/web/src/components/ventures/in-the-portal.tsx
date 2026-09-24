import { farmDayOf } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { EyeOff, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** The most the farm keeps of the Owner's words on a Venture. */
const MOST_WORDS = 500;

/**
 * The Owner's words on a Venture for the portal, asked for as they show it or change them — with the warning beside
 * the box, because an Investor reads a screen as a promise and the words are the one thing on it the farm did not
 * lay out.
 */
const WordsSheet = ({
  venture,
  showing,
  open,
  onOpenChange,
}: {
  venture: Venture;
  /** Showing it for the first time, rather than changing what it already says. */
  showing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [words, setWords] = useState(venture.portalWords ?? "");
  const done = (said: string) => () => {
    onOpenChange(false);
    toast.success(said);
  };
  const show = useMutation(
    orpc.ventures.showInPortal.mutationOptions({
      onError: refused,
      onSuccess: done(t("ventures.portal.nowShown")),
    })
  );
  const change = useMutation(
    orpc.ventures.changePortalWords.mutationOptions({
      onError: refused,
      onSuccess: done(t("ventures.portal.wordsSaved")),
    })
  );
  const label = showing
    ? t("ventures.portal.show")
    : t("ventures.portal.changeWords");
  return (
    <FormSheet
      description={showing ? t("ventures.portal.showHint") : undefined}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        (showing ? show : change).mutate({ id: venture.id, words })
      }
      open={open}
      pending={show.isPending || change.isPending}
      ready
      submitLabel={label}
      title={label}
    >
      <FormField
        hint={t("ventures.portal.wordsHint")}
        id="portal-words"
        label={t("ventures.portal.words")}
      >
        <Textarea
          id="portal-words"
          maxLength={MOST_WORDS}
          onChange={(event) => setWords(event.target.value)}
          rows={3}
          value={words}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * Whether an Open Venture is shown to the farm's invited Investors, the Owner's words on it, and the acts that
 * change either (ADR 0008). Every invited Investor sees it or nobody does. Past its decide-by day it can no longer be
 * shown, and says so rather than offering a button that would only be refused.
 */
export const InThePortal = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [sheet, setSheet] = useState<"show" | "words" | null>(null);
  const takeOut = useMutation(
    orpc.ventures.takeOutOfPortal.mutationOptions({
      onError: refused,
      onSuccess: () => toast.success(t("ventures.portal.takenOut")),
    })
  );
  // An answer this phone kept from before the portal existed has neither: read as not shown, with no words.
  const shown = venture.shownInPortal ?? false;
  const words = venture.portalWords ?? null;
  const pastDecideBy = farmDayOf(new Date()) > venture.decideBy;
  return (
    <Section title={t("ventures.portal.title")}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          {shown ? t("ventures.portal.shown") : t("ventures.portal.notShown")}
        </p>
        {shown ? (
          <p
            className={
              words ? "border-l-2 pl-3 break-words" : "text-muted-foreground"
            }
          >
            {words ?? t("ventures.portal.noWords")}
          </p>
        ) : null}
        {!shown && pastDecideBy ? (
          <p className="text-muted-foreground">
            {t("ventures.portal.pastDecideBy")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {shown ? (
            <>
              <Button
                onClick={() => setSheet("words")}
                size="sm"
                variant="outline"
              >
                <Pencil aria-hidden />
                {t("ventures.portal.changeWords")}
              </Button>
              <Button
                disabled={takeOut.isPending}
                onClick={() => takeOut.mutate({ id: venture.id })}
                size="sm"
                variant="outline"
              >
                <EyeOff aria-hidden />
                {t("ventures.portal.takeOut")}
              </Button>
            </>
          ) : null}
          {!shown && !pastDecideBy ? (
            <Button onClick={() => setSheet("show")} size="sm">
              <Send aria-hidden />
              {t("ventures.portal.show")}
            </Button>
          ) : null}
        </div>
      </div>
      {sheet ? (
        <WordsSheet
          onOpenChange={(open) => setSheet(open ? sheet : null)}
          open
          showing={sheet === "show"}
          venture={venture}
        />
      ) : null}
    </Section>
  );
};
