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

/** The longest note the farm keeps with a Request. */
const MOST_NOTE = 300;

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
} as const satisfies Record<string, MessageKey>;

/** How each place a Request can stand in reads at a glance. */
const STATE_TONE: Record<TheirRequest["state"], Tone> = {
  waiting: "info",
  come_and_sign: "success",
  not_this_time: "neutral",
  withdrawn: "neutral",
  signed: "success",
  closed: "neutral",
};

/** Where one of their Requests stands, in their words. */
export const RequestStanding = ({
  state,
}: {
  state: TheirRequest["state"];
}) => {
  const { t } = useLanguage();
  return (
    <StatusBadge tone={STATE_TONE[state]}>
      {t(`portal.requests.state.${state}` as MessageKey)}
    </StatusBadge>
  );
};

/** Whether a Request is still waiting on somebody: the one an Investor may have on a Venture at a time. */
const isLive = (one: TheirRequest) =>
  one.state === "waiting" || one.state === "come_and_sign";

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
                day: formatDate(new Date(live.madeAt), language, "date"),
              })}
            </p>
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
                maxLength={MOST_NOTE}
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
  const mine = useQuery(orpc.portal.myRequests.queryOptions());
  if (mine.isPending) {
    return null;
  }
  // An answer this phone kept from before Requests existed has none: read as nothing asked yet.
  const live =
    (mine.data ?? []).find(
      (each) => each.ventureId === one.id && isLive(each)
    ) ?? null;
  if (!(live || one.takingRequests)) {
    return null;
  }
  return <RequestForm key={live?.id ?? "new"} live={live} one={one} />;
};

/**
 * Their Requests to Join on their home page, the latest first, and where each stands — only when there are any. One on
 * a Venture still offered leads to it, where it can be changed or withdrawn.
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
