import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Pencil, Plus, Utensils } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow, RationRow } from "./feed-types";

/**
 * Writing a Ration: a line per Feed Item, in units per animal per day, in a dialog.
 *
 * Every Item the Ration already names is offered, retired ones included. Dropping a line
 * because the feed was retired would rewrite what a Pen is fed without anybody asking for it.
 */
const RationDialog = ({
  ration,
  items,
  open,
  onOpenChange,
}: {
  ration: RationRow | null;
  items: FeedItemRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const inRation = new Set(
    (ration?.items ?? []).map((line) => line.feedItemId)
  );
  const offered = items.filter(
    (item) => !item.retiredAt || inRation.has(item.id)
  );
  const [name, setName] = useState(ration?.name.bn ?? "");
  const [english, setEnglish] = useState(ration?.name.en ?? "");
  const [kg, setKg] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (ration?.items ?? []).map((line) => [
        line.feedItemId,
        String(line.kgPerAnimalPerDay),
      ])
    )
  );
  const save = useMutation(
    orpc.feed.saveRation.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const lines = offered
    .map((item) => ({
      feedItemId: item.id,
      kgPerAnimalPerDay: Number(kg[item.id] ?? ""),
    }))
    .filter((line) => line.kgPerAnimalPerDay > 0);
  const idFor = (part: string) => `ration-${ration?.id ?? "new"}-${part}`;

  return (
    <FormDialog
      className="sm:max-w-lg"
      description={t("feed.rationsDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        save.mutate({
          ...(ration ? { rationId: ration.id } : {}),
          name: {
            bn: name.trim(),
            ...(english.trim() ? { en: english.trim() } : {}),
          },
          items: lines,
        })
      }
      open={open}
      pending={save.isPending}
      ready={lines.length > 0 && name.trim() !== ""}
      submitLabel={t("feed.setRation")}
      title={ration ? t("feed.editRation") : t("feed.newRation")}
    >
      {offered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={idFor("name")}>{t("feed.rationName")}</Label>
              <Input
                id={idFor("name")}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={idFor("en")}>{t("feed.english")}</Label>
              <Input
                id={idFor("en")}
                onChange={(event) => setEnglish(event.target.value)}
                value={english}
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t("feed.kgPerAnimal")}
            </legend>
            <ul className="divide-border max-h-80 divide-y overflow-y-auto rounded-lg border">
              {offered.map((item) => (
                <li
                  className="flex items-center justify-between gap-3 px-3 py-2"
                  key={item.id}
                >
                  <Label className="font-normal" htmlFor={idFor(item.id)}>
                    {item.nameBn}
                    {item.retiredAt ? ` · ${t("feed.retired")}` : ""}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-24 text-right"
                      id={idFor(item.id)}
                      inputMode="decimal"
                      min={0}
                      onChange={(event) =>
                        setKg((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      step="0.1"
                      type="number"
                      value={kg[item.id] ?? ""}
                    />
                    <span className="text-muted-foreground w-6 text-xs">
                      {item.unit}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        </>
      )}
    </FormDialog>
  );
};

/** This session's Feeding Target for one Pen, with the arithmetic beside each line. A number nobody can check is a
 *  number nobody trusts. */
const FeedingTarget = ({ penId }: { penId: string }) => {
  const { t, language } = useLanguage();
  const target = useQuery({
    ...orpc.feed.target.queryOptions({ input: { penId } }),
    enabled: penId !== "",
  });
  if (!target.data?.ration) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        {t("feed.noRation")}
      </p>
    );
  }
  const { ration, animals, sessionsPerDay, items } = target.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{ration.name.bn}</span>
        <span className="text-muted-foreground">
          {" · "}
          {t("feed.version", { number: ration.number })}
        </span>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((line) => (
          <li className="surface flex flex-col gap-1 p-3" key={line.feedItemId}>
            <span className="text-muted-foreground text-sm">{line.nameBn}</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatNumber(line.quantity, language)} {line.unit}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("feed.working", {
                headcount: formatNumber(animals, language),
                perAnimal: formatNumber(line.kgPerAnimalPerDay, language),
                sessions: formatNumber(sessionsPerDay, language),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One Ration as a card: its name and version, what one animal gets, the Pens on it, and what can be done with it. */
const RationCard = ({
  ration,
  items,
  chosenPenId,
  onEdit,
}: {
  ration: RationRow;
  items: FeedItemRow[];
  chosenPenId: string;
  onEdit: () => void;
}) => {
  const { t, language } = useLanguage();
  const assign = useMutation(
    orpc.feed.assignRation.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const names = new Map(items.map((item) => [item.id, item]));
  const onChosenPen = ration.penIds.includes(chosenPenId);
  return (
    <article className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-semibold">{ration.name.bn}</h3>
          <span className="text-muted-foreground text-xs">
            {ration.number ? t("feed.version", { number: ration.number }) : ""}
            {" · "}
            {t("feed.pensOn", {
              count: formatNumber(ration.penIds.length, language),
            })}
          </span>
        </div>
        <Button
          aria-label={t("feed.editRation")}
          onClick={onEdit}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden />
        </Button>
      </header>
      <ul className="flex flex-col gap-1 text-sm">
        {ration.items.map((line) => {
          const item = names.get(line.feedItemId);
          return (
            <li className="flex justify-between gap-2" key={line.feedItemId}>
              <span className="text-muted-foreground">
                {item?.nameBn ?? "—"}
              </span>
              <span className="tabular-nums">
                {formatNumber(line.kgPerAnimalPerDay, language)}{" "}
                {item?.unit ?? ""}
              </span>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto border-t pt-3">
        {onChosenPen ? (
          <StatusBadge icon={Check} tone="success">
            {t("feed.assigned")}
          </StatusBadge>
        ) : (
          <Button
            disabled={assign.isPending || chosenPenId === ""}
            onClick={() =>
              assign.mutate({ penId: chosenPenId, rationId: ration.id })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            {t("feed.assign")}
          </Button>
        )}
      </footer>
    </article>
  );
};

/** The Feeding Target of the Pen chosen, and the farm's Rations, each ready to put that Pen on. */
export const RationsTab = ({
  items,
  rations,
  pens,
  mayEdit,
}: {
  items: FeedItemRow[];
  rations: RationRow[];
  pens: { id: string; name: string }[];
  mayEdit: boolean;
}) => {
  const { t } = useLanguage();
  const [penId, setPenId] = useState("");
  const [editing, setEditing] = useState<RationRow | "new" | null>(null);
  const chosen = penId || pens[0]?.id || "";
  return (
    <div className="flex flex-col gap-6">
      <Section
        description={t("feed.targetDescription")}
        title={t("feed.target")}
      >
        <FormField className="md:w-72" id="feed-pen" label={t("feed.pen")}>
          <NativeSelect
            id="feed-pen"
            onChange={(event) => setPenId(event.target.value)}
            value={chosen}
          >
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {chosen ? <FeedingTarget penId={chosen} /> : null}
      </Section>

      <Section
        action={
          mayEdit ? (
            <Button onClick={() => setEditing("new")} type="button">
              <Plus aria-hidden data-icon="inline-start" />
              {t("feed.newRation")}
            </Button>
          ) : null
        }
        description={t("feed.rationsDescription")}
        plain
        title={t("feed.rations")}
      >
        {rations.length === 0 ? (
          <EmptyState icon={Utensils} title={t("feed.noRation")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rations.map((ration) => (
              <RationCard
                chosenPenId={chosen}
                items={items}
                key={ration.id}
                onEdit={() => setEditing(ration)}
                ration={ration}
              />
            ))}
          </div>
        )}
      </Section>

      {editing === null ? null : (
        <RationDialog
          items={items}
          key={editing === "new" ? "new" : editing.id}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
            }
          }}
          open
          ration={editing === "new" ? null : editing}
        />
      )}
    </div>
  );
};
