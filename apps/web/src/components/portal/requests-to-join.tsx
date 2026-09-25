import type { RequestCloseReason, RequestToJoinState } from "@OpenFarm/domain";
import { REQUEST_NOTE_MOST, isLiveRequest } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { Section, StatusBadge } from "@/components/page";
import { FormField } from "@/components/page-kit";
import type { OpenVenture } from "@/components/portal/open-ventures";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** One of the Investor's own Requests to Join, as the portal reads it back to them. */
export type TheirRequest = Awaited<
  ReturnType<typeof orpc.portal.myRequests.call>
>[number];

/** Why the farm would not take a Request, said to the Investor rather than in the Owner's words. */
const REQUEST_REFUSALS = {
  venture_not_shown: "portal.request.refused.notShown",
  venture_past_decide_by: "portal.request.refused.pastDecideBy",
  venture_wrong_state: "portal.request.refused.wrongState",
  investor_retired: "portal.request.refused.retired",
  already_signed_on_venture: "portal.request.refused.alreadySigned",
  units_beyond_venture: "portal.request.refused.beyondVenture",
  request_already_answered: "portal.request.refused.answered",
  request_not_live: "portal.request.refused.notLive",
  no_such_request: "portal.request.refused.noSuch",
  asked_twice_at_once: "portal.request.refused.askedTwice",
} as const satisfies Record<string, MessageKey>;

/** How each place a Request can stand in reads at a glance, to the Investor: a yes is good news here, where on the
 *  Owner's list it is work still to do. */
const STATE_TONE: Record<RequestToJoinState, Tone> = {
  waiting: "info",
  come_and_sign: "success",
  not_this_time: "neutral",
  withdrawn: "neutral",
  signed: "success",
  closed: "neutral",
};

/** Why the farm closed a Request, said to the Investor. */
const CLOSED_WORDS = {
  venture_buying: "portal.requests.closed.venture_buying",
  venture_cancelled: "portal.requests.closed.venture_cancelled",
  taken_out_of_portal: "portal.requests.closed.taken_out_of_portal",
  investor_retired: "portal.requests.closed.investor_retired",
} as const satisfies Record<RequestCloseReason, MessageKey>;

/** Where a Request stands, in the Investor's words. */
const STATE_WORDS = {
  waiting: "portal.requests.state.waiting",
  come_and_sign: "portal.requests.state.come_and_sign",
  not_this_time: "portal.requests.state.not_this_time",
  withdrawn: "portal.requests.state.withdrawn",
  signed: "portal.requests.state.signed",
  closed: "portal.requests.state.closed",
} as const satisfies Record<RequestToJoinState, MessageKey>;

/** Where one of their Requests stands, in their words. */
export const RequestStanding = ({ state }: { state: RequestToJoinState }) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={STATE_TONE[state]}>{t(STATE_WORDS[state])}</StatusBadge>
  );
};

/**
 * The farm's answer to one of their Requests, as they read it: after a yes, the Units the farm will sign and whom to
 * call to arrange it; after a no, that it is not this time, and the Owner's line if she wrote one; and for one the farm
 * closed, why. Nothing for a Request nobody has answered.
 */
const TheAnswer = ({ one }: { one: TheirRequest }) => {
  const { t, language } = useLanguage();
  const me = useQuery(orpc.portal.me.queryOptions());
  // An answer this phone kept from before the farm could answer has neither.
  const promised = one.answeredUnits ?? null;
  const line = one.answerLine ?? null;
  if (one.state === "come_and_sign" && promised !== null) {
    const farm = me.data?.farm;
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">
          {t("portal.request.willSign", {
            units: formatNumber(promised, language),
          })}
        </p>
        <p>
          {farm?.phone
            ? t("portal.request.callToSign", {
                farm: farm.name,
                phone: farm.phone,
              })
            : t("portal.request.callTheFarm")}
        </p>
      </div>
    );
  }
  // An answer this phone kept from before the farm closed Requests has no reason.
  const closedBecause = one.closedBecause ?? null;
  if (one.state === "closed" && closedBecause !== null) {
    return (
      <p className="text-muted-foreground text-sm">
        {t(CLOSED_WORDS[closedBecause])}
      </p>
    );
  }
  if (one.state === "not_this_time") {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{t("portal.request.notThisTime")}</p>
        {line ? <p className="border-l-2 pl-3 break-words">{line}</p> : null}
      </div>
    );
  }
  return null;
};

