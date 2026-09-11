import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** What a Pen is fed, and what this session calls for. The figures are the farm's own: a
 *  Ration says what one animal gets in a day, and the bucket's number is worked out from the
 *  animals actually standing there. */
const FeedPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const [penId, setPenId] = useState<string>("");
  const [newItem, setNewItem] = useState("");

  const sheds = useQuery(orpc.herd.list.queryOptions());
  const items = useQuery(orpc.feed.items.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const chosen = penId || pens[0]?.id || "";

  const target = useQuery({
    ...orpc.feed.target.queryOptions({ input: { penId: chosen } }),
    enabled: chosen !== "",
  });

  const refresh = () => {
    queryClient.invalidateQueries();
  };
  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: () => {
        setNewItem("");
        refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const retireItem = useMutation(
    orpc.feed.retireItem.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="font-medium text-lg">{t("feed.title")}</h1>

      <section className="space-y-2">
        <h2 className="font-medium">{t("feed.items")}</h2>
        <ul className="space-y-1 text-sm">
          {(items.data ?? []).map((item) => (
            <li className="flex items-center justify-between gap-2" key={item.id}>
              <span className={item.retiredAt ? "text-muted-foreground" : ""}>
                {item.nameBn}
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
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (newItem.trim()) {
              addItem.mutate({ name: { bn: newItem.trim() } });
            }
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="feed-name">{t("feed.items")}</Label>
            <Input
              id="feed-name"
              onChange={(e) => setNewItem(e.target.value)}
              value={newItem}
            />
          </div>
          <Button type="submit">{t("feed.addItem")}</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("feed.ration")}</h2>
        <select
          aria-label={t("feed.ration")}
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          onChange={(e) => setPenId(e.target.value)}
          value={chosen}
        >
          {pens.map((pen) => (
            <option key={pen.id} value={pen.id}>
              {pen.name}
            </option>
          ))}
        </select>

        {target.data?.ration ? (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium text-sm">
              {target.data.ration.name.bn} · {t("feed.target")}
            </p>
            <ul className="space-y-1 text-sm">
              {target.data.items.map((line) => (
                <li key={line.feedItemId}>
                  <span className="font-medium">
                    {line.nameBn}: {line.kg} kg
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("feed.working", {
                      headcount: target.data.headcount,
                      perAnimal: line.kgPerAnimalPerDay,
                      sessions: target.data.sessionsPerDay,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
            {t("feed.noRation")}
          </p>
        )}

        <RationForm
          items={(items.data ?? []).filter((item) => !item.retiredAt)}
          key={chosen}
          onSaved={refresh}
          penId={chosen}
        />
      </section>
    </div>
  );
};

/** Setting what a Pen is fed: a line per Feed Item, in kilos per animal per day. */
const RationForm = ({
  penId,
  items,
  onSaved,
}: {
  penId: string;
  items: { id: string; nameBn: string }[];
  onSaved: () => void;
}) => {
  const t = useT();
  const existing = useQuery({
    ...orpc.feed.ration.queryOptions({ input: { penId } }),
    enabled: penId !== "",
  });
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("2");
  const [kg, setKg] = useState<Record<string, string>>({});

  const save = useMutation(
    orpc.feed.setRation.mutationOptions({
      onSuccess: onSaved,
      onError: (error) => toast.error(error.message),
    })
  );

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>
    );
  }

  const lines = items
    .map((item) => ({
      feedItemId: item.id,
      kgPerAnimalPerDay: Number(
        kg[item.id] ??
          existing.data?.items.find((line) => line.feedItemId === item.id)
            ?.kgPerAnimalPerDay ??
          ""
      ),
    }))
    .filter((line) => line.kgPerAnimalPerDay > 0);

  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          penId,
          name: { bn: name || existing.data?.name.bn || t("feed.ration") },
          sessionsPerDay: Number(sessions) || 1,
          items: lines,
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="ration-name">{t("feed.rationName")}</Label>
          <Input
            id="ration-name"
            onChange={(e) => setName(e.target.value)}
            placeholder={existing.data?.name.bn ?? ""}
            value={name}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ration-sessions">{t("feed.sessionsPerDay")}</Label>
          <Input
            className="w-24"
            id="ration-sessions"
            min={1}
            onChange={(e) => setSessions(e.target.value)}
            type="number"
            value={sessions}
          />
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li className="flex items-end gap-2" key={item.id}>
            <div className="flex-1 space-y-1">
              <Label htmlFor={`kg-${item.id}`}>{item.nameBn}</Label>
              <Input
                id={`kg-${item.id}`}
                min={0}
                onChange={(e) =>
                  setKg((current) => ({ ...current, [item.id]: e.target.value }))
                }
                placeholder={t("feed.kgPerAnimal")}
                step="0.1"
                type="number"
                value={
                  kg[item.id] ??
                  existing.data?.items
                    .find((line) => line.feedItemId === item.id)
                    ?.kgPerAnimalPerDay ??
                  ""
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <Button disabled={lines.length === 0} type="submit">
        {t("feed.setRation")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/admin/feed")({
  component: FeedPage,
});
