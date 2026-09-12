import type { Disposal, MortalityKind, TargetWindow } from "@OpenFarm/domain";
import {
  DISPOSALS,
  MORTALITY_KINDS,
  allowedNextStates,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import type { Course } from "@/components/course";
import { CourseLine } from "@/components/course";
import { TwoProjections } from "@/components/gain";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const PHOTO_MAX_BYTES = 1_500_000;

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    ""
  );
  return btoa(binary);
};

const AnimalPage = () => {
  const { tagNumber } = Route.useParams();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [toPenId, setToPenId] = useState("");
  const [nextState, setNextState] = useState("");

  const animal = useQuery(
    orpc.animals.byTag.queryOptions({ input: { tagNumber } })
  );
  const me = useQuery(orpc.people.me.queryOptions());
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));

  const move = useMutation(
    orpc.animals.move.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.moved"));
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

  if (animal.isError) {
    return <p className="p-6">{t("animals.notFound")}</p>;
  }
  if (!animal.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }

  const detail = animal.data;
  const pens =
    sheds.data?.flatMap((s) =>
      s.pens.map((p) => ({ ...p, shedName: s.name }))
    ) ?? [];

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header className="flex items-center gap-4">
        <AnimalPhoto
          tagNumber={detail.tagNumber}
          photoUpdatedAt={detail.photoUpdatedAt}
          size={80}
        />
        <div>
          <h1 className="text-3xl font-bold">{detail.tagNumber}</h1>
          <p className="text-muted-foreground">
            {t(`animals.side.${detail.side}`)} · {t(`state.${detail.state}`)} ·{" "}
            {detail.pen.shed.name} / {detail.pen.name}
          </p>
          {detail.aliases.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("animals.aliases")}: {detail.aliases.join(", ")}
            </p>
          ) : null}
          {detail.officialTag ? (
            <p className="text-muted-foreground text-sm">
              {t("animals.officialTag")}: {detail.officialTag}
            </p>
          ) : null}
        </div>
      </header>

      <HerHeats heats={detail.heats} />

      <HerServices heats={detail.heats} services={detail.services} />

      {detail.fattening ? <TwoProjections view={detail.fattening} /> : null}

      <HowSheArrived intake={detail.intake} />

      <HowSheLeft sale={detail.sale} />

      {/* Barn Staff give the doses and record what they see; what the farm tells the outside
          world about an animal is not theirs to hand over, so they are not offered it. */}
      {me.data?.roles.some((role) => role !== "staff") ? (
        <HerPapers tagNumber={detail.tagNumber} />
      ) : null}

      <TheScale readings={detail.weighIns} />

      <HowSheWent
        detail={detail}
        mayRecord={
          me.data?.roles.some(
            (role) => role === "owner" || role === "manager"
          ) ?? false
        }
        onRecorded={refresh}
      />

      <Withdrawals
        detail={detail}
        isVet={me.data?.roles.includes("vet") ?? false}
        onShortened={refresh}
      />

      <section className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="photo">{t("animals.photoTake")}</Label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="text-sm"
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
            setPhoto.mutate({ tagNumber: detail.tagNumber, contentType, data });
          }}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <form
          className="space-y-2 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            move.mutate({
              tagNumber: detail.tagNumber,
              toPenId,
              reason: reason || undefined,
            });
          }}
        >
          <Label htmlFor="pen">{t("animals.moveTo")}</Label>
          <select
            id="pen"
            value={toPenId}
            onChange={(e) => setToPenId(e.target.value)}
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            required
          >
            <option value="">—</option>
            {pens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shedName} / {p.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={!toPenId}>
            {t("animals.move")}
          </Button>
        </form>

        <form
          className="space-y-2 rounded-lg border p-4"
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
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
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
      </section>

      <form
        className="space-y-2 rounded-lg border p-4"
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

      {detail.observations.length > 0 || detail.diagnoses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t("animals.healthChain")}</h2>
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
                <Link
                  className="underline"
                  params={{ instanceId: seen.instanceId }}
                  to="/work/$instanceId"
                >
                  {t("animals.moveFromWork")}
                </Link>
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
          <h2 className="font-medium">{t("animals.treatments")}</h2>
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
        <h2 className="font-medium">{t("animals.movesHistory")}</h2>
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
            <h2 className="font-medium">{t("animals.retagsHistory")}</h2>
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
    </div>
  );
};

/** Putting a mortality right: what the farm learned afterwards, or a hurried entry corrected. */
const PutItRight = ({
  detail,
  onDone,
}: {
  detail: {
    tagNumber: string;
    mortality: { kind: MortalityKind; cause: string; disposal: Disposal };
  };
  onDone: () => void;
}) => {
  const { t } = useLanguage();
  const [kind, setKind] = useState<MortalityKind>(detail.mortality.kind);
  const [cause, setCause] = useState(detail.mortality.cause);
  const [disposal, setDisposal] = useState<Disposal>(detail.mortality.disposal);
  const [reason, setReason] = useState("");
  const correct = useMutation(
    orpc.animals.correctMortality.mutationOptions({
      onSuccess: () => {
        setReason("");
        toast.success(t("mortality.corrected"));
        onDone();
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

  return (
    <details className="border-t pt-2">
      <summary className="cursor-pointer">{t("mortality.correct")}</summary>
      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          correct.mutate({
            tagNumber: detail.tagNumber,
            kind,
            cause: cause.trim(),
            disposal,
            reason: reason.trim(),
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="fix-kind">{t("mortality.kind")}</Label>
          <select
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            id="fix-kind"
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
          <Label htmlFor="fix-cause">{t("mortality.cause")}</Label>
          <Input
            id="fix-cause"
            onChange={(event) => setCause(event.target.value)}
            value={cause}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fix-disposal">{t("mortality.disposal")}</Label>
          <select
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            id="fix-disposal"
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
          <Label htmlFor="fix-why">{t("mortality.why")}</Label>
          <Input
            id="fix-why"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
        <Button
          disabled={!(cause.trim() && reason.trim())}
          type="submit"
          variant="outline"
        >
          {t("mortality.saveCorrection")}
        </Button>
      </form>
    </details>
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
    <section className="space-y-1 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">{t("heat.title")}</h2>
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
    <section className="space-y-1 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">{t("service.title")}</h2>
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
                  ? ` · ${t("service.servedBy")}: ${one.servedBy}`
                  : ""}
              </p>
              {answered ? (
                <p className="text-muted-foreground text-xs">
                  {t("service.afterHeat")}{" "}
                  {formatDate(answered, language, "dateTime")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
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
    <section className="space-y-2 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">{t("weighIn.title")}</h2>
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
              <span className="text-xs text-amber-400">
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
}: {
  sale: {
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
    <section className="space-y-1 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">{t("sale.howSheLeft")}</h2>
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
}: {
  intake: {
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
    <section className="space-y-1 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">{t("intake.title")}</h2>
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
      disposal: Disposal;
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
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <p className="font-medium">{t(`mortality.${gone.kind}`)}</p>
        <p className="text-muted-foreground">
          {formatDate(new Date(gone.happenedAt), language, "dateTime")} ·{" "}
          {gone.cause}
        </p>
        <p className="text-muted-foreground">
          {t(`mortality.${gone.disposal}`)}
          {gone.disposalNote ? ` · ${gone.disposalNote}` : ""}
          {gone.recordedByName ? ` · ${gone.recordedByName}` : ""}
        </p>
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
    <details className="rounded-lg border p-4 text-sm">
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
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
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
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
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
    <section className="space-y-2 rounded-lg border p-4 text-sm">
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
          <p className="text-amber-400">
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
