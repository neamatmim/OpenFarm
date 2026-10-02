import { formatDate } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FormField } from "@/components/page-kit";
import { PhotoField } from "@/components/photo-field";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { orpc } from "@/utils/orpc";

/**
 * A photograph of the dead animal showing her tag, taken on the phone and shrunk before it goes: a death or a cull is not
 * written without one. A newborn wearing no tag yet is photographed beside her dam's.
 */
export const DeathPhotoField = ({
  id,
  onChange,
}: {
  id: string;
  onChange: (photo: Photo | null) => void;
}) => {
  const { t } = useLanguage();
  const [chosen, setChosen] = useState(false);
  return (
    <FormField
      hint={t("mortality.photoHint")}
      id={id}
      label={t("mortality.photo")}
    >
      <PhotoField
        chosen={chosen}
        id={id}
        onPhoto={(photo) => {
          setChosen(photo !== null);
          onChange(photo);
        }}
        takeLabel="mortality.photoTake"
      />
    </FormField>
  );
};

/**
 * The photographs kept with her death, the newest last and an older one marked replaced — or, for a death written before
 * photographs were asked for, that there is none.
 */
export const DeathPhotos = ({ tagNumber }: { tagNumber: string }) => {
  const { t, language } = useLanguage();
  const photos = useQuery(
    orpc.animals.deathPhotos.queryOptions({ input: { tagNumber } })
  );
  if (!photos.data) {
    return null;
  }
  if (photos.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("mortality.noPhoto")}</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {photos.data.map((one) => (
        <figure className="flex w-40 flex-col gap-1" key={one.id}>
          <img
            alt={t("mortality.photoAlt", { tag: tagNumber })}
            className="aspect-square w-40 rounded-md border object-cover"
            src={`data:${one.contentType};base64,${one.data}`}
          />
          <figcaption className="text-muted-foreground text-xs">
            {formatDate(new Date(one.takenAt), language, "date")}
            {one.replacedAt ? ` · ${t("mortality.photoReplaced")}` : ""}
          </figcaption>
        </figure>
      ))}
    </div>
  );
};
