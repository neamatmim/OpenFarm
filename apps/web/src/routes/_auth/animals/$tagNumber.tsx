import type {
  CalvingEase,
  Disposal,
  MortalityKind,
  PregnancyCheckResult,
  TargetWindow,
} from "@OpenFarm/domain";
import {
  DISPOSALS,
  MORTALITY_KINDS,
  allowedNextStates,
  farmDayOf,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Beef,
  Camera,
  ChevronLeft,
  Lock,
  MapPin,
  Milk,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import {
  CorrectionChoice,
  CorrectionDialog,
  CorrectionField,
  useCorrecting,
} from "@/components/correction-dialog";
import { WhatSheCost } from "@/components/costs";
import type { Course } from "@/components/course";
import { CourseLine } from "@/components/course";
import { TwoProjections } from "@/components/gain";
import { EmptyState, Page, Section, StatusBadge } from "@/components/page";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { ReportSighting } from "@/components/report-sighting";
import { SaleCorrection } from "@/components/sale-correction";
import { VetCases } from "@/components/vet-cases";
import { useLanguage } from "@/i18n/language-provider";
import { choice, figure, person, words } from "@/lib/correcting";
import { wordedRefusal } from "@/lib/correction-refusal";
import { causeWord, disposalWord } from "@/lib/mortality-words";
import { queueMove } from "@/lib/record-offline";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

const PHOTO_MAX_BYTES = 1_500_000;

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    ""
  );
  return btoa(binary);
};

type AnimalDetail = NonNullable<
  Awaited<ReturnType<typeof orpc.animals.byTag.call>>
>;

