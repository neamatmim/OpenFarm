import { isExitState, PHOTO_FILE_MAX_BYTES } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Camera,
  Handshake,
  MapPin,
  MapPinOff,
  Pill,
  RefreshCw,
  Skull,
  Tag,
} from "lucide-react";

import { AnimalPhoto } from "@/components/animal-photo";
import { PageHeader } from "@/components/page";
import { HeaderMenu } from "@/components/page-kit";
import type { RowAction } from "@/components/page-kit";
import { ReportSighting } from "@/components/report-sighting";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { photoProblem, shrinkAnimalPhoto } from "@/lib/photo";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { AnimalAct, AnimalDetail, AnimalPowers } from "./animal-types";
import {
  HeldBadges,
  SideWord,
  StateBadge,
  ageWords,
  herAge,
} from "./animal-words";

/** The camera's file picker, opened from her menu. */
const PHOTO_INPUT = "animal-photo-input";

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
      act: "notFound",
      label: t("animals.markNotFound"),
      icon: MapPinOff,
      // Once a Pen has not counted right and the Manager has walked it: the round's "Animal not found" by hand.
      offered:
        powers.runsTheFarm && powers.stillHere && detail.missing === null,
    },
    {
      act: "dose",
      label: t("dose.give"),
      icon: Pill,
      // Written after it was given, by whoever runs the farm; the Vet prescribes instead.
      offered: powers.runsTheFarm && powers.stillHere,
    },
    {
      act: "mortality",
      label: t("mortality.record"),
      icon: Skull,
      offered:
        powers.runsTheFarm && powers.stillHere && detail.mortality === null,
      destructive: true,
    },
  ];
  return acts.filter((one) => one.offered);
};

/** What she is, in a line under her number: her Side, her Pen, her breed, her age. */
const WhatSheIs = ({ detail }: { detail: AnimalDetail }) => {
  const { t, language } = useLanguage();
  const breed = breedName(detail.breed, language);
  const age = ageWords(t, herAge(detail));
  const hasAliases = detail.aliases.length !== 0;
  return (
    <>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <SideWord side={detail.side} />
        <span className="inline-flex items-center gap-1">
          <MapPin aria-hidden className="size-4" />
          {/* Gone, she stands nowhere: the Pen she was last in, said as that. */}
          {isExitState(detail.state)
            ? t("animals.lastInPen", {
                pen: `${detail.pen.shed.name} / ${detail.pen.name}`,
              })
            : `${detail.pen.shed.name} / ${detail.pen.name}`}
        </span>
        {breed ? <span>{breed}</span> : null}
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
                className="text-foreground font-medium underline-offset-4 hover:underline"
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

  const hasActs = powers.mayReport || powers.mayMove || actions.length > 0;

  return (
    <PageHeader
      actions={
        hasActs ? (
          // Two to a row on a phone, the sighting across both, so every act is a thumb's width in the barn.
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
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
            <HeaderMenu
              actions={actions}
              label={t("animals.moreFor", { tag: detail.tagNumber })}
            />
          </div>
        ) : null
      }
      leading={
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
                if (file.size > PHOTO_FILE_MAX_BYTES) {
                  toast.error(t("photo.tooLarge"));
                  return;
                }
                // Shrunk on the phone, with a thumbnail for the herd's lists: the camera's file would go up whole.
                try {
                  setPhoto.mutate({
                    tagNumber: detail.tagNumber,
                    ...(await shrinkAnimalPhoto(file)),
                  });
                } catch (error) {
                  toast.error(t(photoProblem(error)));
                }
              }}
              tabIndex={-1}
              type="file"
            />
          ) : null}
        </div>
      }
      meta={
        <>
          <StateBadge state={detail.state} />
          <HeldBadges
            meatHeld={detail.underMeatWithdrawal}
            milkHeld={detail.underMilkWithdrawal}
          />
          {/* What she is starts a line of its own under her badges, as it stood under her number. */}
          <div className="flex basis-full flex-col gap-1">
            <WhatSheIs detail={detail} />
          </div>
        </>
      }
      // Her number as it is on her ear: in the monospace every Tag Number is set in.
      title={<span className="font-mono tabular-nums">{detail.tagNumber}</span>}
    />
  );
};
