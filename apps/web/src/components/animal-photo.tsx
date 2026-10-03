import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** The largest size she is drawn at from her thumbnail, which is made 192px on its longest side: 96px at 2x. */
const THUMB_SIZE = 96;

/** The Animal's photo where an animal is picked. Falls back to the Tag Number's digits,
 *  so a pen still reads at a glance before photos are taken. */
export const AnimalPhoto = ({
  tagNumber,
  photoUpdatedAt,
  size = 56,
}: {
  tagNumber: string;
  photoUpdatedAt: Date | null;
  size?: number;
}) => {
  // A photo only changes when someone replaces it, and every such mutation invalidates the
  // whole `animals` key — which overrides staleTime — so it is never fetched twice otherwise.
  const photo = useQuery({
    // Drawn the size of a thumb, she is sent as her thumbnail (whole, for a photo taken before there were any).
    ...orpc.animals.photo.queryOptions({
      input: { tagNumber, size: size <= THUMB_SIZE ? "thumb" : "full" },
    }),
    enabled: photoUpdatedAt !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const src = photo.data
    ? `data:${photo.data.contentType};base64,${photo.data.data}`
    : null;

  if (src) {
    return (
      <img
        src={src}
        alt={tagNumber}
        width={size}
        height={size}
        className="ring-border shrink-0 rounded-xl object-cover ring-1"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="bg-secondary text-secondary-foreground ring-border flex shrink-0 items-center justify-center rounded-xl font-semibold tabular-nums ring-1"
      style={{ width: size, height: size, fontSize: size / 4 }}
    >
      {tagNumber.slice(2)}
    </div>
  );
};
