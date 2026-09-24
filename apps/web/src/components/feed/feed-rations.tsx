import type { RationLine, WeightBand } from "@OpenFarm/domain";
import {
  feedUnitOf,
  feedUnitWord,
  findBandProblems,
  isByWeight,
  mayGoByWeight,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  Plus,
  Utensils,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, Section, StatusBadge } from "@/components/page";
import type { RowAction } from "@/components/page-kit";
import {
  FormDialog,
  FormField,
  NativeSelect,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import { bandSaid } from "./band-words";
import type { FeedItemRow, RationRow } from "./feed-types";
import { amountOf } from "./feed-types";

/** A Ration's band, open at both ends where it has none — or where the list was cached before Rations had bands. */
const bandOfRow = (ration: RationRow | null): WeightBand =>
  ration?.band ?? { fromKg: null, toKg: null };

/** A weight typed into a band's box, or an open end where nothing was. */
const kgOrNone = (typed: string): number | null =>
  typed.trim() === "" ? null : Number(typed);

/** How a line counts: by the head, or by every hundred kilos of body weight. */
type Basis = "head" | "weight";

/** A line as the Ration stores it, from what was typed and how it counts. */
const lineOf = (
  feedItemId: string,
  amount: number,
  basis: Basis
): RationLine =>
  basis === "weight"
    ? { feedItemId, kgPer100KgPerDay: amount }
    : { feedItemId, kgPerAnimalPerDay: amount };

/**
 * Writing a Ration: a line per Feed Item, so much a day for each animal or for every hundred kilos it weighs, in a
 * dialog. Grass, straw and concentrate grow with the animals; salt and minerals go by the head.
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
  const { t, language } = useLanguage();
  const refused = useRefused();
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
        String(amountOf(line)),
      ])
    )
  );
  const written = bandOfRow(ration);
  const [fromKg, setFromKg] = useState(
    written.fromKg === null ? "" : String(written.fromKg)
  );
  const [toKg, setToKg] = useState(
    written.toKg === null ? "" : String(written.toKg)
  );
  const band = { fromKg: kgOrNone(fromKg), toKg: kgOrNone(toKg) };
  const [basis, setBasis] = useState<Record<string, Basis>>(() =>
    Object.fromEntries(
      (ration?.items ?? []).map((line) => [
        line.feedItemId,
        isByWeight(line) ? "weight" : "head",
      ])
    )
  );
  const save = useMutation(
    orpc.feed.saveRation.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const lines = offered.flatMap((item) => {
    const amount = Number(kg[item.id] ?? "");
    return amount > 0
      ? [lineOf(item.id, amount, basis[item.id] ?? "head")]
      : [];
  });
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
          band,
        })
      }
      open={open}
      pending={save.isPending}
      ready={
        lines.length > 0 &&
        name.trim() !== "" &&
        findBandProblems(band).length === 0
      }
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
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2"
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
                      // Salt goes in grams a head, and a line by weight in hundredths: any figure the farm writes.
                      step="any"
                      type="number"
                      value={kg[item.id] ?? ""}
                    />
                    <span className="text-muted-foreground w-10 text-xs">
                      {feedUnitWord(item.unit, language)}
                    </span>
                    <NativeSelect
                      aria-label={t("feed.basisOf", { item: item.nameBn })}
                      className="w-auto"
                      onChange={(event) =>
                        setBasis((current) => ({
                          ...current,
                          [item.id]: event.target.value as Basis,
                        }))
                      }
                      value={basis[item.id] ?? "head"}
                    >
                      <option value="head">{t("feed.basis.head")}</option>
                      {/* A bundle is counted, not weighed: a line by body weight would ask for a fraction of one. */}
                      <option
                        disabled={!mayGoByWeight(feedUnitOf(item.unit))}
                        value="weight"
                      >
                        {t("feed.basis.weight")}
                      </option>
                    </NativeSelect>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t("feed.band")}
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={idFor("from")}>{t("feed.bandFrom")}</Label>
                <Input
                  id={idFor("from")}
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setFromKg(event.target.value)}
                  type="number"
                  value={fromKg}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={idFor("to")}>{t("feed.bandTo")}</Label>
                <Input
                  id={idFor("to")}
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setToKg(event.target.value)}
                  type="number"
                  value={toKg}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("feed.bandHint")}
            </p>
          </fieldset>
        </>
      )}
    </FormDialog>
  );
};