const AnimalHeader = ({ detail }: { detail: AnimalDetail }) => {
  const { t } = useLanguage();
  const hasAliases = detail.aliases.length !== 0;
  return (
    <header className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center md:p-6">
      <AnimalPhoto
        photoUpdatedAt={detail.photoUpdatedAt}
        size={96}
        tagNumber={detail.tagNumber}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-3xl font-bold tabular-nums md:text-4xl">
            {detail.tagNumber}
          </h1>
          <StatusBadge tone="neutral">{t(`state.${detail.state}`)}</StatusBadge>
          {detail.underMilkWithdrawal ? (
            <StatusBadge icon={Lock} tone="warning">
              {t("animals.milkHeld")}
            </StatusBadge>
          ) : null}
          {detail.underMeatWithdrawal ? (
            <StatusBadge icon={Lock} tone="warning">
              {t("animals.meatHeld")}
            </StatusBadge>
          ) : null}
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1">
            {detail.side === "dairy" ? (
              <Milk aria-hidden className="size-4" />
            ) : (
              <Beef aria-hidden className="size-4" />
            )}
            {t(`animals.side.${detail.side}`)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-4" />
            {detail.pen.shed.name} / {detail.pen.name}
          </span>
          {detail.breed ? <span>{detail.breed}</span> : null}
        </p>
        {hasAliases || detail.officialTag ? (
          <p className="text-muted-foreground text-sm">
            {detail.officialTag
              ? `${t("animals.officialTag")}: ${detail.officialTag}`
              : ""}
            {detail.officialTag && hasAliases ? " · " : ""}
            {hasAliases
              ? `${t("animals.aliases")}: ${detail.aliases.join(", ")}`
              : ""}
          </p>
        ) : null}
        <HerMother dam={detail.dam} />
      </div>
    </header>
  );
};

/** Where a sighting came from: the round's work, or somebody reporting it — with what they said. */
const SeenWhere = ({
  instanceId,
  note,
}: {
  instanceId: string | null;
  note: string | null;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {instanceId ? (
        <Link
          className="underline"
          params={{ instanceId }}
          to="/work/$instanceId"
        >
          {t("animals.moveFromWork")}
        </Link>
      ) : (
        t("sighting.reported")
      )}
      {note ? ` · “${note}”` : ""}
    </>
  );
};

/** A person's Scope under each Role they hold, as `people.me` tells a screen. */
type MeScopes = Awaited<ReturnType<typeof client.people.me>>["scopes"];

/** The Pens in somebody's Scope — none for a Scope that is the farm, which is not narrowed to any, or their Cases. */
const pensOf = (scope: MeScopes[keyof MeScopes]): readonly string[] =>
  scope && "penIds" in scope ? scope.penIds : [];

/** The farm's Pens to move her to, once it is known the reader may see them: a visiting Vet moves nobody, and does
 *  not see the farm's layout. */
const usePens = (me: { scopes: MeScopes } | undefined) => {
  // Only somebody here only on a visit is kept from them — every Scope they hold their Cases: a visiting Vet who also
  // works the barn or runs the farm moves animals.
  const scopes = Object.values(me?.scopes ?? {});
  const onlyVisiting =
    scopes.length > 0 && scopes.every((scope) => scope?.kind === "cases");
  const sheds = useQuery({
    ...orpc.herd.list.queryOptions(),
    enabled: me !== undefined && !onlyVisiting,
  });
  return (
    sheds.data?.flatMap((shed) =>
      shed.pens.map((pen) => ({ ...pen, shedName: shed.name }))
    ) ?? []
  );
};

/** What somebody holding these Roles may do on her page. */
const powersOf = (roles: readonly string[] = [], visiting = false) => {
  const isManager = roles.includes("manager");
  const runsTheFarm = isManager || roles.includes("owner");
  return {
    isVet: roles.includes("vet"),
    // A vet called in for a visit treats her, and does not change her State or cut short a Withdrawal.
    fullVet: roles.includes("vet") && !visiting,
    isManager,
    runsTheFarm,
    mayHandle: runsTheFarm || roles.includes("staff"),
    // Barn Staff give the doses and record what they see; what the farm tells the outside world about an animal is
    // not theirs to hand over, so they are not offered it.
    seesPapers: roles.some((role) => role !== "staff"),
  };
};

const AnimalPage = () => {
  const { tagNumber } = Route.useParams();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const animal = useQuery(
    orpc.animals.byTag.queryOptions({ input: { tagNumber } })
  );
  const me = useQuery(orpc.people.me.queryOptions());
  const { isVet, fullVet, runsTheFarm, mayHandle, seesPapers } = powersOf(
    me.data?.roles,
    me.data?.scopes.vet?.kind === "cases"
  );
  const pens = usePens(me.data);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.animals.key() });

  if (animal.isError) {
    return (
      <Page>
        <EmptyState
          action={
            <Button render={<Link to="/animals" />} variant="outline">
              {t("nav.animals")}
            </Button>
          }
          icon={SearchX}
          title={t("animals.notFound")}
        />
      </Page>
    );
  }
  if (!animal.data) {
    return (
      <Page>
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }

  const detail = animal.data;

  return (
    <Page width="default" className="max-w-4xl">
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex w-fit items-center gap-1 text-sm"
        to="/animals"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("nav.animals")}
      </Link>
      <AnimalHeader detail={detail} />

      <HerHeats heats={detail.heats} />

      <HerServices heats={detail.heats} services={detail.services} />
      <HerPregnancyChecks
        mayCorrect={runsTheFarm}
        tagNumber={detail.tagNumber}
        checks={detail.pregnancyChecks}
        expectedCalvingAt={detail.expectedCalvingAt}
        failedAttempts={detail.failedAttempts}
      />
      <HerCalvings calvings={detail.calvings} />
      <HerAbortions
        abortions={detail.abortions}
        mayRecord={isVet && detail.expectedCalvingAt !== null}
        onRecorded={refresh}
        tagNumber={detail.tagNumber}
      />

      {detail.fattening ? <TwoProjections view={detail.fattening} /> : null}

      <HowSheArrived intake={detail.intake} mayCorrect={runsTheFarm} />

      <HowSheLeft mayCorrect={runsTheFarm} sale={detail.sale} />

      <WhatSheCost tagNumber={detail.tagNumber} />

      {seesPapers ? <HerPapers tagNumber={detail.tagNumber} /> : null}

      <TheScale readings={detail.weighIns} />

      <HowSheWent
        detail={detail}
        mayRecord={runsTheFarm}
        onRecorded={refresh}
      />

      <Withdrawals detail={detail} isVet={fullVet} onShortened={refresh} />

      <VetCases mayCall={runsTheFarm} tagNumber={detail.tagNumber} />

      <ManageHer
        detail={detail}
        isVet={isVet}
        mayChangeState={runsTheFarm || fullVet}
        mayMove={
          runsTheFarm ||
          (mayHandle && pensOf(me.data?.scopes.staff).includes(detail.penId))
        }
        movePens={
          runsTheFarm
            ? pens
            : pens.filter((pen) =>
                pensOf(me.data?.scopes.staff).includes(pen.id)
              )
        }
        mayHandle={mayHandle}
        onChanged={refresh}
      />

      {detail.observations.length > 0 || detail.diagnoses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("animals.healthChain")}</h2>
          {/* One chain, not two lists: what the round saw, and under it what the Vet made of
              it. A Diagnosis that answers no Observation stands on its own at the end. */}
          <ul className="space-y-1 text-sm">
            {detail.observations.map((seen) => (
              <li
                className={
                  seen.withdrawn
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground"
                }
                key={seen.id}
              >
                {formatDate(new Date(seen.seenAt), language, "dateTime")} ·{" "}
                {seen.sawLabel}
                {seen.seenByName ? ` · ${seen.seenByName}` : ""}
                {" · "}
                <SeenWhere instanceId={seen.instanceId} note={seen.note} />
                {seen.withdrawn
                  ? ` · ${t("animals.observationWithdrawn")}`
                  : ""}
                {seen.diagnoses.length > 0 ? (
                  <ul className="mt-1 ml-4 space-y-1">
                    {seen.diagnoses.map((made) => (
                      <Conclusion key={made.id} made={made} />
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {detail.diagnoses.map((made) => (
              <Conclusion key={made.id} made={made} />
            ))}
          </ul>
        </section>
      ) : null}

      {detail.treatments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("animals.treatments")}</h2>
          {/* Per animal, not per campaign: this is the list a slaughter vet asks for, and it
              holds what a course gave her and what a round of the Pen gave her alike. */}
          <ul className="space-y-1 text-sm">
            {detail.treatments.map((dose) => (
              <li className="text-muted-foreground" key={dose.id}>
                {dose.givenAt
                  ? formatDate(new Date(dose.givenAt), language, "dateTime")
                  : ""}{" "}
                ·{" "}
                {language === "en" && dose.productNameEn
                  ? dose.productNameEn
                  : dose.productNameBn}
                {dose.fromPrescription ? "" : ` · ${t("animals.fromCampaign")}`}
                {dose.givenByName ? ` · ${dose.givenByName}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("animals.movesHistory")}</h2>
        <ul className="space-y-1 text-sm">
          {detail.moves.map((m) => (
            <li className="text-muted-foreground" key={m.id}>
              {formatDate(new Date(m.movedAt), language, "dateTime")} ·{" "}
              {m.fromPenName ? `${m.fromPenName} → ` : ""}
              {m.toPenName}
              {m.reason ? ` · ${m.reason}` : ""}
              {m.instanceId ? (
                <>
                  {" · "}
                  <Link
                    className="underline"
                    params={{ instanceId: m.instanceId }}
                    to="/work/$instanceId"
                  >
                    {t("animals.moveFromWork")}
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {detail.retags.length > 0 ? (
          <>
            <h2 className="text-lg font-semibold">
              {t("animals.retagsHistory")}
            </h2>
            <ul className="space-y-1 text-sm">
              {detail.retags.map((r) => (
                <li key={r.id} className="text-muted-foreground">
                  {formatDate(new Date(r.retaggedAt), language, "dateTime")} ·{" "}
                  {r.reason}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </Page>
  );
};

/** What was done with a stillborn calf's carcass, written afterwards by the Owner or the Manager: her calving
 *  recorded her death, and nobody at the calving could say. */
const DisposalAfterwards = ({
  tagNumber,
  onDone,
}: {
  tagNumber: string;
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const [disposal, setDisposal] = useState<Disposal>("buried");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.animals.recordDisposal.mutationOptions({
      onSuccess: () => {
        toast.success(t("mortality.recorded"));
        onDone();
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        record.mutate({
          tagNumber,
          disposal,
          ...(note.trim() ? { disposalNote: note.trim() } : {}),
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="afterwards-disposal">{t("mortality.disposal")}</Label>
        <select
          className="bg-card border-input h-11 rounded-md border px-3 text-base md:h-9 md:text-sm"
          id="afterwards-disposal"
          onChange={(event) => setDisposal(event.target.value as Disposal)}
          value={disposal}
        >
          {DISPOSALS.map((one) => (
            <option key={one} value={one}>
              {t(`mortality.${one}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="afterwards-note">{t("mortality.disposalNote")}</Label>
        <Input
          id="afterwards-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </div>
      <Button disabled={record.isPending} type="submit" variant="outline">
        {t("mortality.recordDisposal")}
      </Button>
    </form>
  );
};

/** Putting a mortality right: what the farm learned afterwards, or a hurried entry corrected. */
const PutItRight = ({
  detail,
  onDone,
}: {
  detail: {
    tagNumber: string;
    mortality: {
      kind: MortalityKind;
      cause: string;
      disposal: Disposal | null;
    };
  };
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const correcting = useCorrecting({
    kind: choice(detail.mortality.kind),
    cause: words(detail.mortality.cause),
    // Left as it is unless somebody chooses: a Correction to a stillborn calf's cause writes no disposal nobody said.
    disposal: choice(detail.mortality.disposal),
  });
  const correct = useMutation(
    orpc.animals.correctMortality.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          tagNumber: detail.tagNumber,
          changes: correcting.changes(),
          reason,
        });
        toast.success(t("mortality.corrected"));
        onDone();
      }}
      ready={correcting.changed}
      title={t("mortality.correct")}
      trigger={t("mortality.correct")}
    >
      <CorrectionChoice
        label={t("mortality.kind")}
        onChange={(value) => correcting.set("kind", value)}
        options={MORTALITY_KINDS.map((one) => ({
          value: one,
          label: t(`mortality.${one}`),
        }))}
        value={correcting.typed.kind ?? ""}
      />
      <CorrectionField
        label={t("mortality.cause")}
        onChange={(value) => correcting.set("cause", value)}
        value={correcting.typed.cause ?? ""}
      />
      <CorrectionChoice
        label={t("mortality.disposal")}
        onChange={(value) => correcting.set("disposal", value)}
        options={DISPOSALS.map((one) => ({
          value: one,
          label: t(`mortality.${one}`),
        }))}
        unchosen={
          detail.mortality.disposal
            ? undefined
            : t("mortality.awaitingDisposal")
        }
        value={correcting.typed.disposal ?? ""}
      />
    </CorrectionDialog>
  );
};

/**
 * When she has been seen in heat, newest first, and the AI work each heat raised.
 *
 * Nothing at all for a cow who never has — a heading over an empty list reads as a record that
 * something went missing. A second sighting of the same heat raised nothing, and says so by
 * having no work beside it.
 */
const HerHeats = ({
  heats,
}: {
  heats: { id: string; seenAt: Date; workId: string | null }[];
}) => {
  const { t, language } = useLanguage();
  if (heats.length === 0) {
    return null;
  }
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("heat.title")}</h2>
      <ul className="space-y-1">
        {heats.map((heat) => (
          <li className="flex flex-wrap gap-2" key={heat.id}>
            <span>
              <span className="text-muted-foreground">{t("heat.seen")}: </span>
              {formatDate(heat.seenAt, language, "dateTime")}
            </span>
            {heat.workId ? (
              <Link
                className="underline"
                params={{ instanceId: heat.workId }}
                to="/work/$instanceId"
              >
                {t("heat.work")}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * Every time she has been served, newest first, each naming the heat it answered.
 *
 * Read as a chain rather than two lists: the heat she was seen in, and the service it led to. The
 * ones that did not take stay on the page, because a run of them is exactly what somebody deciding
 * about a Repeat Breeder needs to see.
 */
const HerServices = ({
  services,
  heats,
}: {
  services: {
    id: string;
    method: "ai" | "natural";
    sireStraw: string | null;
    sireTagNumber: string | null;
    servedBy: string | null;
    heatId: string | null;
    servedAt: Date;
  }[];
  heats: { id: string; seenAt: Date }[];
}) => {
  const { t, language } = useLanguage();
  if (services.length === 0) {
    return null;
  }
  const heatSeen = new Map(heats.map((heat) => [heat.id, heat.seenAt]));
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("service.title")}</h2>
      <ul className="space-y-2">
        {services.map((one) => {
          const answered = one.heatId ? heatSeen.get(one.heatId) : undefined;
          return (
            <li className="space-y-0.5" key={one.id}>
              <p>
                {formatDate(one.servedAt, language, "dateTime")} ·{" "}
                {t(one.method === "ai" ? "service.ai" : "service.natural")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("service.sire")}: {one.sireTagNumber ?? one.sireStraw}
                {one.servedBy
                  ? ` · ${t("service.servedBy", { name: one.servedBy })}`
                  : ""}
              </p>
              {answered ? (
                <p className="text-muted-foreground text-xs">
                  {t("service.afterHeat", {
                    when: formatDate(answered, language, "dateTime"),
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/**
 * What the Vet found, newest first, and what follows from it: when she is expected to calve, and how
 * many attempts did not take. Both are worked out from the checks — nothing here is typed.
 */
/** Her photo, her Pen, her State, her tag and her side — each offered only to a Role the farm lets do it. */
const ManageHer = ({
  detail,
  movePens,
  mayMove,
  isVet,
  mayChangeState,
  mayHandle,
  onChanged,
}: {
  detail: AnimalDetail;
  /** Where she may be moved by this person: anywhere for those who run the farm, a Staff member's own Pens. */
  movePens: { id: string; name: string; shedName: string }[];
  mayMove: boolean;
  isVet: boolean;
  /** Owner, Manager or a full Vet: a visiting vet does not change her State. */
  mayChangeState: boolean;
  mayHandle: boolean;
  onChanged: () => unknown;
}) => {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [toPenId, setToPenId] = useState("");
  const [nextState, setNextState] = useState("");
  const refresh = onChanged;
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const move = useMutation(
    orpc.animals.move.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.moved"));
        setToPenId("");
        refresh();
      },
      onError,
    })
  );
  const setState = useMutation(
    orpc.animals.setState.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.stateChanged"));
        refresh();
      },
      onError,
    })
  );
  const retag = useMutation(
    orpc.animals.retag.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.retagged"));
        setReason("");
        refresh();
      },
      onError,
    })
  );
  const setPhoto = useMutation(
    orpc.animals.setPhoto.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.photoSaved"));
        refresh();
      },
      onError,
    })
  );

  if (!(mayHandle || isVet)) {
    return null;
  }
  return (
    <Section description={t("animals.manageHint")} title={t("animals.manage")}>
      <ReportSighting tagNumber={detail.tagNumber} />
      {/* What each Role may do to her, and nothing it may not: offering a control the farm will refuse is a
          dead end in the barn. */}
      {mayHandle ? (
        <div className="flex flex-col gap-1.5">
          {/* The phone's own file picker speaks the phone's language, not the farm's: the words are on the button,
              and the picker behind it only opens the camera. */}
          <label
            className="border-input bg-card hover:bg-muted focus-within:ring-ring/50 inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium focus-within:ring-[3px] md:h-9"
            htmlFor="photo"
          >
            {setPhoto.isPending ? (
              <Spinner />
            ) : (
              <Camera aria-hidden className="size-4" />
            )}
            {t("animals.photoTake")}
          </label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              if (file.size > PHOTO_MAX_BYTES) {
                toast.error(t("common.error"));
                return;
              }
              const data = await readAsBase64(file);
              const contentType =
                file.type === "image/png" ? "image/png" : "image/jpeg";
              setPhoto.mutate({
                tagNumber: detail.tagNumber,
                contentType,
                data,
              });
            }}
          />
        </div>
      ) : null}
      {mayMove || mayChangeState ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {mayMove ? (
            <form
              className="flex flex-col gap-2 rounded-lg border p-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const wanted = {
                  tagNumber: detail.tagNumber,
                  toPenId,
                  reason: reason || undefined,
                };
                // With signal the farm answers now; without it the move waits on the phone rather than being lost.
                if (navigator.onLine) {
                  move.mutate(wanted);
                  return;
                }
                try {
                  await queueMove(wanted);
                  toast.success(t("animals.moveQueued"));
                  setToPenId("");
                } catch (error) {
                  onError(error as Error);
                }
              }}
            >
              <Label htmlFor="pen">{t("animals.moveTo")}</Label>
              <select
                id="pen"
                value={toPenId}
                onChange={(e) => setToPenId(e.target.value)}
                className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
                required
              >
                <option value="">—</option>
                {movePens.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shedName} / {p.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={!toPenId || move.isPending}
                type="submit"
                variant="outline"
              >
                {move.isPending ? <Spinner /> : null}
                {t("animals.move")}
              </Button>
            </form>
          ) : null}
          {mayChangeState ? (
            <form
              className="flex flex-col gap-2 rounded-lg border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                setState.mutate({
                  tagNumber: detail.tagNumber,
                  state: nextState as Parameters<
                    typeof setState.mutate
                  >[0]["state"],
                  reason: reason || undefined,
                });
              }}
            >
              <Label htmlFor="state">{t("animals.setState")}</Label>
              <select
                id="state"
                value={nextState}
                onChange={(e) => setNextState(e.target.value)}
                className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
                required
              >
                <option value="">—</option>
                {allowedNextStates(detail.state).map((s) => (
                  <option key={s} value={s}>
                    {t(`state.${s}`)}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" disabled={!nextState}>
                {t("animals.setState")}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {mayHandle ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            className="flex flex-col gap-2 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              retag.mutate({ tagNumber: detail.tagNumber, reason });
            }}
          >
            <Label htmlFor="reason">{t("animals.reason")}</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!reason.trim()}>
              {t("animals.retag")}
            </Button>
          </form>
          {mayMove && detail.side === "dairy" ? (
            <ChangeSide pens={movePens} tagNumber={detail.tagNumber} />
          ) : null}
        </div>
      ) : null}
    </Section>
  );
};

/** Across to Fattening — a bull calf, or an animal put on the wrong side — into a Pen there. A Move like any other, so
 *  whoever may move her may take her across, and a phone out of signal keeps it until it can send it. */
const ChangeSide = ({
  tagNumber,
  pens,
}: {
  tagNumber: string;
  pens: { id: string; name: string; shedName: string }[];
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const toSide = "fattening" as const;
  const [toPenId, setToPenId] = useState("");
  const move = useMutation(orpc.animals.move.mutationOptions({}));
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-sm font-medium">{t("correct.side")}</p>
      <p className="text-muted-foreground text-sm">{t("correct.sideHint")}</p>
      <CorrectionDialog
        description={t("correct.sideHint")}
        onOpen={() => setToPenId("")}
        onSave={async (reason) => {
          const across = { tagNumber, toSide, toPenId, reason };
          // With signal the farm answers now; without it the Move waits on the phone rather than being lost.
          if (navigator.onLine) {
            await move.mutateAsync(across);
          } else {
            await queueMove(across);
            // Said as well as saved: it goes to the farm when the phone finds signal, not now.
            toast.info(t("animals.moveQueued"));
          }
          await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
        }}
        ready={Boolean(toPenId)}
        title={t("correct.side")}
        trigger={`${t("correct.toSide")}: ${t(`animals.side.${toSide}`)}`}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`side-pen-${tagNumber}`}>{t("correct.toPen")}</Label>
          <select
            className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
            id={`side-pen-${tagNumber}`}
            onChange={(event) => setToPenId(event.target.value)}
            required
            value={toPenId}
          >
            <option value="">—</option>
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.shedName} / {pen.name}
              </option>
            ))}
          </select>
        </div>
      </CorrectionDialog>
    </div>
  );
};

