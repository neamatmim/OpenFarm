import { formatDate, formatDigits, translate } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  GraduationCap,
  Printer,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  RecordList,
  RecordRow,
  Section,
  StatusBadge,
} from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { whenWords } from "@/components/playbook/playbook-types";
import { useLanguage } from "@/i18n/language-provider";
import { printAlone } from "@/lib/print-alone";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/**
 * The card, printed alone on one A4 page: it is for a wall, not a screen, and a card that runs onto a second sheet is
 * half a card by the time somebody reads it — so a narrow margin, and smaller type for a card with many Steps.
 */
const printTheCard = () => {
  const card = document.querySelector<HTMLElement>("#sop-card");
  if (card) {
    void printAlone(card, {
      margin: "12mm",
      fontSize: card.dataset.tight === "true" ? "10pt" : "12pt",
    });
  }
};

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

/** A fact about the work, as the card sets it: what it is, above what it says. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1 rounded-lg border px-3 py-2.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="font-medium">{children}</span>
  </div>
);

/** What a Step asks to be written down, one mark each: a tick, a photo, a number in its unit. */
const EvidenceMarks = ({ step }: { step: Card["steps"][number] }) => {
  const t = onTheWall;
  return (
    <span className="flex flex-wrap gap-1.5">
      {step.evidence.map((item, index) => (
        <Badge key={`${item.type}-${index}`} variant="outline">
          {t(`sop.evidence.${item.type}`)}
          {item.type === "number" && item.unit ? ` · ${item.unit.bn}` : ""}
        </Badge>
      ))}
      {step.repeatPerAnimal ? (
        <Badge variant="secondary">{t("card.perAnimal")}</Badge>
      ) : null}
    </span>
  );
};

/**
 * The card itself, as it goes on the wall: generated from the published Version rather than written beside it, so
 * the paper on the wall and the procedure the farm enforces cannot drift apart — and it names its own Version and
 * publication date, so a card somebody printed in March can be checked rather than trusted.
 *
 * Set as a notice is: the name and its Version at the top, who does it and when as facts to find at a glance, why, and
 * then the steps, numbered, each with what it asks to be written down.
 */
