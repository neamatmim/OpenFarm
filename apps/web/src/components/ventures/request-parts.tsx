import type { RequestCloseReason, RequestToJoinState } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";

import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { orpc } from "@/utils/orpc";

// A Request to Join as the Owner reads it, wherever she reads it: on the Venture it was made on, beside the other
// Requests there, or on the page of the Investor who made it, beside their others. The words, the tones and the two
// halves of a row are one set, so the two lists cannot come to say the same Request differently.

type ARequest = Awaited<
  ReturnType<typeof orpc.ventures.requests.call>
>["requests"][number];

/** Where on a Venture's page its Requests are, as an address names them: the Owner's Notice and an Investor's page
 *  both lead here. */
export const REQUESTS_ANCHOR = "requests";

/** How each place a Request can stand in reads at a glance, from the Owner's side: one waiting is work for her, where
 *  to the Investor it is only news to wait for. */
export const STATE_TONE: Record<RequestToJoinState, Tone> = {
  waiting: "warning",
  come_and_sign: "info",
  not_this_time: "neutral",
  withdrawn: "neutral",
  signed: "success",
  closed: "neutral",
};

/** Where a Request stands, in the Owner's words. */
export const STATE_WORDS = {
  waiting: "ventures.requests.state.waiting",
  come_and_sign: "ventures.requests.state.come_and_sign",
  not_this_time: "ventures.requests.state.not_this_time",
  withdrawn: "ventures.requests.state.withdrawn",
  signed: "ventures.requests.state.signed",
  closed: "ventures.requests.state.closed",
} as const satisfies Record<RequestToJoinState, MessageKey>;

/** Why the farm closed a Request, in the Owner's words. */
export const CLOSED_WORDS = {
  venture_buying: "ventures.requests.closed.venture_buying",
  venture_cancelled: "ventures.requests.closed.venture_cancelled",
  taken_out_of_portal: "ventures.requests.closed.taken_out_of_portal",
  investor_retired: "ventures.requests.closed.investor_retired",
} as const satisfies Record<RequestCloseReason, MessageKey>;

/** What the Investor did, beneath their Request, and in the Owner's list of what they did in the portal. */
export const KIND_WORDS = {
  made: "ventures.requests.kind.made",
  changed: "ventures.requests.kind.changed",
  withdrawn: "ventures.requests.kind.withdrawn",
} as const satisfies Record<ARequest["history"][number]["kind"], MessageKey>;

/** The parts of a Request both lists say. */
type Said = Pick<
  ARequest,
  | "units"
  | "bdt"
  | "note"
  | "state"
  | "answeredUnits"
  | "answerLine"
  | "closedBecause"
  | "madeAt"
>;

/**
 * What was asked and what came of it: the Units and the taka they come to, their note, the Units the Owner said yes to
 * — said on a yes withdrawn since, too, because what was promised is part of the story — why the farm closed it, and
 * the Owner's line after "not this time".
 */
export const WhatTheyAsked = ({ one }: { one: Said }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  // An answer this phone kept from before the Owner could answer, or the farm close, has none of these.
  const promised = one.answeredUnits ?? null;
  const line = one.answerLine ?? null;
  const closedBecause = one.closedBecause ?? null;
  return (
    <>
      <span className="text-sm tabular-nums">
        {t("ventures.requests.unitsAndTaka", {
          units: formatNumber(one.units, language),
          taka: taka(one.bdt),
        })}
      </span>
      {one.note ? (
        <span className="text-sm break-words">
          <span className="text-muted-foreground">
            {`${t("ventures.requests.col.note")}: `}
          </span>
          {one.note}
        </span>
      ) : null}
      {promised === null ? null : (
        <span className="text-sm font-medium">
          {t("ventures.requests.answer.saidYes", {
            units: formatNumber(promised, language),
          })}
        </span>
      )}
      {closedBecause === null ? null : (
        <span className="text-muted-foreground text-sm">
          {t(CLOSED_WORDS[closedBecause])}
        </span>
      )}
      {one.state === "not_this_time" && line ? (
        <span className="border-l-2 pl-2 text-sm break-words">{line}</span>
      ) : null}
    </>
  );
};

/** Where it stands now, and when it was asked. */
export const WhereItStands = ({ one }: { one: Said }) => {
  const { t } = useLanguage();
  return (
    <div className="flex shrink-0 flex-col gap-1 sm:items-end">
      <StatusBadge tone={STATE_TONE[one.state]}>
        {t(STATE_WORDS[one.state])}
      </StatusBadge>
      <span className="text-muted-foreground text-xs">
        {`${t("ventures.requests.col.when")}: `}
        <SaidDate at={one.madeAt} withTime />
      </span>
    </div>
  );
};
