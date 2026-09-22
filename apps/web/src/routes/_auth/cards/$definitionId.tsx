import { formatDate, formatDigits, translate } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap, Printer, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Loaded,
  Page,
  RecordList,
  RecordRow,
  Section,
} from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** Everything printed on a card is in the language the shed reads. */
const CARD_LANGUAGE = "bn" as const;
type CardKey = Parameters<typeof translate>[1];
type CardParams = Parameters<typeof translate>[2];
const onTheWall = (key: CardKey, params?: CardParams) =>
  translate(CARD_LANGUAGE, key, params);

/** Past this many Steps the card tightens up rather than running onto a second sheet, which
 *  is half a card by the time anybody reads it. */
const STEPS_BEFORE_TIGHTENING = 8;

type Card = Awaited<ReturnType<typeof orpc.sops.card.call>>;

/**
 * The card itself, as it goes on the wall: generated from the published Version rather than written beside it, so
 * the paper on the wall and the procedure the farm enforces cannot drift apart — and it names its own Version and
 * publication date, so a card somebody printed in March can be checked rather than trusted.
 */
const WallCard = ({ card }: { card: Card }) => {
  // The card goes on a shed wall, so it is Bangla whoever printed it — including a Manager
  // whose own app is in English. The people who read it off the wall read Bangla.
  const t = onTheWall;
  const { name, purpose, steps, number, publishedAt, triggers } = card;
  const schedule = triggers.find((trigger) => trigger.kind === "schedule");
  const times = schedule?.kind === "schedule" ? schedule.times : [];
  // "Sat 08:00, every other week" rather than the time alone, for work that is not daily.
  const days =
    schedule?.kind === "schedule" && schedule.weekdays?.length
      ? ` · ${schedule.weekdays.map((day) => t(`sop.weekday.${day}` as "sop.weekday.0")).join(", ")}${
          schedule.everyOtherWeek ? ` · ${t("sop.everyOtherWeek")}` : ""
        }`
      : "";
  const tight = steps.length > STEPS_BEFORE_TIGHTENING;

  return (
    <article
      className="bg-card mx-auto w-full max-w-[210mm] space-y-4 rounded-xl border p-6 shadow-sm md:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none"
      id="sop-card"
      lang={CARD_LANGUAGE}
    >
      {/* One A4 page: the card is for a wall, not a screen, and a card that runs onto a
          second sheet is half a card by the time somebody reads it. */}
      <style>{`@page { size: A4; margin: 12mm }
        @media print {
          body * { visibility: hidden }
          #sop-card, #sop-card * { visibility: visible }
          #sop-card { position: absolute; inset: 0 }
          .no-print { display: none }
          body { font-size: ${tight ? "10pt" : "12pt"} }
        }`}</style>

      <header className="space-y-1 border-b pb-3">
        <h1 className="text-2xl font-semibold">{name.bn}</h1>
        <p className="text-muted-foreground text-sm">
          {t("card.version", {
            number,
            date: formatDate(new Date(publishedAt), CARD_LANGUAGE, "date"),
          })}
        </p>
      </header>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">{t("card.purpose")}</h2>
        <p>{purpose.bn}</p>
      </section>

      <section className="flex flex-wrap gap-6 text-sm">
        <span>
          {t("card.who")}: {t(`role.${card.assignedRole}`)}
        </span>
        {times.length > 0 ? (
          <span>
            {t("card.when")}: {times.join(", ")}
            {days}
          </span>
        ) : null}
      </section>

      <ol className={tight ? "columns-2 gap-6 space-y-2 text-sm" : "space-y-3"}>
        {steps.map((step, index) => (
          <li className="flex gap-3 border-b pb-3" key={step.id}>
            <span className="text-lg font-semibold">
              {formatDigits(index + 1, CARD_LANGUAGE)}
            </span>
            <div className="space-y-1">
              <p className="text-lg">{step.text.bn}</p>
              <p className="text-muted-foreground text-sm">
                {t("card.records")}:{" "}
                {step.evidence
                  .map((item) => t(`sop.evidence.${item.type}`))
                  .join(", ")}
                {step.repeatPerAnimal ? ` · ${t("card.perAnimal")}` : ""}
              </p>
              {step.skipReasons.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("sop.skipReasons")}:{" "}
                  {step.skipReasons.map((skip) => skip.bn).join(", ")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
};

/**
 * The SOP Card: one page, in Bangla, for the shed wall — with, around it on the screen only, the way back to the
 * Playbook, the print, and who has been taught from it.
 */
const CardPage = () => {
  const { definitionId } = Route.useParams();
  const t = useT();
  const me = useQuery(orpc.people.me.queryOptions());
  const card = useQuery(
    orpc.sops.card.queryOptions({ input: { definitionId } })
  );
  // The Playbook is the Owner's and the Manager's; anybody else came to the card from somewhere else.
  const keepsPlaybook =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;

  return (
    <Page className="max-w-screen-xl">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        {keepsPlaybook ? (
          <Link
            className={buttonVariants({ variant: "ghost" })}
            to="/admin/sops"
          >
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t("sop.backToPlaybook")}
          </Link>
        ) : (
          <span />
        )}
        <Button
          disabled={!card.data}
          onClick={() => window.print()}
          type="button"
        >
          <Printer aria-hidden data-icon="inline-start" />
          {t("common.print")}
        </Button>
      </div>

      <Loaded
        query={card}
        skeleton={
          <Skeleton className="mx-auto h-[60vh] w-full max-w-[210mm] rounded-xl" />
        }
      >
        {card.data ? (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <WallCard card={card.data} />
            <TrainedOn
              definitionId={definitionId}
              versionId={card.data.versionId}
            />
          </div>
        ) : null}
      </Loaded>
    </Page>
  );
};

/**
 * Who has been taught this procedure, and the way to say somebody has. Kept beside the card
 * because the two belong together: the card is what a person is taught from, and the farm's
 * answer to "did they know this on the day" is a question that only gets asked afterwards.
 */
const TrainedOn = ({
  definitionId,
  versionId,
}: {
  definitionId: string;
  versionId: string;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [who, setWho] = useState("");

  const people = useQuery(orpc.people.list.queryOptions());
  const trained = useQuery(
    orpc.sops.training.queryOptions({ input: { definitionId } })
  );
  const mark = useMutation(
    orpc.sops.recordTraining.mutationOptions({
      onSuccess: () => {
        setWho("");
        queryClient.invalidateQueries({ queryKey: orpc.sops.training.key() });
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  return (
    <Section
      className="no-print xl:sticky xl:top-6"
      description={t("training.hint")}
      id="training"
      title={t("training.title")}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (who) {
            mark.mutate({ userId: who, versionId });
          }
        }}
      >
        <FormField id="training-who" label={t("training.who")}>
          <NativeSelect
            id="training-who"
            onChange={(event) => setWho(event.target.value)}
            value={who}
          >
            <option value="">—</option>
            {(people.data?.people ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <Button disabled={!who || mark.isPending} type="submit">
          {mark.isPending ? (
            <Spinner />
          ) : (
            <UserCheck aria-hidden data-icon="inline-start" />
          )}
          {t("training.mark")}
        </Button>
      </form>
      {trained.data?.length ? (
        <RecordList className="border-t">
          {trained.data.map((row) => (
            <RecordRow
              key={row.id}
              leading={
                <span className="bg-secondary text-secondary-foreground grid size-8 place-items-center rounded-full">
                  <GraduationCap aria-hidden className="size-4" />
                </span>
              }
              meta={t("training.on", {
                number: row.versionNumber,
                date: formatDate(new Date(row.trainedAt), language, "date"),
              })}
              title={row.personName}
            />
          ))}
        </RecordList>
      ) : (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          {t("training.none")}
        </p>
      )}
    </Section>
  );
};

export const Route = createFileRoute("/_auth/cards/$definitionId")({
  component: CardPage,
});