/**
 * Asking to join, or changing what was asked: whole Units, the taka they come to, a note, and — before anything is
 * sent — that it binds nobody. A Request still waiting can be withdrawn from here too.
 */
const RequestForm = ({
  one,
  live,
}: {
  one: OpenVenture;
  live: TheirRequest | null;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const refused = useRefused(REQUEST_REFUSALS);
  const [units, setUnits] = useState(live ? String(live.units) : "");
  const [note, setNote] = useState(live?.note ?? "");
  const ask = useMutation(
    orpc.portal.requestToJoin.mutationOptions({
      onError: refused,
      onSuccess: () =>
        toast.success(
          live ? t("portal.request.changed") : t("portal.request.sent")
        ),
    })
  );
  const withdraw = useMutation(
    orpc.portal.withdrawRequest.mutationOptions({
      onError: refused,
      onSuccess: () => toast.success(t("portal.request.withdrawn")),
    })
  );
  const asked = Number(units);
  const whole = units !== "" && Number.isInteger(asked) && asked >= 1;
  const waiting = live?.state === "waiting";
  return (
    <Section
      description={t("portal.request.bindsNobody")}
      title={t("portal.request.title")}
    >
      <form
        className="flex max-w-md flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (whole) {
            ask.mutate({ ventureId: one.id, units: asked, note });
          }
        }}
      >
        {live ? (
          <div className="flex flex-col gap-2 text-sm">
            <RequestStanding state={live.state} />
            <p>
              {t("portal.request.yours", {
                units: formatNumber(live.units, language),
                taka: taka(live.bdt),
                // When it last said this, which is when it was made until they change it.
                day: formatDate(new Date(live.changedAt), language, "date"),
              })}
            </p>
            <TheAnswer one={live} />
            {waiting ? null : (
              <p className="text-muted-foreground text-xs">
                {t("portal.request.stillWithdraw")}
              </p>
            )}
          </div>
        ) : null}
        {live && !waiting ? null : (
          <>
            <FormField
              hint={
                whole
                  ? t("portal.request.comesTo", {
                      units: formatNumber(asked, language),
                      taka: taka(asked * one.unitPriceBdt),
                    })
                  : undefined
              }
              id="request-units"
              label={t("portal.request.units")}
            >
              <Input
                className="max-w-32"
                id="request-units"
                inputMode="numeric"
                min={1}
                onChange={(event) => setUnits(event.target.value)}
                step={1}
                type="number"
                value={units}
              />
            </FormField>
            <FormField id="request-note" label={t("portal.request.note")}>
              <Textarea
                id="request-note"
                maxLength={REQUEST_NOTE_MOST}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("portal.request.notePlaceholder")}
                rows={2}
                value={note}
              />
            </FormField>
            <p className="text-muted-foreground text-xs">
              {t("portal.request.untilAnswered")}
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {live && !waiting ? null : (
            <Button disabled={!whole || ask.isPending} type="submit">
              <Send aria-hidden data-icon="inline-start" />
              {live ? t("portal.request.change") : t("portal.request.send")}
            </Button>
          )}
          {live ? (
            <Button
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate({ requestId: live.id })}
              type="button"
              variant="outline"
            >
              <Undo2 aria-hidden data-icon="inline-start" />
              {t("portal.request.withdraw")}
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
};

/**
 * Their Request on one offered Venture: the form to ask while it takes requests, and what they asked while one is
 * live. Drawn afresh for each Request, so what the form starts from is the Request as the farm holds it.
 */
export const AskToJoin = ({ one }: { one: OpenVenture }) => {
  const { t } = useLanguage();
  const mine = useQuery(orpc.portal.myRequests.queryOptions());
  if (mine.isPending) {
    return null;
  }
  // An answer this phone kept from before Requests existed has none: read as nothing asked yet.
  const onThis = (mine.data ?? []).filter((each) => each.ventureId === one.id);
  const live = onThis.find((each) => isLiveRequest(each.state)) ?? null;
  // After "not this time" the answer stands, and there is nothing more to ask here.
  const toldNo = onThis.find((each) => each.state === "not_this_time");
  if (toldNo && !live) {
    return (
      <Section title={t("portal.request.title")}>
        <div className="flex flex-col gap-2">
          <RequestStanding state={toldNo.state} />
          <TheAnswer one={toldNo} />
        </div>
      </Section>
    );
  }
  if (!(live || one.takingRequests)) {
    return null;
  }
  return <RequestForm key={live?.id ?? "new"} live={live} one={one} />;
};

/**
 * Withdrawing a Request from the list of them, for one still live: it binds nobody, and a yes on a Venture taken out
 * of the portal has no page of its own left to withdraw it from.
 */
const WithdrawFromTheList = ({ requestId }: { requestId: string }) => {
  const { t } = useLanguage();
  const refused = useRefused(REQUEST_REFUSALS);
  const withdraw = useMutation(
    orpc.portal.withdrawRequest.mutationOptions({
      onError: refused,
      onSuccess: () => toast.success(t("portal.request.withdrawn")),
    })
  );
  return (
    <Button
      className="w-fit"
      disabled={withdraw.isPending}
      onClick={() => withdraw.mutate({ requestId })}
      size="sm"
      type="button"
      variant="outline"
    >
      <Undo2 aria-hidden data-icon="inline-start" />
      {t("portal.request.withdraw")}
    </Button>
  );
};

/**
 * Their Requests to Join on their home page, the latest first, and where each stands — only when there are any. One on
 * a Venture still offered leads to it, where it can be changed; any still live can be withdrawn from here.
 */
export const TheirRequestsOnHome = () => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const mine = useQuery(orpc.portal.myRequests.queryOptions());
  const offered = useQuery(orpc.portal.openVentures.queryOptions());
  const requests = mine.data ?? [];
  if (requests.length === 0) {
    return null;
  }
  const stillOffered = new Set((offered.data ?? []).map((one) => one.id));
  return (
    <Section
      description={t("portal.requests.hint")}
      title={t("portal.requests.title")}
    >
      <ul className="divide-border -my-3 flex flex-col divide-y">
        {requests.map((one) => (
          <li
            className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            key={one.id}
          >
            <div className="flex min-w-0 flex-col gap-1">
              {stillOffered.has(one.ventureId) ? (
                <Link
                  className="font-medium break-words hover:underline"
                  params={{ ventureId: one.ventureId }}
                  to="/portal/open/$ventureId"
                >
                  {one.ventureName}
                </Link>
              ) : (
                <span className="font-medium break-words">
                  {one.ventureName}
                </span>
              )}
              <span className="text-sm tabular-nums">
                {t("portal.requests.line", {
                  units: formatNumber(one.units, language),
                  taka: taka(one.bdt),
                })}
              </span>
              {one.note ? (
                <span className="text-muted-foreground text-sm break-words">
                  {one.note}
                </span>
              ) : null}
              <TheAnswer one={one} />
              {isLiveRequest(one.state) ? (
                <WithdrawFromTheList requestId={one.id} />
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:items-end">
              <RequestStanding state={one.state} />
              <span className="text-muted-foreground text-xs">
                <SaidDate at={one.changedAt} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
};
