import { Button } from "@OpenFarm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Camera,
  EllipsisVertical,
  Handshake,
  MapPin,
  RefreshCw,
  Skull,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { AnimalPhoto } from "@/components/animal-photo";
import type { RowAction } from "@/components/page-kit";
import { ReportSighting } from "@/components/report-sighting";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { AnimalAct, AnimalDetail, AnimalPowers } from "./animal-types";
import {
  HeldBadges,
  SideWord,
  StateBadge,
  ageWords,
  herAge,
} from "./animal-words";

const PHOTO_MAX_BYTES = 1_500_000;
/** The camera's file picker, opened from her menu. */
const PHOTO_INPUT = "animal-photo-input";

const readAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    ""
  );
  return btoa(binary);
};

/** One act in the header's menu, with its icon; an act that ends her record in the danger colour. */
const ActItem = ({ action }: { action: RowAction }) => {
  const Icon = action.icon;
  const { handleSelect } = action;
  return (
    <DropdownMenuItem
      className={cn("min-h-11 md:min-h-8", action.destructive && "text-danger")}
      disabled={action.disabled}
      onClick={handleSelect}
    >
      {Icon ? <Icon aria-hidden /> : null}
      {action.label}
    </DropdownMenuItem>
  );
};

/** Everything else that may be done to her, behind a "more" button the size of the buttons beside it — the header's
 *  own RowMenu, drawn for a thumb rather than for the end of a row. */
