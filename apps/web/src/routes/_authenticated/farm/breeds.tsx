import {
  BREED_GAIN_PERCENT,
  isBreedGainPercent,
  shareToUse,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Dna,
  Home,
  Pencil,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

import { useBreeds } from "@/components/breed-field";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  Nothing,
  RetiredBadge,
  nameTone,
  retiredLast,
} from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { gainSettingOf } from "@/lib/gain-settings";
import { onlyFor } from "@/lib/guard";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Breed = Awaited<ReturnType<typeof orpc.breeds.list.call>>[number];

/** A breed in the list, with its name in the reader's language, the share of a Ration's Expected Gain an animal of it is
 *  judged at and what the farm's own bulls of it put on, and what may be done to it. */
interface BreedRow extends Breed {
  name: string;
  /** The share an animal of it is judged at, said: its own, the deshi share, or the Ration as written. */
  judgedAt: string;
  /** What the farm's own bulls of it put on, said; nothing while fewer than five have been measured. */
  figureSaid: string | null;
  /** The farm's own figure to take with one press, inside the bounds — nothing when there is none, or it is already
   *  the share used. */
  usePercent: number | null;
  handleUse: () => void;
  handleGain: () => void;
  handleRename: () => void;
  handleDeshi: () => void;
  handleRetire: () => void;
  handleRestore: () => void;
}

/** Whether a breed is deshi, whether it came with the farm, and whether it is retired. A list cached before breeds were
 *  deshi or not says nothing of it. */
const Badges = ({ row }: { row: BreedRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      {row.deshi ? (
        <StatusBadge icon={Home} tone="info">
          {t("breeds.deshi")}
        </StatusBadge>
      ) : null}
      {row.key ? (
        <StatusBadge icon={BadgeCheck} tone="neutral">
          {t("breeds.standard")}
        </StatusBadge>
      ) : null}
      {row.retiredAt ? <RetiredBadge word="breeds.retired" /> : null}
    </div>
  );
};

/** The menu at the end of a breed's row: rename it, say whether it is deshi, and retire it or bring it back. */
const BreedMenu = ({ row }: { row: BreedRow }) => {
  const { t } = useLanguage();
  return (
    <RowMenu
      actions={[
        {
          label: t("herd.rename"),
          icon: Pencil,
          handleSelect: row.handleRename,
        },
        {
          label: t(row.deshi ? "breeds.markCross" : "breeds.markDeshi"),
          icon: Home,
          handleSelect: row.handleDeshi,
        },
        {
          label: t("breeds.gain.set"),
          icon: TrendingUp,
          handleSelect: row.handleGain,
        },
        row.retiredAt
          ? {
              label: t("breeds.restore"),
              icon: ArchiveRestore,
              handleSelect: row.handleRestore,
            }
          : {
              label: t("breeds.retire"),
              icon: Archive,
              handleSelect: row.handleRetire,
              destructive: true,
            },
      ]}
      label={row.name}
    />
  );
};

const NameCell = ({ row }: { row: { original: BreedRow } }) => (
  <span className={nameTone(row.original)}>{row.original.nameBn}</span>
);

const EnglishCell = ({ row }: { row: { original: BreedRow } }) =>
  row.original.nameEn ? <span>{row.original.nameEn}</span> : <Nothing />;

const AnimalsCell = ({ row }: { row: { original: BreedRow } }) => {
  const { language } = useLanguage();
  return <span>{formatNumber(row.original.animals, language)}</span>;
};

/** The share an animal of it is judged at, and under it what the farm's own bulls of it put on, with the farm's figure
 *  to take in one press. */
const GainCell = ({ row }: { row: { original: BreedRow } }) => {
  const { t, language } = useLanguage();
  const { judgedAt, figureSaid, usePercent, handleUse } = row.original;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{judgedAt}</span>
      {figureSaid ? (
        <span className="text-muted-foreground text-xs">{figureSaid}</span>
      ) : null}
      {usePercent === null ? null : (
        <Button onClick={handleUse} size="xs" type="button" variant="ghost">
          <Sparkles aria-hidden data-icon="inline-start" />
          {t("breeds.gain.use", {
            percent: formatNumber(usePercent, language),
          })}
        </Button>
      )}
    </span>
  );
};

