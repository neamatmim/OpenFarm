import type { RequestCloseReason, RequestToJoinState } from "@OpenFarm/domain";
import { REQUEST_NOTE_MOST, isLiveRequest } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, PenLine, RotateCw, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { MORE_LINK } from "@/components/home/queue";
import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { ConfirmDialog, FormField } from "@/components/page-kit";
import type { OpenVenture } from "@/components/portal/open-ventures";
import { ListSkeleton } from "@/components/portal/portal-skeletons";
import {
  WhyNot,
  useCanAct,
  usePortalPlaces,
  useTheirOpenVentures,
  useTheirRecord,
  useTheirRequests,
} from "@/components/portal/portal-source";
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
  const me = useTheirRecord();
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

/** What they asked before on this Venture and let go, or the farm closed: one line, with the day it ended. */
const EarlierRequest = ({ earlier }: { earlier: TheirRequest }) => {
  const { t, language } = useLanguage();
  return (
    <p className="text-muted-foreground text-sm">
      {t("portal.request.earlier", {
        units: earlier.units,
        state: t(STATE_WORDS[earlier.state]),
        day: formatDate(new Date(earlier.changedAt), language, "date"),
      })}
    </p>
  );
};

/**
 * Asking to join, or changing what was asked: whole Units, the taka they come to, a note, and — before anything is
 * sent — that it binds nobody. A Request still waiting can be withdrawn from here too.
 */
const RequestForm = ({
  one,
  live,
  earlier,
}: {
  one: OpenVenture;
  live: TheirRequest | null;
  /** Their latest Request on it that is no longer live — withdrawn, or closed — said above a fresh form; none while
   *  one is live. */
  earlier: TheirRequest | null;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const acting = useCanAct();
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
      {earlier ? <EarlierRequest earlier={earlier} /> : null}
      <form
        className="flex max-w-md flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (whole && acting.can) {
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
          <fieldset className="contents" disabled={!acting.can}>
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
          </fieldset>
        )}
        <div className="flex flex-wrap gap-2">
          {live && !waiting ? null : (
            <Button
              disabled={!whole || ask.isPending || !acting.can}
              type="submit"
            >
              <Send aria-hidden data-icon="inline-start" />
              {live ? t("portal.request.change") : t("portal.request.send")}
            </Button>
          )}
          {live ? (
            <Button
              disabled={withdraw.isPending || !acting.can}
              onClick={() => withdraw.mutate({ requestId: live.id })}
              type="button"
              variant="outline"
            >
              <Undo2 aria-hidden data-icon="inline-start" />
              {t("portal.request.withdraw")}
            </Button>
          ) : null}
        </div>
        <WhyNot acting={acting} />
      </form>
    </Section>
  );
};

/** Their Requests could not be read: said, with a way to ask again, rather than read as none. */
const RequestsFailed = ({ retry }: { retry: () => unknown }) => {
  const { t } = useLanguage();
  return (
    <Notice
      action={
        <Button onClick={() => retry()} size="sm" variant="outline">
          <RotateCw aria-hidden data-icon="inline-start" />
          {t("outbox.retry")}
        </Button>
      }
      title={t("portal.requests.failed")}
      tone="warning"
    />
  );
};

/**
 * Their Request on one offered Venture: the form to ask while it takes requests, and what they asked while one is
 * live. Drawn afresh for each Request, so what the form starts from is the Request as the farm holds it.
 */