const MoreActs = ({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) => {
  const { t } = useLanguage();
  if (actions.length === 0) {
    return null;
  }
  // One act is a button with its own name, not "more" opening onto a list of one.
  const [only] = actions;
  if (actions.length === 1 && only) {
    const Icon = only.icon;
    return (
      <Button
        className={only.destructive ? "text-danger" : undefined}
        onClick={only.handleSelect}
        type="button"
        variant="outline"
      >
        {Icon ? <Icon aria-hidden data-icon="inline-start" /> : null}
        {only.label}
      </Button>
    );
  }
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={label} type="button" variant="outline">
            <EllipsisVertical aria-hidden data-icon="inline-start" />
            {t("animals.more")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        {safe.map((action) => (
          <ActItem action={action} key={action.label} />
        ))}
        {safe.length > 0 && destructive.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {destructive.map((action) => (
          <ActItem action={action} key={action.label} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface MenuAct {
  act: AnimalAct;
  label: string;
  icon: LucideIcon;
  offered: boolean;
  destructive?: boolean;
}

/**
 * The acts in her menu this person may do, in the order the barn reaches for them.
 *
 * Only what has no button of its own elsewhere on her page: cutting a withdrawal short is a button on the
 * withdrawal it shortens, a disposal on the death it follows, an abortion on her breeding — each where the thing it
 * changes is shown, and offered once.
 */
const useMenuActs = (detail: AnimalDetail, powers: AnimalPowers) => {
  const { t } = useLanguage();
  const acts: MenuAct[] = [
    {
      act: "state",
      label: t("animals.setState"),
      icon: RefreshCw,
      offered: powers.mayChangeState && (powers.mayHandle || powers.isVet),
    },
    {
      act: "retag",
      label: t("animals.retag"),
      icon: Tag,
      offered: powers.mayHandle,
    },
    {
      act: "purse",
      label: t("ventures.sellInternally"),
      icon: Handshake,
      offered: powers.mayMovePurse,
    },
    {
      act: "mortality",
      label: t("mortality.record"),
      icon: Skull,
      offered: powers.runsTheFarm && detail.mortality === null,
      destructive: true,
    },
  ];
  return acts.filter((one) => one.offered);
};

/** What she is, in a line under her number: her Side, her Pen, her breed, her age. */
const WhatSheIs = ({ detail }: { detail: AnimalDetail }) => {
  const { t } = useLanguage();
  const age = ageWords(t, herAge(detail));
  const hasAliases = detail.aliases.length !== 0;
  return (
    <>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <SideWord side={detail.side} />
        <span className="inline-flex items-center gap-1">
          <MapPin aria-hidden className="size-4" />
          {detail.pen.shed.name} / {detail.pen.name}
        </span>
        {detail.breed ? <span>{detail.breed}</span> : null}
        {age ? <span>{age}</span> : null}
        {/* Whose animal she is, where she is not the Farm's own. The server says nothing of it to
            anybody it is not the business of, so what arrives here is already the right answer. */}
        {detail.owner ? (
          <span className="inline-flex items-center gap-1">
            <Handshake aria-hidden className="size-4" />
            {detail.owner.name}
          </span>
        ) : null}
      </p>
      {hasAliases || detail.officialTag || detail.dam ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {detail.officialTag ? (
            <span>
              {t("animals.officialTag")}: {detail.officialTag}
            </span>
          ) : null}
          {hasAliases ? (
            <span>
              {t("animals.aliases")}: {detail.aliases.join(", ")}
            </span>
          ) : null}
          {detail.dam ? (
            <span>
              {t("calving.dam")}:{" "}
              <Link
                className="text-foreground underline underline-offset-4"
                params={{ tagNumber: detail.dam.tagNumber }}
                to="/animals/$tagNumber"
              >
                {detail.dam.tagNumber}
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}
    </>
  );
};

/**
 * Her page's head: her photo, her number, her State and whatever holds her, what she is and where she stands — and
 * the acts people come to her for. Saying what was seen of her and moving her are buttons of their own, a thumb away
 * on a phone in the barn; everything else this person may do waits in "more".
 */
export const AnimalProfile = ({
  detail,
  powers,
  onAct,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
  onAct: (act: AnimalAct) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const menuActs = useMenuActs(detail, powers);
  const setPhoto = useMutation(
    orpc.animals.setPhoto.mutationOptions({
      onSuccess: () => {
        toast.success(t("animals.photoSaved"));
      },
      onError: refused,
    })
  );

  const handleTakePhoto = () => {
    document.querySelector<HTMLInputElement>(`#${PHOTO_INPUT}`)?.click();
  };
  const actions: RowAction[] = [
    ...(powers.mayHandle
      ? [
          {
            label: t("animals.photoTake"),
            icon: Camera,
            handleSelect: handleTakePhoto,
            disabled: setPhoto.isPending,
          },
        ]
      : []),
    ...menuActs.map((one) => ({
      label: one.label,
      icon: one.icon,
      destructive: one.destructive,
      handleSelect: () => onAct(one.act),
    })),
  ];

  return (
    <header className="surface flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-6">
      <div className="flex min-w-0 items-start gap-4">
        <div className="relative shrink-0">
          <AnimalPhoto
            photoUpdatedAt={detail.photoUpdatedAt}
            size={88}
            tagNumber={detail.tagNumber}
          />
          {setPhoto.isPending ? (
            <span className="bg-background/70 absolute inset-0 grid place-items-center rounded-xl">
              <Spinner />
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-mono text-3xl leading-none font-bold tabular-nums md:text-4xl">
              {detail.tagNumber}
            </h1>
            <StateBadge state={detail.state} />
            <HeldBadges
              meatHeld={detail.underMeatWithdrawal}
              milkHeld={detail.underMilkWithdrawal}
            />
          </div>
          <WhatSheIs detail={detail} />
        </div>
      </div>

      {powers.mayReport || powers.mayMove || actions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end md:shrink-0">
          {powers.mayReport ? (
            <ReportSighting
              className="col-span-2 w-full sm:w-fit"
              tagNumber={detail.tagNumber}
            />
          ) : null}
          {powers.mayMove ? (
            <Button
              onClick={() => onAct("move")}
              type="button"
              variant="outline"
            >
              <ArrowRightLeft aria-hidden data-icon="inline-start" />
              {t("animals.move")}
            </Button>
          ) : null}
          <MoreActs
            actions={actions}
            label={t("animals.moreFor", { tag: detail.tagNumber })}
          />
        </div>
      ) : null}

      {powers.mayHandle ? (
        // The phone's own file picker speaks the phone's language, not the farm's: the words are in the menu, and
        // the picker behind them only opens the camera.
        <input
          accept="image/*"
          aria-label={t("animals.photoTake")}
          capture="environment"
          className="sr-only"
          id={PHOTO_INPUT}
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
          tabIndex={-1}
          type="file"
        />
      ) : null}
    </header>
  );
};
