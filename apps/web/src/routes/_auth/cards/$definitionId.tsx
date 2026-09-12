import { formatDate, formatDigits, translate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
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

/**
 * The SOP Card: one page, in Bangla, for the shed wall.
 *
 * It is generated from the published Version rather than written beside it, so the paper on
 * the wall and the procedure the farm enforces cannot drift apart — and it names its own
 * Version and publication date, so a card somebody printed in March can be checked rather
 * than trusted.
 */
const CardPage = () => {
  const { definitionId } = Route.useParams();
  // The card goes on a shed wall, so it is Bangla whoever printed it — including a Manager
  // whose own app is in English. The people who read it off the wall read Bangla.
  const t = onTheWall;
  const card = useQuery(
    orpc.sops.card.queryOptions({ input: { definitionId } })
  );

  if (!card.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }
  const { name, purpose, steps, number, publishedAt, triggers } = card.data;
  const times = triggers.flatMap((trigger) =>
    trigger.kind === "schedule" ? trigger.times : []
  );
  const tight = steps.length > STEPS_BEFORE_TIGHTENING;

  return (
    <div
      className="mx-auto max-w-[210mm] space-y-4 p-6 print:p-0"
      id="sop-card"
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

      <div className="no-print flex justify-end">
        <Button onClick={() => window.print()} type="button" variant="outline">
          {t("card.print")}
        </Button>
      </div>

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
          {t("card.who")}: {t(`role.${card.data.assignedRole}`)}
        </span>
        {times.length > 0 ? (
          <span>
            {t("card.when")}: {times.join(", ")}
          </span>
        ) : null}
      </section>

      <TrainedOn definitionId={definitionId} versionId={card.data.versionId} />

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
    </div>
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
  const t = useT();
  const { language } = useLanguage();
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
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <section className="no-print space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">{t("training.title")}</h2>
      {trained.data?.length ? (
        <ul className="space-y-1 text-sm">
          {trained.data.map((row) => (
            <li className="text-muted-foreground" key={row.id}>
              {row.personName} ·{" "}
              {t("training.on", {
                number: row.versionNumber,
                date: formatDate(new Date(row.trainedAt), language, "date"),
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("training.none")}</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (who) {
            mark.mutate({ userId: who, versionId });
          }
        }}
      >
        <select
          aria-label={t("training.mark")}
          className="bg-background h-9 flex-1 rounded-md border px-2 text-sm"
          onChange={(event) => setWho(event.target.value)}
          value={who}
        >
          <option value="">—</option>
          {(people.data?.people ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <Button disabled={!who} type="submit">
          {t("training.mark")}
        </Button>
      </form>
    </section>
  );
};

export const Route = createFileRoute("/_auth/cards/$definitionId")({
  component: CardPage,
});