const WallCard = ({ card }: { card: Card }) => {
  // The card goes on a shed wall, so it is Bangla whoever printed it — including a Manager
  // whose own app is in English. The people who read it off the wall read Bangla.
  const t = onTheWall;
  const { name, purpose, steps, number, publishedAt, triggers } = card;
  // When the work comes up, as the Playbook says it: the clock's times and days, or what happens that raises it.
  const when = whenWords({ triggers }, t, CARD_LANGUAGE);
  const tight = steps.length > STEPS_BEFORE_TIGHTENING;
  // A card cached before the farm said who checks the work, or whether it is the whole farm's, says neither.
  const checker = card.checkerRole ?? null;

  return (
    <article
      className="bg-card flex w-full flex-col gap-5 rounded-xl border p-6 shadow-(--surface-shadow) md:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
      data-tight={tight}
      id="sop-card"
      lang={CARD_LANGUAGE}
    >
      <header className="border-foreground flex flex-col gap-2 border-b-2 pb-4">
        <span className="text-muted-foreground text-xs font-semibold">
          {t("card.title")}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {name.bn}
        </h2>
        <span className="text-muted-foreground text-sm">
          {t("card.version", {
            number: formatDigits(number, CARD_LANGUAGE),
            date: formatDate(new Date(publishedAt), CARD_LANGUAGE, "date"),
          })}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        <Fact label={t("card.who")}>{t(`role.${card.assignedRole}`)}</Fact>
        <Fact label={t("card.checker")}>
          {checker ? t(`role.${checker}`) : t("sop.checkerNone")}
        </Fact>
        <Fact label={t("card.when")}>
          {when.length > 0 ? when.join(" · ") : t("card.whenNeeded")}
        </Fact>
        <Fact label={t("card.where")}>
          {card.wholeFarm ? t("card.wholeFarm") : t("card.eachPen")}
        </Fact>
      </div>

      <div className="bg-muted flex flex-col gap-1 rounded-lg px-4 py-3">
        <span className="text-muted-foreground text-xs font-semibold">
          {t("card.purpose")}
        </span>
        <p>{purpose.bn}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="border-b pb-1.5 text-sm font-semibold">
          {t("card.steps")}
        </h3>
        <ol
          className={
            tight ? "columns-2 gap-6 text-sm [&>li]:break-inside-avoid" : ""
          }
        >
          {steps.map((step, index) => (
            <li
              className="flex gap-3 border-b py-3 last:border-b-0"
              key={step.id}
            >
              <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold">
                {formatDigits(index + 1, CARD_LANGUAGE)}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-base font-medium">{step.text.bn}</p>
                <EvidenceMarks step={step} />
                {step.skipReasons.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("card.skippable")}:{" "}
                    {step.skipReasons.map((skip) => skip.bn).join(", ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="text-muted-foreground border-t pt-3 text-xs">
        {t("card.madeFrom")}
      </footer>
    </article>
  );
};

/**
 * The SOP Card: one page, in Bangla, for the shed wall — with, around it on the screen only, the way back to the
 * Playbook, the print, and who has been taught from it. The page speaks the reader's language; the card, the shed's.
 */
const CardPage = () => {
  const { definitionId } = Route.useParams();
  const { t } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const card = useQuery(
    orpc.sops.card.queryOptions({ input: { definitionId } })
  );
  // The Playbook is the Owner's and the Manager's; anybody else came to the card from somewhere else.
  const keepsPlaybook =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;

  return (
    <Page>
      {keepsPlaybook ? (
        <Link
          className="text-muted-foreground hover:text-foreground no-print -mb-2 inline-flex min-h-11 items-center gap-1 self-start text-sm md:min-h-0"
          to="/admin/sops"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("sop.backToPlaybook")}
        </Link>
      ) : null}
      {/* The page is about the card; the card says which procedure and which Version, as the wall will see it. */}
      <PageHeader
        actions={
          <Button disabled={!card.data} onClick={printTheCard} type="button">
            <Printer aria-hidden data-icon="inline-start" />
            {t("common.print")}
          </Button>
        }
        description={t("card.pageHint")}
        meta={
          card.data?.retired ? (
            <>
              <StatusBadge icon={Archive} tone="neutral">
                {t("sop.retired")}
              </StatusBadge>
              <span>{t("card.retiredHint")}</span>
            </>
          ) : null
        }
        title={t("card.title")}
      />

      <Loaded
        query={card}
        skeleton={<Skeleton className="h-[60vh] w-full rounded-xl" />}
      >
        {card.data ? (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <WallCard card={card.data} />
            {/* Who was taught from it is the Owner's and the Manager's to keep: anybody else reads the card alone,
                rather than a form whose every answer the farm would refuse. */}
            {keepsPlaybook ? (
              <TrainedOn
                definitionId={definitionId}
                versionId={card.data.versionId}
              />
            ) : null}
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
  const refused = useRefused();
  const [who, setWho] = useState("");

  const people = useQuery(orpc.people.list.queryOptions());
  const trained = useQuery(
    orpc.sops.training.queryOptions({ input: { definitionId } })
  );
  const mark = useMutation(
    orpc.sops.recordTraining.mutationOptions({
      onSuccess: () => {
        setWho("");
      },
      onError: refused,
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
            {/* Only people who may still sign in: the farm will not record training for somebody whose access is
                gone. */}
            {(people.data?.people ?? [])
              .filter((person) => !person.disabledAt)
              .map((person) => (
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
              title={
                <Link
                  className="hover:underline"
                  params={{ userId: row.userId }}
                  to="/admin/people/$userId"
                >
                  {row.personName}
                </Link>
              }
            />
          ))}
        </RecordList>
      ) : (
        <EmptyState bare icon={GraduationCap} title={t("training.none")} />
      )}
    </Section>
  );
};

export const Route = createFileRoute("/_auth/cards/$definitionId")({
  component: CardPage,
});
