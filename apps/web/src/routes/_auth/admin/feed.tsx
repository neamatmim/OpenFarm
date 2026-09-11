import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type RationRow = {
  id: string;
  name: { bn: string; en: string | null };
  number: number | null;
  items: { feedItemId: string; kgPerAnimalPerDay: number }[];
  penIds: string[];
};

type FeedRow = {
  id: string;
  nameBn: string;
  unit: string;
  retiredAt: Date | null;
};

/** What the farm feeds, what each Ration says, and what this session calls for in a Pen. The
 *  figures are the farm's own: a Ration says what one animal gets in a day, and the bucket's
 *  number is worked out from the animals actually standing there. */
const FeedPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const [penId, setPenId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const sheds = useQuery(orpc.herd.list.queryOptions());
  const items = useQuery(orpc.feed.items.queryOptions());
  const rations = useQuery(orpc.feed.rations.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const chosen = penId || pens[0]?.id || "";
  const target = useQuery({
    ...orpc.feed.target.queryOptions({ input: { penId: chosen } }),
    enabled: chosen !== "",
  });

  /** Only what this screen shows: a whole-app refetch for a saved ration is a waste of a
   *  shed phone's signal. */
  const refresh = () => {
    for (const key of [
      orpc.feed.items.key(),
      orpc.feed.rations.key(),
      orpc.feed.target.key(),
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const assign = useMutation(
    orpc.feed.assignRation.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="font-medium text-lg">{t("feed.title")}</h1>

      <FeedItems items={(items.data ?? []) as FeedRow[]} onChanged={refresh} />

      <section className="space-y-2">
        <h2 className="font-medium">{t("feed.target")}</h2>
        <div className="space-y-1">
          <Label htmlFor="feed-pen">{t("feed.pen")}</Label>
          <select
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
            id="feed-pen"
            onChange={(e) => setPenId(e.target.value)}
            value={chosen}
          >
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name}
              </option>
            ))}
          </select>
        </div>
        {target.data?.ration ? (
          <TargetPanel target={target.data} />
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
            {t("feed.noRation")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("feed.rations")}</h2>
        {(rations.data ?? []).map((row) => (
          <article className="space-y-2 rounded-lg border p-3" key={row.id}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-sm">{row.name.bn}</span>
              <span className="text-muted-foreground text-xs">
                {row.number ? t("feed.version", { number: row.number }) : ""}
                {" · "}
                {t("feed.pensOn", { count: row.penIds.length })}
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              {row.penIds.includes(chosen) ? (
                <span className="text-muted-foreground text-xs">
                  {t("feed.assigned")}
                </span>
              ) : (
                <Button
                  onClick={() =>
                    assign.mutate({ penId: chosen, rationId: row.id })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("feed.assign")}
                </Button>
              )}
              <Button
                onClick={() => setEditing(editing === row.id ? null : row.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("sop.edit")}
              </Button>
            </div>
            {editing === row.id ? (
              <RationForm
                items={(items.data ?? []) as FeedRow[]}
                onSaved={() => {
                  setEditing(null);
                  refresh();
                }}
                ration={row}
              />
            ) : null}
          </article>
        ))}
        {editing === "new" ? (
          <RationForm
            items={(items.data ?? []) as FeedRow[]}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
            ration={null}
          />
        ) : (
          <Button onClick={() => setEditing("new")} type="button" variant="outline">
            {t("feed.newRation")}
          </Button>
        )}
      </section>
    </div>
  );
};

/** This session's Feeding Target, with the arithmetic beside it. A number nobody can check
 *  is a number nobody trusts. */
const TargetPanel = ({
  target,
}: {
  target: {
    ration: { name: { bn: string }; number: number } | null;
    animals: number;
    sessionsPerDay: number;
    items: {
      feedItemId: string;
      nameBn: string;
      unit: string;
      kgPerAnimalPerDay: number;
      quantity: number;
    }[];
  };
}) => {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="font-medium text-sm">
        {target.ration?.name.bn}
        {target.ration
          ? ` · ${t("feed.version", { number: target.ration.number })}`
          : ""}
      </p>
      <ul className="space-y-1 text-sm">
        {target.items.map((line) => (
          <li key={line.feedItemId}>
            <span className="font-medium">
              {line.nameBn}: {formatNumber(line.quantity, language)} {line.unit}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {t("feed.working", {
                headcount: formatNumber(target.animals, language),
                perAnimal: formatNumber(line.kgPerAnimalPerDay, language),
                sessions: formatNumber(target.sessionsPerDay, language),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The farm's Feed Items. Retired rather than removed: a Ration that fed it still names it. */
const FeedItems = ({
  items,
  onChanged,
}: {
  items: FeedRow[];
  onChanged: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState("");
  const [english, setEnglish] = useState("");
  const [unit, setUnit] = useState("kg");

  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: () => {
        setName("");
        setEnglish("");
        onChanged();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const retireItem = useMutation(
    orpc.feed.retireItem.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("feed.items")}</h2>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li className="flex items-center justify-between gap-2" key={item.id}>
            <span className={item.retiredAt ? "text-muted-foreground" : ""}>
              {item.nameBn} · {item.unit}
              {item.retiredAt ? ` · ${t("feed.retired")}` : ""}
            </span>
            {item.retiredAt ? null : (
              <Button
                onClick={() => retireItem.mutate({ id: item.id })}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("feed.retire")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            addItem.mutate({
              name: {
                bn: name.trim(),
                ...(english.trim() ? { en: english.trim() } : {}),
              },
              unit: unit.trim() || "kg",
            });
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="feed-name">{t("sop.bangla")}</Label>
          <Input
            id="feed-name"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="feed-en">{t("feed.english")}</Label>
          <Input
            id="feed-en"
            onChange={(e) => setEnglish(e.target.value)}
            value={english}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="feed-unit">{t("feed.unit")}</Label>
          <Input
            className="w-20"
            id="feed-unit"
            onChange={(e) => setUnit(e.target.value)}
            value={unit}
          />
        </div>
        <Button type="submit">{t("feed.addItem")}</Button>
      </form>
    </section>
  );
};

/**
 * Writing a Ration: a line per Feed Item, in units per animal per day.
 *
 * Every Item the Ration already names is offered, retired ones included. Dropping a line
 * because the feed was retired would rewrite what a Pen is fed without anybody asking for it.
 */
const RationForm = ({
  ration,
  items,
  onSaved,
}: {
  ration: RationRow | null;
  items: FeedRow[];
  onSaved: () => void;
}) => {
  const t = useT();
  const inRation = new Set((ration?.items ?? []).map((line) => line.feedItemId));
  const offered = items.filter((item) => !item.retiredAt || inRation.has(item.id));

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
      onSuccess: onSaved,
      onError: (error) => toast.error(error.message),
    })
  );

  if (offered.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>;
  }

  const lines = offered
    .map((item) => ({
      feedItemId: item.id,
      kgPerAnimalPerDay: Number(kg[item.id] ?? ""),
    }))
    .filter((line) => line.kgPerAnimalPerDay > 0);

  return (
    <form
      className="space-y-2 border-t pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          return;
        }
        save.mutate({
          ...(ration ? { rationId: ration.id } : {}),
          name: {
            bn: name.trim(),
            ...(english.trim() ? { en: english.trim() } : {}),
          },
          items: lines,
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`ration-name-${ration?.id ?? "new"}`}>
            {t("feed.rationName")}
          </Label>
          <Input
            id={`ration-name-${ration?.id ?? "new"}`}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={`ration-en-${ration?.id ?? "new"}`}>
            {t("feed.english")}
          </Label>
          <Input
            id={`ration-en-${ration?.id ?? "new"}`}
            onChange={(e) => setEnglish(e.target.value)}
            value={english}
          />
        </div>
      </div>
      <ul className="space-y-1">
        {offered.map((item) => (
          <li key={item.id}>
            <Label htmlFor={`kg-${ration?.id ?? "new"}-${item.id}`}>
              {item.nameBn} ({item.unit})
              {item.retiredAt ? ` · ${t("feed.retired")}` : ""}
            </Label>
            <Input
              id={`kg-${ration?.id ?? "new"}-${item.id}`}
              min={0}
              onChange={(e) =>
                setKg((current) => ({ ...current, [item.id]: e.target.value }))
              }
              placeholder={t("feed.kgPerAnimal")}
              step="0.1"
              type="number"
              value={kg[item.id] ?? ""}
            />
          </li>
        ))}
      </ul>
      <Button
        disabled={lines.length === 0 || !name.trim()}
        type="submit"
      >
        {t("feed.setRation")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/admin/feed")({
  component: FeedPage,
});