type Target = Awaited<ReturnType<typeof orpc.feed.target.call>>;

/** The arithmetic under one line of a target, by the head or by weight — or, for a Pen nobody weighed, what to do. */
const Working = ({
  line,
  target,
}: {
  line: Target["items"][number];
  target: Target;
}) => {
  const { t, language } = useLanguage();
  const sessions = formatNumber(target.sessionsPerDay, language);
  if (!isByWeight(line)) {
    return t("feed.working", {
      headcount: formatNumber(target.animals, language),
      perAnimal: formatNumber(line.kgPerAnimalPerDay, language),
      unit: feedUnitWord(line.unit, language),
      sessions,
    });
  }
  const weight = target.herd?.weightKg ?? null;
  return weight === null
    ? t("feed.weighFirst")
    : t("feed.workingByWeight", {
        perHundred: formatNumber(line.kgPer100KgPerDay, language),
        unit: feedUnitWord(line.unit, language),
        weight: formatNumber(weight, language),
        sessions,
      });
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from then until now. */
const daysSince = (then: Date) =>
  Math.floor((Date.now() - then.getTime()) / ONE_DAY_MS);

/** What the Pen weighs, for a Ration with lines by weight: how many were weighed, and how old the oldest weight is. */
const HerdWeight = ({ herd }: { herd: NonNullable<Target["herd"]> }) => {
  const { t, language } = useLanguage();
  if (herd.weightKg === null) {
    return <p className="text-warning text-sm">{t("feed.weighFirst")}</p>;
  }
  const oldest = herd.oldestWeighedAt
    ? daysSince(new Date(herd.oldestWeighedAt))
    : null;
  const parts = [
    t("feed.herdWeight", {
      weight: formatNumber(herd.weightKg, language),
      weighed: formatNumber(herd.weighed, language),
    }),
    herd.unweighed > 0
      ? t("feed.herdUnweighed", {
          unweighed: formatNumber(herd.unweighed, language),
        })
      : "",
    oldest === null
      ? ""
      : t("feed.herdOldest", { days: formatNumber(oldest, language) }),
  ].filter(Boolean);
  return <p className="text-muted-foreground text-sm">{parts.join(" · ")}</p>;
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
  const { ration, herd, items } = target.data;
  const byWeight = items.some((line) => isByWeight(line));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{ration.name.bn}</span>
        <span className="text-muted-foreground">
          {" · "}
          {t("feed.version", { number: ration.number })}
        </span>
      </p>
      {byWeight && herd ? <HerdWeight herd={herd} /> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((line) => (
          <li className="surface flex flex-col gap-1 p-3" key={line.feedItemId}>
            <span className="text-muted-foreground text-sm">{line.nameBn}</span>
            <span className="text-xl font-semibold tabular-nums">
              {line.quantity === null
                ? "—"
                : `${formatNumber(line.quantity, language)} ${feedUnitWord(line.unit, language)}`}
            </span>
            <span className="text-muted-foreground text-xs">
              <Working line={line} target={target.data} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One Ration as a card: its name and version, what one animal gets, the Pens on it, and what can be done with it. */
/**
 * What can be done with a Ration from its card: put it right, and retire it or bring it back. Retiring is not offered
 * while a Pen is fed on it, and says why rather than leaving a line that only refuses.
 */
const useRationActs = (ration: RationRow, onEdit: () => void): RowAction[] => {
  const { t } = useLanguage();
  const refused = useRefused();
  const retire = useMutation(
    orpc.feed.retireRation.mutationOptions({
      onSuccess: () => toast.success(t("feed.rationRetired")),
      onError: refused,
    })
  );
  const bringBack = useMutation(
    orpc.feed.bringBackRation.mutationOptions({
      onSuccess: () => toast.success(t("feed.rationBroughtBack")),
      onError: refused,
    })
  );
  if (ration.retiredAt) {
    return [
      {
        label: t("feed.bringBack"),
        icon: ArchiveRestore,
        disabled: bringBack.isPending,
        handleSelect: () => bringBack.mutate({ id: ration.id }),
      },
    ];
  }
  const fedOn = ration.penIds.length > 0;
  return [
    { label: t("feed.editRation"), icon: Pencil, handleSelect: onEdit },
    {
      label: t("feed.retire"),
      icon: Archive,
      disabled: fedOn || retire.isPending,
      hint: fedOn ? t("feed.retireRationBusy") : undefined,
      handleSelect: () => retire.mutate({ id: ration.id }),
    },
  ];
};

/** The foot of a Ration's card: retired, already the chosen Pen's, or the way to put the chosen Pen on it. */
const RationFoot = ({
  ration,
  chosenPenId,
  onChosenPen,
  retired,
}: {
  ration: RationRow;
  chosenPenId: string;
  onChosenPen: boolean;
  retired: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const assign = useMutation(
    orpc.feed.assignRation.mutationOptions({
      onError: refused,
    })
  );
  if (retired) {
    return (
      <StatusBadge icon={Archive} tone="neutral">
        {t("feed.retired")}
      </StatusBadge>
    );
  }
  if (onChosenPen) {
    return (
      <StatusBadge icon={Check} tone="success">
        {t("feed.assigned")}
      </StatusBadge>
    );
  }
  return (
    <Button
      disabled={assign.isPending || chosenPenId === ""}
      onClick={() => assign.mutate({ penId: chosenPenId, rationId: ration.id })}
      size="sm"
      type="button"
      variant="outline"
    >
      {t("feed.assign")}
    </Button>
  );
};

const RationCard = ({
  ration,
  items,
  chosenPenId,
  mayEdit,
  onEdit,
}: {
  ration: RationRow;
  items: FeedItemRow[];
  chosenPenId: string;
  mayEdit: boolean;
  onEdit: () => void;
}) => {
  const { t, language } = useLanguage();
  const acts = useRationActs(ration, onEdit);
  // A list cached before retiring existed has no such field: a Ration on it is simply in use.
  const retired = Boolean(ration.retiredAt);
  const band = bandSaid(bandOfRow(ration), { t, language });
  const names = new Map(items.map((item) => [item.id, item]));
  const onChosenPen = ration.penIds.includes(chosenPenId);
  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-3 rounded-xl border p-4",
        retired && "opacity-75"
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-semibold">{ration.name.bn}</h3>
          <span className="text-muted-foreground text-xs">
            {ration.number ? t("feed.version", { number: ration.number }) : ""}
            {" · "}
            {t("feed.pensOn", {
              count: formatNumber(ration.penIds.length, language),
            })}
            {band ? ` · ${band}` : ""}
          </span>
        </div>
        {mayEdit ? (
          <RowMenu
            actions={acts}
            label={t("feed.rationActions", { name: ration.name.bn })}
          />
        ) : null}
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
                {isByWeight(line)
                  ? t("feed.perHundred", {
                      amount: formatNumber(line.kgPer100KgPerDay, language),
                      unit: feedUnitWord(item?.unit ?? "kg", language),
                    })
                  : `${formatNumber(line.kgPerAnimalPerDay, language)} ${feedUnitWord(item?.unit ?? "kg", language)}`}
              </span>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto border-t pt-3">
        <RationFoot
          chosenPenId={chosenPenId}
          onChosenPen={onChosenPen}
          ration={ration}
          retired={retired}
        />
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
  const { t, language } = useLanguage();
  const [penId, setPenId] = useState("");
  const [editing, setEditing] = useState<RationRow | "new" | null>(null);
  const chosen = penId || pens[0]?.id || "";
  const inUse = rations.filter((one) => !one.retiredAt);
  const retired = rations.filter((one) => one.retiredAt);
  const card = (ration: RationRow) => (
    <RationCard
      chosenPenId={chosen}
      items={items}
      key={ration.id}
      mayEdit={mayEdit}
      onEdit={() => setEditing(ration)}
      ration={ration}
    />
  );
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
        {inUse.length === 0 ? (
          <EmptyState icon={Utensils} title={t("feed.noRation")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {inUse.map(card)}
          </div>
        )}
        {/* Retired, folded away at the foot: kept so past feedings still read by name, and never offered to a Pen. */}
        {retired.length === 0 ? null : (
          <details className="group mt-2">
            <summary className="text-muted-foreground cursor-pointer text-sm font-medium">
              {t("feed.retiredRations", {
                count: formatNumber(retired.length, language),
              })}
            </summary>
            <p className="text-muted-foreground mt-2 text-xs">
              {t("feed.retiredRationsHint")}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {retired.map(card)}
            </div>
          </details>
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