export const AskToJoin = ({ one }: { one: OpenVenture }) => {
  const { t } = useLanguage();
  const mine = useTheirRequests();
  if (mine.isPending) {
    return null;
  }
  // Unread, a blank form would ask again over a Request already made.
  if (mine.isError && mine.data === undefined) {
    return <RequestsFailed retry={mine.refetch} />;
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
  // What they asked before and let go, or the farm closed: said, so a fresh form does not read as their first.
  const [earlier] = onThis
    .filter((each) => each.state === "withdrawn" || each.state === "closed")
    .toSorted(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
    );
  return (
    <RequestForm
      earlier={live ? null : (earlier ?? null)}
      key={live?.id ?? "new"}
      live={live}
      one={one}
    />
  );
};

/**
 * Withdrawing a Request from the list of them, for one still live, asked about first: it binds nobody, and a yes on a
 * Venture taken out of the portal has no page of its own left to withdraw it from.
 */
const WithdrawFromTheList = ({ requestId }: { requestId: string }) => {
  const { t } = useLanguage();
  const acting = useCanAct();
  const refused = useRefused(REQUEST_REFUSALS);
  const [asking, setAsking] = useState(false);
  const withdraw = useMutation(
    orpc.portal.withdrawRequest.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("portal.request.withdrawn"));
      },
    })
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        className="w-fit"
        disabled={withdraw.isPending || !acting.can}
        onClick={() => setAsking(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Undo2 aria-hidden data-icon="inline-start" />
        {t("portal.request.withdraw")}
      </Button>
      <WhyNot acting={acting} />
      <ConfirmDialog
        confirmLabel={t("portal.request.withdraw")}
        description={t("portal.request.withdrawWhy")}
        onConfirm={() => withdraw.mutate({ requestId })}
        onOpenChange={setAsking}
        open={asking}
        pending={withdraw.isPending}
        title={t("portal.request.withdrawTitle")}
      />
    </div>
  );
};

const LINKED_NAME = "font-medium break-words hover:underline";

/**
 * The Venture's name on one of their Requests, leading where there is something to read or do: signed, to the
 * Agreement that answered it; still offered, to where it can be changed. A list this phone kept from before the farm
 * sent `agreementId` has none, and leads where it did before.
 */
const RequestVentureName = ({
  one,
  stillOffered,
}: {
  one: TheirRequest;
  stillOffered: boolean;
}) => {
  const places = usePortalPlaces();
  if (one.agreementId) {
    const { to, params } = places.venture(one.agreementId).link;
    return (
      <Link className={LINKED_NAME} params={params} to={to}>
        {one.ventureName}
      </Link>
    );
  }
  if (stillOffered) {
    const { to, params } = places.openVenture(one.ventureId).link;
    return (
      <Link className={LINKED_NAME} params={params} to={to}>
        {one.ventureName}
      </Link>
    );
  }
  return <span className="font-medium break-words">{one.ventureName}</span>;
};

/** Their Requests the latest-changed first: a Request moves up when the farm answers it or they change it. */
const byLatestChange = (requests: readonly TheirRequest[]) =>
  requests.toSorted(
    (a, b) =>
      new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime() ||
      a.id.localeCompare(b.id)
  );

/** The three steps a Request goes through, and how far this one has got: asked, answered, signed. */
const STEPS = ["asked", "answered", "signed"] as const;

const STEP_WORDS = {
  asked: "portal.requests.step.asked",
  answered: "portal.requests.step.answered",
  signed: "portal.requests.step.signed",
} as const satisfies Record<(typeof STEPS)[number], MessageKey>;

/** How many of the steps it has taken: every Request has been asked; a yes or a no is an answer; signed is all three. */
const stepsTaken = (state: RequestToJoinState) => {
  if (state === "signed") {
    return 3;
  }
  return state === "come_and_sign" || state === "not_this_time" ? 2 : 1;
};

/**
 * Where a Request is on its way, as three marks in a row — for one still on it: a withdrawn or closed Request has left
 * the road, and its badge says so.
 */