/** The Manager puts right what a bought-in animal cost, or who sold her. */
const IntakeCorrection = ({
  intake,
}: {
  intake: { id: string; purchasePriceBdt: number; sellerName: string | null };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    purchasePriceBdt: figure(intake.purchasePriceBdt),
    seller: person(intake.sellerName),
  });
  const correct = useMutation(orpc.intake.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: intake.id,
          reason,
          changes: correcting.changes(),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      }}
      ready={correcting.changed}
      title={t("correct.intake")}
    >
      <CorrectionField
        inputMode="numeric"
        label={t("intake.price")}
        onChange={(value) => correcting.set("purchasePriceBdt", value)}
        type="number"
        value={correcting.typed.purchasePriceBdt ?? ""}
      />
      <CorrectionField
        label={t("correct.seller")}
        onChange={(value) => correcting.set("seller", value)}
        value={correcting.typed.seller ?? ""}
      />
    </CorrectionDialog>
  );
};

/** Her Expected Calving put right — a service date written wrong, or a vet's scan that says otherwise. */
const ExpectedCalvingCorrection = ({
  tagNumber,
  expectedCalvingAt,
}: {
  tagNumber: string;
  expectedCalvingAt: Date;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(farmDayOf(expectedCalvingAt));
  const correct = useMutation(
    orpc.animals.correctExpectedCalving.mutationOptions({})
  );
  return (
    <CorrectionDialog
      onOpen={() => setDay(farmDayOf(expectedCalvingAt))}
      onSave={async (reason) => {
        await correct.mutateAsync({
          tagNumber,
          changes: {
            expectedCalvingOn: { from: farmDayOf(expectedCalvingAt), to: day },
          },
          reason,
        });
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      }}
      ready={Boolean(day)}
      title={t("correct.calving")}
    >
      <CorrectionField
        label={t("pregnancy.expectedOn")}
        onChange={setDay}
        type="date"
        value={day}
      />
    </CorrectionDialog>
  );
};

const HerPregnancyChecks = ({
  checks,
  expectedCalvingAt,
  failedAttempts,
  mayCorrect,
  tagNumber,
}: {
  mayCorrect: boolean;
  tagNumber: string;
  checks: {
    id: string;
    result: PregnancyCheckResult;
    checkedAt: Date;
    firstServedAt: Date;
  }[];
  expectedCalvingAt: Date | null;
  failedAttempts: number;
}) => {
  const { t, language } = useLanguage();
  if (checks.length === 0 && !expectedCalvingAt) {
    return null;
  }
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("pregnancy.title")}</h2>
      {expectedCalvingAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            {t("pregnancy.expectedCalving", {
              when: formatDate(expectedCalvingAt, language),
            })}
          </p>
          {mayCorrect ? (
            <ExpectedCalvingCorrection
              expectedCalvingAt={expectedCalvingAt}
              tagNumber={tagNumber}
            />
          ) : null}
        </div>
      ) : null}
      {failedAttempts > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("pregnancy.failedAttempts", { count: failedAttempts })}
        </p>
      ) : null}
      <ul className="space-y-2">
        {checks.map((check) => (
          <li className="space-y-0.5" key={check.id}>
            <p>
              {formatDate(check.checkedAt, language)} ·{" "}
              {t(
                check.result === "positive"
                  ? "pregnancy.positive"
                  : "pregnancy.negative"
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("pregnancy.ofService", {
                when: formatDate(check.firstServedAt, language, "dateTime"),
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * Every time she has calved, newest first, and what was born: each calf by its own number, a stillborn
 * one included, so a cow's page says what she has produced.
 */
const HerCalvings = ({
  calvings,
}: {
  calvings: {
    id: string;
    calvedAt: Date;
    ease: CalvingEase;
    lactationNumber: number;
    calves: {
      tagNumber: string;
      sex: "female" | "male";
      calfOutcome: "alive" | "stillborn" | null;
    }[];
  }[];
}) => {
  const { t, language } = useLanguage();
  if (calvings.length === 0) {
    return null;
  }
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("calving.title")}</h2>
      <ul className="space-y-2">
        {calvings.map((one) => (
          <li className="space-y-0.5" key={one.id}>
            <p>
              {formatDate(one.calvedAt, language, "dateTime")} ·{" "}
              {t(`calving.ease.${one.ease}`)} ·{" "}
              {t("calving.lactation", { number: one.lactationNumber })}
            </p>
            <ul className="flex flex-wrap gap-3">
              {one.calves.map((calf) => (
                <li key={calf.tagNumber}>
                  <Link
                    className="underline"
                    params={{ tagNumber: calf.tagNumber }}
                    to="/animals/$tagNumber"
                  >
                    {calf.tagNumber}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {t(`animals.sex.${calf.sex}`)}
                    {calf.calfOutcome === "stillborn"
                      ? ` · ${t("calving.stillborn")}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Her mother, for a calf born on this farm: a calf's page says who she came from. */
const HerMother = ({ dam }: { dam: { tagNumber: string } | null }) => {
  const { t } = useLanguage();
  if (!dam) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-sm">
      {t("calving.dam")}:{" "}
      <Link
        className="underline"
        params={{ tagNumber: dam.tagNumber }}
        to="/animals/$tagNumber"
      >
        {dam.tagNumber}
      </Link>
    </p>
  );
};

/**
 * The pregnancies she lost before calving, and — for the Vet, while she is carrying — the form to
 * record one. The Vet's act from the Vet's own phone; nobody else is offered it.
 */
const HerAbortions = ({
  abortions,
  mayRecord,
  onRecorded,
  tagNumber,
}: {
  abortions: {
    id: string;
    abortedAt: Date;
    stageMonths: number;
    note: string;
  }[];
  mayRecord: boolean;
  onRecorded: () => void;
  tagNumber: string;
}) => {
  const { t, language } = useLanguage();
  const [abortedAt, setAbortedAt] = useState("");
  const [stageMonths, setStageMonths] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation(
    orpc.breeding.recordAbortion.mutationOptions({
      onSuccess: () => {
        setNote("");
        toast.success(t("abortion.recorded"));
        onRecorded();
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  if (abortions.length === 0 && !mayRecord) {
    return null;
  }
  return (
    <section className="surface space-y-2 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("abortion.title")}</h2>
      <ul className="space-y-1">
        {abortions.map((one) => (
          <li key={one.id}>
            {formatDate(one.abortedAt, language)} ·{" "}
            {t("abortion.stage", { months: one.stageMonths })} · {one.note}
          </li>
        ))}
      </ul>
      {mayRecord ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            record.mutate({
              tagNumber,
              abortedAt: abortedAt ? new Date(abortedAt) : new Date(),
              stageMonths: Number(stageMonths),
              note,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="abortion-when">{t("abortion.when")}</Label>
            <Input
              id="abortion-when"
              onChange={(event) => setAbortedAt(event.target.value)}
              type="datetime-local"
              value={abortedAt}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="abortion-stage">{t("abortion.stageMonths")}</Label>
            <Input
              id="abortion-stage"
              max={9}
              min={1}
              onChange={(event) => setStageMonths(event.target.value)}
              type="number"
              value={stageMonths}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="abortion-note">{t("abortion.note")}</Label>
            <Input
              id="abortion-note"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <Button
            disabled={!(note.trim() && stageMonths)}
            type="submit"
            variant="outline"
          >
            {t("abortion.record")}
          </Button>
        </form>
      ) : null}
    </section>
  );
};

/** Whatever the farm said went wrong, in its own words. */
const sayWhy = (error: Error) => toast.error(error.message);

/**
 * The two papers the farm hands over about one animal: her passport, and the sharp question on
 * its own page.
 *
 * Here on her own page rather than on a report screen, because that is where somebody is standing
 * when a buyer asks — and they are asked for by name, not printed with every visit, so the trail
 * records the ones that actually went.
 */
const HerPapers = ({ tagNumber }: { tagNumber: string }) => {
  const { t } = useLanguage();
  const [paper, setPaper] = useState<{ id: PaperId; text: string } | null>(
    null
  );
  const passport = useMutation(
    orpc.papers.passport.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "animal-passport", text }),
      onError: sayWhy,
    })
  );
  const summary = useMutation(
    orpc.papers.withdrawalSummary.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "withdrawal-summary", text }),
      onError: sayWhy,
    })
  );

  return (
    <section className="space-y-2">
      <div className="no-print flex flex-wrap gap-2">
        <Button
          onClick={() => passport.mutate({ tagNumber })}
          size="sm"
          variant="outline"
        >
          {t("papers.passport")}
        </Button>
        <Button
          onClick={() => summary.mutate({ tagNumber })}
          size="sm"
          variant="outline"
        >
          {t("papers.withdrawalSummary")}
        </Button>
      </div>
      {paper ? <Paper id={paper.id} text={paper.text} /> : null}
    </section>
  );
};

/**
 * Every time she has been on the scale, newest first.
 *
 * The whole list and not only the latest: fattening is the difference between two readings, and
 * a page that showed one weight would be hiding the thing the farm is actually measuring. A
 * reading the farm doubted says so and says why, because a figure that looks wrong a year from
 * now should not need working out again.
 */
const TheScale = ({
  readings,
}: {
  readings: {
    id: string;
    weightKg: number;
    weighedAt: Date;
    flagged: boolean;
    flaggedNote: string | null;
    weighedByName: string | null;
  }[];
}) => {
  const { t, language } = useLanguage();
  if (readings.length === 0) {
    return null;
  }
  return (
    <section className="surface space-y-2 p-4 text-sm">
      <h2 className="text-lg font-semibold">{t("weighIn.title")}</h2>
      <ul className="space-y-1">
        {readings.map((reading) => (
          <li className="flex flex-wrap items-baseline gap-2" key={reading.id}>
            <span className="font-medium">
              {t("intake.kg", {
                kg: formatNumber(reading.weightKg, language),
              })}
            </span>
            <span className="text-muted-foreground">
              {formatDate(reading.weighedAt, language, "date")}
            </span>
            {reading.weighedByName ? (
              <span className="text-muted-foreground text-xs">
                {t("weighIn.by", { name: reading.weighedByName })}
              </span>
            ) : null}
            {reading.flagged ? (
              <span className="text-warning text-xs">
                {t("weighIn.flagged")}
                {reading.flaggedNote ? ` · ${reading.flaggedNote}` : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * How she left, for an animal sold to a buyer: what she fetched, who took her, and what carried
 * her. The transport lines are what the Meat Rules ask a lorry to carry, so they are part of the
 * record rather than a detail somebody may or may not have written down.
 */
const HowSheLeft = ({
  sale,
  mayCorrect,
}: {
  mayCorrect: boolean;
  sale: {
    id: string;
    priceBdt: number;
    weightKg: number;
    destination: string;
    vehicle: string;
    driver: string;
    note: string | null;
    soldAt: Date;
    buyerName: string;
  } | null;
}) => {
  const { t, language } = useLanguage();
  if (!sale) {
    return null;
  }
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("sale.howSheLeft")}</h2>
        {mayCorrect ? (
          <SaleCorrection sale={sale} thenReload={orpc.animals.key()} />
        ) : null}
      </div>
      <Fact label={t("sale.soldTo")}>{sale.buyerName}</Fact>
      <Fact label={t("sale.price")}>
        {t("intake.taka", { taka: formatNumber(sale.priceBdt, language) })}
      </Fact>
      <Fact label={t("sale.weight")}>
        {t("intake.kg", { kg: formatNumber(sale.weightKg, language) })}
      </Fact>
      <Fact label={t("sale.destination")}>{sale.destination}</Fact>
      <Fact label={t("sale.vehicle")}>
        {sale.vehicle} · {sale.driver}
      </Fact>
      <Fact label={t("sale.soldOn")}>
        {formatDate(sale.soldAt, language, "date")}
      </Fact>
      {sale.note ? <Fact label={t("sale.note")}>{sale.note}</Fact> : null}
    </section>
  );
};

/**
 * How a bought-in animal arrived: what the farm paid, what it weighed off the lorry, and what it
 * is being fed towards. Nothing here ever changes — an arrival happened once — so it reads as a
 * record rather than as a form.
 */
const HowSheArrived = ({
  intake,
  mayCorrect,
}: {
  mayCorrect: boolean;
  intake: {
    id: string;
    purchasePriceBdt: number;
    weightKg: number;
    targetWeightKg: number;
    estimatedAgeMonths: number;
    targetWindow: TargetWindow;
    sellerName: string | null;
    sellerAddress: string | null;
  } | null;
}) => {
  const { t, language } = useLanguage();
  if (!intake) {
    return null;
  }
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  return (
    <section className="surface space-y-1 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("intake.title")}</h2>
        {mayCorrect ? <IntakeCorrection intake={intake} /> : null}
      </div>
      <Fact label={t("intake.seller")}>
        {[intake.sellerName, intake.sellerAddress]
          .filter(Boolean)
          .join(" · ") || "—"}
      </Fact>
      <Fact label={t("intake.price")}>
        {t("intake.taka", {
          taka: formatNumber(intake.purchasePriceBdt, language),
        })}
      </Fact>
      <Fact label={t("intake.weight")}>{kg(intake.weightKg)}</Fact>
      <Fact label={t("intake.age")}>
        {t("intake.months", {
          months: formatNumber(intake.estimatedAgeMonths, language),
        })}
      </Fact>
      <Fact label={t("intake.targetWeight")}>{kg(intake.targetWeightKg)}</Fact>
      <Fact label={t("intake.targetWindow")}>
        {formatDate(
          startOfFarmDay(intake.targetWindow.start),
          language,
          "date"
        )}{" "}
        –{" "}
        {formatDate(startOfFarmDay(intake.targetWindow.end), language, "date")}
      </Fact>
    </section>
  );
};

/** One line of a record: what it is, and what it says. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <p>
    <span className="text-muted-foreground">{label}: </span>
    {children}
  </p>
);

/**
 * How she left the herd, or — for an Owner or a Manager looking at an animal who is still
 * here — the way to write it down.
 *
 * Disposal is evidence: the burial rule is six feet and an inspector may ask which it was, so
 * the farm records it beside the cause rather than leaving it in somebody's memory.
 */
const HowSheWent = ({
  detail,
  mayRecord,
  onRecorded,
}: {
  detail: {
    tagNumber: string;
    mortality: {
      kind: MortalityKind;
      happenedAt: Date;
      cause: string;
      disposal: Disposal | null;
      disposalNote: string | null;
      recordedByName: string | null;
    } | null;
  };
  mayRecord: boolean;
  onRecorded: () => void;
}) => {
  const { t, language } = useLanguage();
  const [kind, setKind] = useState<MortalityKind>("died");
  const [cause, setCause] = useState("");
  const [disposal, setDisposal] = useState<Disposal>("buried");
  const [note, setNote] = useState("");
  const [happenedAt, setHappenedAt] = useState("");
  const record = useMutation(
    orpc.animals.recordMortality.mutationOptions({
      onSuccess: () => {
        setCause("");
        toast.success(t("mortality.recorded"));
        onRecorded();
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  if (detail.mortality) {
    const gone = detail.mortality;
    return (
      <section className="surface space-y-1 p-4 text-sm">
        <p className="font-medium">{t(`mortality.${gone.kind}`)}</p>
        <p className="text-muted-foreground">
          {formatDate(new Date(gone.happenedAt), language, "dateTime")} ·{" "}
          {causeWord(gone.cause, t)}
        </p>
        <p className={gone.disposal ? "text-muted-foreground" : "text-warning"}>
          {t("mortality.disposal")}: {disposalWord(gone.disposal, t)}
          {gone.disposalNote ? ` · ${gone.disposalNote}` : ""}
          {gone.recordedByName ? ` · ${gone.recordedByName}` : ""}
        </p>
        {mayRecord && !gone.disposal ? (
          <DisposalAfterwards
            onDone={onRecorded}
            tagNumber={detail.tagNumber}
          />
        ) : null}
        {mayRecord ? (
          <PutItRight
            detail={{ tagNumber: detail.tagNumber, mortality: gone }}
            onDone={onRecorded}
          />
        ) : null}
      </section>
    );
  }
  if (!mayRecord) {
    return null;
  }

  return (
    <details className="surface p-4 text-sm">
      <summary className="cursor-pointer">{t("mortality.record")}</summary>
      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            tagNumber: detail.tagNumber,
            kind,
            cause: cause.trim(),
            disposal,
            ...(note.trim() ? { disposalNote: note.trim() } : {}),
            // The round finds her at dawn and the record is written at noon; which was which
            // is the farm's business, so it can be said.
            ...(happenedAt ? { happenedAt: new Date(happenedAt) } : {}),
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="mortality-kind">{t("mortality.kind")}</Label>
          <select
            className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
            id="mortality-kind"
            onChange={(event) => setKind(event.target.value as MortalityKind)}
            value={kind}
          >
            {MORTALITY_KINDS.map((one) => (
              <option key={one} value={one}>
                {t(`mortality.${one}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mortality-cause">{t("mortality.cause")}</Label>
          <Input
            id="mortality-cause"
            onChange={(event) => setCause(event.target.value)}
            value={cause}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mortality-disposal">{t("mortality.disposal")}</Label>
          <select
            className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
            id="mortality-disposal"
            onChange={(event) => setDisposal(event.target.value as Disposal)}
            value={disposal}
          >
            {DISPOSALS.map((one) => (
              <option key={one} value={one}>
                {t(`mortality.${one}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mortality-note">{t("mortality.disposalNote")}</Label>
          <Input
            id="mortality-note"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mortality-when">{t("mortality.happenedAt")}</Label>
          <Input
            id="mortality-when"
            onChange={(event) => setHappenedAt(event.target.value)}
            type="datetime-local"
            value={happenedAt}
          />
        </div>
        <Button disabled={!cause.trim()} type="submit" variant="outline">
          {t("mortality.record")}
        </Button>
      </form>
    </details>
  );
};

/**
 * What is holding her back, and — for the Vet, and only the Vet — the way to shorten it.
 *
 * Both holds are shown whether or not they are in force: "held until Tuesday" and "fit for
 * sale from the 30th" are the two things anybody looking at a treated cow wants to know, and
 * a page that only mentions them while they bite teaches nobody to look.
 */
const Withdrawals = ({
  detail,
  isVet,
  onShortened,
}: {
  detail: {
    tagNumber: string;
    milkWithdrawalUntil: Date | null;
    meatWithdrawalUntil: Date | null;
    shortened: {
      at: Date;
      reason: string | null;
      wasMilkUntil: Date | null;
      wasMeatUntil: Date | null;
    } | null;
  };
  isVet: boolean;
  onShortened: () => void;
}) => {
  const { t, language } = useLanguage();
  const [milkUntil, setMilkUntil] = useState("");
  const [meatUntil, setMeatUntil] = useState("");
  const [reason, setReason] = useState("");
  const shorten = useMutation(
    orpc.withdrawals.shorten.mutationOptions({
      onSuccess: () => {
        setReason("");
        toast.success(t("withdrawal.shortened"));
        onShortened();
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );
  if (!(detail.milkWithdrawalUntil || detail.meatWithdrawalUntil)) {
    return null;
  }

  return (
    <section className="surface space-y-2 p-4 text-sm">
      {detail.milkWithdrawalUntil ? (
        <p>
          {t("animals.milkHeldUntil", {
            date: formatDate(
              new Date(detail.milkWithdrawalUntil),
              language,
              "dateTime"
            ),
          })}
        </p>
      ) : null}
      {detail.meatWithdrawalUntil ? (
        <p>
          {t("animals.meatHeldUntil", {
            date: formatDate(
              new Date(detail.meatWithdrawalUntil),
              language,
              "date"
            ),
          })}
        </p>
      ) : null}
      {detail.shortened ? (
        <>
          <p className="text-warning">
            {t("animals.withdrawalShortened", {
              reason: detail.shortened.reason ?? "",
            })}
          </p>
          {/* What her doses alone said. A shortened hold is the thing a slaughter vet asks
              about, so the figure it was shortened from stays on the page. */}
          {detail.shortened.wasMilkUntil ? (
            <p className="text-muted-foreground text-xs">
              {t("animals.withdrawalWas", {
                date: formatDate(
                  new Date(detail.shortened.wasMilkUntil),
                  language,
                  "dateTime"
                ),
              })}
            </p>
          ) : null}
        </>
      ) : null}

      {isVet ? (
        <form
          className="space-y-2 border-t pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            shorten.mutate({
              animalTag: detail.tagNumber,
              // Left blank, that hold ends now; left alone, it is not touched at all.
              ...(detail.milkWithdrawalUntil
                ? { milkUntil: milkUntil ? new Date(milkUntil) : null }
                : {}),
              ...(detail.meatWithdrawalUntil
                ? { meatUntil: meatUntil ? new Date(meatUntil) : null }
                : {}),
              reason: reason.trim(),
            });
          }}
        >
          {detail.milkWithdrawalUntil ? (
            <div className="space-y-1">
              <Label htmlFor="milk-until">{t("withdrawal.milkUntil")}</Label>
              <Input
                id="milk-until"
                onChange={(event) => setMilkUntil(event.target.value)}
                type="datetime-local"
                value={milkUntil}
              />
              <p className="text-muted-foreground text-xs">
                {t("withdrawal.endNow")}
              </p>
            </div>
          ) : null}
          {detail.meatWithdrawalUntil ? (
            <div className="space-y-1">
              <Label htmlFor="meat-until">{t("withdrawal.meatUntil")}</Label>
              <Input
                id="meat-until"
                onChange={(event) => setMeatUntil(event.target.value)}
                type="datetime-local"
                value={meatUntil}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="shorten-reason">{t("withdrawal.reason")}</Label>
            <Input
              id="shorten-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </div>
          <Button disabled={!reason.trim()} type="submit" variant="outline">
            {t("withdrawal.shorten")}
          </Button>
        </form>
      ) : null}
    </section>
  );
};

/** What the Vet made of it, and what was ordered because of it: the rest of the chain, in
 *  their name, because the acts are theirs. */
const Conclusion = ({
  made,
}: {
  made: {
    id: string;
    disease: string;
    note: string | null;
    diagnosedAt: Date;
    diagnosedByName: string;
    prescriptions: Course[];
  };
}) => {
  const { t, language } = useLanguage();
  return (
    <li>
      {t("animals.diagnosis")}: {made.disease}
      {made.note ? ` · ${made.note}` : ""} ·{" "}
      {t("animals.diagnosedBy", {
        name: made.diagnosedByName,
        date: formatDate(new Date(made.diagnosedAt), language, "dateTime"),
      })}
      {made.prescriptions.length > 0 ? (
        <ul className="mt-1 ml-4 space-y-1">
          {made.prescriptions.map((course) => (
            <li key={course.id}>
              {t("prescribe.course")}: <CourseLine course={course} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const Route = createFileRoute("/_auth/animals/$tagNumber")({
  component: AnimalPage,
});