const StatusCell = ({ row }: { row: { original: BreedRow } }) => (
  <Badges row={row.original} />
);

const MenuCell = ({ row }: { row: { original: BreedRow } }) => (
  <div className="flex justify-end">
    <BreedMenu row={row.original} />
  </div>
);

const column = createListColumns<BreedRow>();
const breedColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("breeds.nameBn"),
    cell: NameCell,
  }),
  column.accessor((row) => row.nameEn ?? undefined, {
    id: "nameEn",
    header: listHeader("breeds.nameEn"),
    cell: EnglishCell,
  }),
  column.accessor("animals", {
    header: listHeader("herd.col.animals"),
    cell: AnimalsCell,
    meta: { align: "end" },
  }),
  column.accessor("judgedAt", {
    id: "gain",
    header: listHeader("breeds.col.gain"),
    cell: GainCell,
  }),
  column.accessor(retiredLast, {
    id: "status",
    header: listHeader("money.col.status"),
    cell: StatusCell,
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end" },
  }),
]);

/** A breed on a phone: its names and how many animals, its badges, and its menu at the right. */
const BreedCard = ({ row }: { row: BreedRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <NameCell row={{ original: row }} />
        <span className="text-muted-foreground text-sm">
          {[
            row.nameEn,
            t("herd.animalCount", {
              count: formatNumber(row.animals, language),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Badges row={row} />
        <GainCell row={{ original: row }} />
      </div>
      <BreedMenu row={row} />
    </div>
  );
};

const breedCard = (row: BreedRow) => <BreedCard row={row} />;

/** What the dialog is for: a new breed, or new names for one the farm has. */
type Naming = { kind: "add" } | { kind: "rename"; breed: Breed; name: string };

/** A breed's two names, for a new breed or to put one right. */
const BreedDialog = ({
  naming,
  onClose,
}: {
  naming: Naming | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const current = naming?.kind === "rename" ? naming.breed : null;
  const [nameBn, setNameBn] = useState(current?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(current?.nameEn ?? "");
  const [deshi, setDeshi] = useState(false);
  const add = useMutation(
    orpc.breeds.create.mutationOptions({ onSuccess: onClose, onError })
  );
  const rename = useMutation(
    orpc.breeds.rename.mutationOptions({ onSuccess: onClose, onError })
  );
  const english = nameEn.trim() || undefined;
  return (
    <FormDialog
      description={t(current ? "breeds.renameHint" : "breeds.newHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() =>
        current
          ? rename.mutate({
              id: current.id,
              nameBn: nameBn.trim(),
              nameEn: english ?? null,
            })
          : add.mutate({ nameBn: nameBn.trim(), nameEn: english, deshi })
      }
      open={naming !== null}
      pending={add.isPending || rename.isPending}
      ready={nameBn.trim() !== ""}
      submitLabel={t(current ? "common.save" : "breeds.add")}
      title={
        naming?.kind === "rename"
          ? t("breeds.renameTitle", { name: naming.name })
          : t("breeds.new")
      }
    >
      <FormField id="breed-name-bn" label={t("breeds.nameBn")}>
        <Input
          autoComplete="off"
          id="breed-name-bn"
          maxLength={60}
          onChange={(event) => setNameBn(event.target.value)}
          required
          value={nameBn}
        />
      </FormField>
      <FormField
        hint={t("breeds.nameEnHint")}
        id="breed-name-en"
        label={t("breeds.nameEn")}
      >
        <Input
          autoComplete="off"
          id="breed-name-en"
          maxLength={60}
          onChange={(event) => setNameEn(event.target.value)}
          value={nameEn}
        />
      </FormField>
      {/* A new breed only: an existing one is marked deshi or not from its row's menu. */}
      {current ? null : (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={deshi} onCheckedChange={setDeshi} />
            {t("breeds.deshiChoice")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("breeds.deshiHint")}
          </p>
        </div>
      )}
    </FormDialog>
  );
};

/** What a breed's share is to be set to: which breed, and what its row says of it. */
interface GainSetting {
  breed: Breed;
  name: string;
  figureSaid: string | null;
}

/**
 * A breed's own share of a Ration's Expected Gain, typed — from three tenths to a fifth over the Ration — or cleared, and
 * an animal of it is judged as before. Beside it what the farm's own bulls of it put on, where five have been measured.
 */
const GainDialog = ({
  setting,
  onClose,
}: {
  setting: GainSetting | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  // A list this phone kept from before breeds had their own share has none: an empty box.
  const own = setting?.breed.gainPercent ?? null;
  const [typed, setTyped] = useState(own === null ? "" : String(own));
  const save = useMutation(
    orpc.breeds.setGainPercent.mutationOptions({
      onSuccess: (done) => {
        toast.success(
          done.percent === null
            ? t("breeds.gain.cleared")
            : t("breeds.gain.used", {
                percent: formatNumber(done.percent, language),
              })
        );
        onClose();
      },
      onError,
    })
  );
  const percent = Number(typed);
  const inBounds = typed.trim() !== "" && isBreedGainPercent(percent);
  const hasOwn = own !== null;
  return (
    <FormDialog
      description={t("breeds.gain.hint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (setting && inBounds) {
          save.mutate({ id: setting.breed.id, percent });
        }
      }}
      open={setting !== null}
      pending={save.isPending}
      ready={inBounds}
      submitLabel={t("common.save")}
      title={t("breeds.gain.title", { name: setting?.name ?? "" })}
    >
      <FormField
        hint={
          setting?.figureSaid
            ? t("breeds.gain.farmHint", { figure: setting.figureSaid })
            : t("breeds.gain.noFigure")
        }
        id="breed-gain-percent"
        label={t("breeds.gain.label")}
      >
        <Input
          className="max-w-32"
          id="breed-gain-percent"
          inputMode="numeric"
          max={BREED_GAIN_PERCENT.most}
          min={BREED_GAIN_PERCENT.least}
          onChange={(event) => setTyped(event.target.value)}
          type="number"
          value={typed}
        />
      </FormField>
      {hasOwn ? (
        <Button
          className="self-start"
          disabled={save.isPending}
          onClick={() => {
            if (setting) {
              save.mutate({ id: setting.breed.id, percent: null });
            }
          }}
          type="button"
          variant="outline"
        >
          {t("breeds.gain.clear")}
        </Button>
      ) : null}
    </FormDialog>
  );
};

/**
 * The farm's list of breeds: the standard ones it came with and its own, how many animals are of each, and the
 * retired. Kept by the Owner and the Manager; an animal is written down under one on the intake and register forms.
 */
const BreedsPage = () => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const breeds = useBreeds();
  const [naming, setNaming] = useState<Naming | null>(null);
  const [retiring, setRetiring] = useState<{ id: string; name: string } | null>(
    null
  );
  const retire = useMutation(
    orpc.breeds.retire.mutationOptions({
      onSuccess: () => setRetiring(null),
      onError,
    })
  );
  const restore = useMutation(orpc.breeds.restore.mutationOptions({ onError }));
  const setDeshi = useMutation(
    orpc.breeds.setDeshi.mutationOptions({ onError })
  );
  const [gainOf, setGainOf] = useState<GainSetting | null>(null);
  // "Use it": the farm's own figure written through the same act, the same check and the same trail as typing it.
  const takeFigure = useMutation(
    orpc.breeds.setGainPercent.mutationOptions({
      onSuccess: (done) =>
        toast.success(
          t("breeds.gain.used", {
            percent: formatNumber(done.percent ?? 0, language),
          })
        ),
      onError,
    })
  );
  // What the farm's own bulls of each breed put on: its own read, since it weighs up every fattening animal.
  const shares = useQuery(orpc.breeds.farmShares.queryOptions());
  const farm = useQuery(orpc.farm.current.queryOptions());
  const deshiPercent = gainSettingOf(farm.data, "deshiGainPercent");
  /** The share an animal of a breed is judged at, said. A list cached before breeds had their own says none. */
  const judgedAtOf = (one: Breed): string => {
    const own = one.gainPercent ?? null;
    if (own !== null) {
      return t("breeds.gain.own", { percent: formatNumber(own, language) });
    }
    return one.deshi
      ? t("breeds.gain.deshi", {
          percent: formatNumber(deshiPercent, language),
        })
      : t("breeds.gain.asWritten");
  };
  const figureSaidOf = (one: Breed): string | null => {
    const figure = shares.data?.[one.id] ?? null;
    return figure
      ? t("breeds.gain.farm", {
          animals: figure.animals,
          median: formatNumber(figure.medianPercent, language),
          low: formatNumber(figure.lowPercent, language),
          high: formatNumber(figure.highPercent, language),
        })
      : null;
  };
  const table = useListTable({
    columns: breedColumns,
    data: (breeds.data ?? []).map((one) => {
      const name = breedName(one, language) ?? one.nameBn;
      const figure = shares.data?.[one.id] ?? null;
      const taken = figure ? shareToUse(figure) : null;
      const figureSaid = figureSaidOf(one);
      return {
        ...one,
        name,
        judgedAt: judgedAtOf(one),
        figureSaid,
        usePercent:
          taken === null || taken === (one.gainPercent ?? null) ? null : taken,
        handleUse: () => {
          if (taken !== null) {
            takeFigure.mutate({ id: one.id, percent: taken });
          }
        },
        handleGain: () => setGainOf({ breed: one, name, figureSaid }),
        handleRename: () => setNaming({ kind: "rename", breed: one, name }),
        handleDeshi: () => setDeshi.mutate({ id: one.id, deshi: !one.deshi }),
        handleRetire: () => setRetiring({ id: one.id, name }),
        handleRestore: () => restore.mutate({ id: one.id }),
      };
    }),
    getRowId: (row) => row.id,
  });

  return (
    <Page>
      <PageHeader
        eyebrow={t("nav.identity")}
        actions={
          <Button onClick={() => setNaming({ kind: "add" })} type="button">
            <Plus aria-hidden data-icon="inline-start" />
            {t("breeds.add")}
          </Button>
        }
        description={t("breeds.subtitle")}
        title={t("nav.breeds")}
      />

      <Section>
        <Loaded
          query={breeds}
          skeleton={<Skeleton className="h-40 rounded-lg" />}
        >
          {breeds.data?.length === 0 ? (
            <EmptyState bare icon={Dna} title={t("breeds.none")} />
          ) : null}
          {breeds.data?.length ? (
            <DataTable card={breedCard} minWidth="40rem" table={table} />
          ) : null}
        </Loaded>
      </Section>

      {/* Keyed by what is being named, so the boxes start from that breed's names and never another's. */}
      <BreedDialog
        key={naming?.kind === "rename" ? naming.breed.id : "add"}
        naming={naming}
        onClose={() => setNaming(null)}
      />
      {/* Keyed by the breed, so the box starts from its own share and never another's. */}
      <GainDialog
        key={gainOf?.breed.id ?? "none"}
        onClose={() => setGainOf(null)}
        setting={gainOf}
      />
      <ConfirmDialog
        confirmLabel={t("breeds.retire")}
        description={t("breeds.retireWhy")}
        onConfirm={() => {
          if (retiring) {
            retire.mutate({ id: retiring.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setRetiring(null);
          }
        }}
        open={retiring !== null}
        pending={retire.isPending}
        title={t("breeds.retireTitle", { name: retiring?.name ?? "" })}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/breeds")({
  /** For those who run the farm: the Owner and the Farm Managers. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: BreedsPage,
});
