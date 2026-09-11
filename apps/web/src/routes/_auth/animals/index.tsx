import { SIDES } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AnimalPhoto } from "@/components/animal-photo";
import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const AnimalsPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [side, setSide] = useState<string>("");
  const [tag, setTag] = useState("");
  const animals = useQuery(
    orpc.animals.list.queryOptions({
      input: {
        side: side === "" ? undefined : (side as (typeof SIDES)[number]),
        includeExited: false,
      },
    })
  );

  return (
    <div className="container mx-auto max-w-3xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("animals.title")}</h1>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (tag.trim()) {
            navigate({
              to: "/animals/$tagNumber",
              params: { tagNumber: tag.trim().toUpperCase() },
            });
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="tag">{t("animals.search")}</Label>
          <Input
            id="tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="D-0001"
          />
        </div>
        <Button type="submit" variant="outline">
          {t("animals.find")}
        </Button>
        <div className="space-y-1">
          <Label htmlFor="side">{t("animals.side")}</Label>
          <select
            id="side"
            value={side}
            onChange={(e) => setSide(e.target.value)}
            className="bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">{t("audit.all")}</option>
            {SIDES.map((value) => (
              <option key={value} value={value}>
                {t(`animals.side.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </form>

      {animals.data?.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {animals.data.map((a) => (
            <li key={a.id}>
              <Link
                to="/animals/$tagNumber"
                params={{ tagNumber: a.tagNumber }}
                className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-900 p-3 hover:bg-neutral-800"
              >
                <AnimalPhoto
                  tagNumber={a.tagNumber}
                  photoUpdatedAt={a.photoUpdatedAt}
                />
                <span className="font-bold">{a.tagNumber}</span>
                <span className="text-muted-foreground text-xs">
                  {t(`state.${a.state}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("animals.none")}</p>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/animals/")({
  component: AnimalsPage,
});