const RequestTrack = ({ state }: { state: RequestToJoinState }) => {
  const { t } = useLanguage();
  if (state === "withdrawn" || state === "closed") {
    return null;
  }
  const taken = stepsTaken(state);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEPS.map((step, at) => {
        const done = at < taken;
        return (
          <li className="flex items-center gap-2" key={step}>
            {at > 0 ? (
              <span
                aria-hidden
                className={cn("h-px w-6", done ? "bg-primary" : "bg-border")}
              />
            ) : null}
            <span
              className={cn(
                "flex items-center gap-1.5",
                done ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  done ? "bg-primary" : "border-muted-foreground/40 border"
                )}
              />
              {t(STEP_WORDS[step])}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/** One thing that happened to a Request, as its history says it. */
interface Happened {
  at: Date | string;
  said: string;
}

/**
 * What happened to a Request, oldest first: each thing they did to it, with the Units it then said, and when the farm
 * answered or closed it. Folded away under its count, since the card above already says where it stands.
 */
const RequestHistory = ({ one }: { one: TheirRequest }) => {
  const { t } = useLanguage();
  // An answer this phone kept from before the farm sent the history has none, and says nothing here.
  const theirs: Happened[] = (one.history ?? []).map((each) => ({
    at: each.at,
    said:
      each.kind === "withdrawn"
        ? t("portal.requests.history.withdrawn")
        : t(
            each.kind === "made"
              ? "portal.requests.history.made"
              : "portal.requests.history.changed",
            { units: each.units }
          ),
  }));
  const farms: Happened[] = [];
  const answeredAt = one.answeredAt ?? null;
  if (answeredAt && (one.state === "come_and_sign" || one.state === "signed")) {
    farms.push({ at: answeredAt, said: t("portal.requests.history.yes") });
  }
  if (answeredAt && one.state === "not_this_time") {
    farms.push({ at: answeredAt, said: t("portal.requests.history.no") });
  }
  const closedAt = one.closedAt ?? null;
  if (closedAt) {
    farms.push({ at: closedAt, said: t("portal.requests.history.closed") });
  }
  const all = [...theirs, ...farms].toSorted(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  if (all.length === 0) {
    return null;
  }
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer">
        {t("portal.requests.history")}
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5 border-l pl-3">
        {all.map((each, at) => (
          <li
            className="flex flex-wrap justify-between gap-x-4"
            // oxlint-disable-next-line no-array-index-key -- a history's order is its identity
            key={at}
          >
            <span>{each.said}</span>
            <span className="text-muted-foreground text-xs">
              <SaidDate at={each.at} withTime />
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
};

/** One fact of a Request, under its name. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium tabular-nums">{children}</dd>
  </div>
);

/**
 * One of their Requests as a card: the Venture and where it stands, how far it has got, what they asked and when, their
 * note, the farm's answer, what happened to it, and what they may still do — change it where the Venture is still
 * offered and nobody has answered, withdraw it while it is live.
 */
const RequestCard = ({
  one,
  stillOffered,
}: {
  one: TheirRequest;
  stillOffered: boolean;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const places = usePortalPlaces();
  const live = isLiveRequest(one.state);
  const changeable = one.state === "waiting" && stillOffered;
  const offer = places.openVenture(one.ventureId).link;
  return (
    <li className="surface flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-base">
          <RequestVentureName one={one} stillOffered={stillOffered} />
        </span>
        <RequestStanding state={one.state} />
      </div>
      <RequestTrack state={one.state} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Fact label={t("portal.units")}>
          {formatNumber(one.units, language)}
        </Fact>
        <Fact label={t("portal.requests.comesTo")}>{taka(one.bdt)}</Fact>
        <Fact label={t("portal.requests.askedOn")}>
          <SaidDate at={one.madeAt} />
        </Fact>
        <Fact label={t("portal.requests.lastChange")}>
          <SaidDate at={one.changedAt} />
        </Fact>
      </dl>
      {one.note ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t("portal.requests.yourNote")}
          </span>
          <p className="border-l-2 pl-3 break-words">{one.note}</p>
        </div>
      ) : null}
      {one.state === "waiting" || one.state === "withdrawn" ? null : (
        <div className="bg-muted/50 rounded-lg p-3">
          <TheAnswer one={one} />
        </div>
      )}
      <RequestHistory one={one} />
      {live ? (
        <div className="flex flex-wrap items-start gap-2 border-t pt-3">
          {changeable ? (
            <Button
              render={<Link params={offer.params} to={offer.to} />}
              size="sm"
              variant="outline"
            >
              <PenLine aria-hidden data-icon="inline-start" />
              {t("portal.request.change")}
            </Button>
          ) : null}
          <WithdrawFromTheList requestId={one.id} />
        </div>
      ) : null}
    </li>
  );
};

/** Some of their Requests to Join as cards, the latest-changed first. */
const RequestList = ({ requests }: { requests: readonly TheirRequest[] }) => {
  const offered = useTheirOpenVentures();
  const stillOffered = new Set((offered.data ?? []).map((one) => one.id));
  return (
    <ul className="flex flex-col gap-3">
      {byLatestChange(requests).map((one) => (
        <RequestCard
          key={one.id}
          one={one}
          stillOffered={stillOffered.has(one.ventureId)}
        />
      ))}
    </ul>
  );
};

/**
 * The farm's yes, at the top of their home: the one answer they have to act on — call the farm and come and sign —
 * rather than below their figures. One Notice a Venture; nothing while there is none.
 */
export const ComeAndSign = () => {
  const { t } = useLanguage();
  const mine = useTheirRequests();
  const yeses = (mine.data ?? []).filter(
    (one) => one.state === "come_and_sign"
  );
  if (yeses.length === 0) {
    return null;
  }
  return (
    <>
      {yeses.map((one) => (
        <Notice
          icon={PenLine}
          key={one.id}
          title={t("portal.requests.comeAndSign", { venture: one.ventureName })}
          tone="success"
        >
          <TheAnswer one={one} />
        </Notice>
      ))}
    </>
  );
};

/**
 * Their live Requests on their home page — waiting for the farm, or told to come and sign — with the way to every
 * Request they have made. Nothing while none is live; answered and closed ones are read on their own page.
 */
export const TheirRequestsOnHome = () => {
  const { t } = useLanguage();
  const mine = useTheirRequests();
  const { requests } = usePortalPlaces();
  if (mine.isError && mine.data === undefined) {
    return <RequestsFailed retry={mine.refetch} />;
  }
  const all = mine.data ?? [];
  const live = all.filter((one) => isLiveRequest(one.state));
  if (live.length === 0) {
    return null;
  }
  return (
    <Section
      action={
        <Link
          className={cn(MORE_LINK, "text-sm")}
          params={requests.link.params}
          to={requests.link.to}
        >
          {t("portal.requests.all")}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
      description={t("portal.requests.hint")}
      plain
      title={t("portal.requests.title")}
    >
      <RequestList requests={live} />
    </Section>
  );
};

/**
 * «যোগ দেওয়ার অনুরোধ»: every Request to Join they have made, those still live first — waiting for the farm, or told
 * to come and sign — and then those answered, withdrawn, signed or closed, kept so "I only asked for four" has an
 * answer. A place of its own, because a home page listing every Request ever made would bury the live one.
 */
export const PortalRequestsPage = () => {
  const { t } = useLanguage();
  const mine = useTheirRequests();
  const { openVentures } = usePortalPlaces();
  const all = mine.data ?? [];
  const live = all.filter((one) => isLiveRequest(one.state));
  const past = all.filter((one) => !isLiveRequest(one.state));
  return (
    <Page>
      <PageHeader
        description={t("portal.requests.hint")}
        title={t("portal.requests.title")}
      />
      <Loaded query={mine} skeleton={<ListSkeleton lines={3} />}>
        {all.length === 0 ? (
          <EmptyState
            action={
              <Link
                className={cn(MORE_LINK, "text-sm")}
                params={openVentures.link.params}
                to={openVentures.link.to}
              >
                {t("portal.open.title")}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            }
            description={t("portal.requests.noneHint")}
            icon={Send}
            title={t("portal.requests.none")}
          />
        ) : (
          <>
            {live.length > 0 ? (
              <Section plain title={t("portal.requests.live")}>
                <RequestList requests={live} />
              </Section>
            ) : null}
            {past.length > 0 ? (
              <Section plain title={t("portal.requests.past")}>
                <RequestList requests={past} />
              </Section>
            ) : null}
          </>
        )}
      </Loaded>
    </Page>
  );
};
