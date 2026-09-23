import type { MessageKey } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";

import { TagChip } from "@/components/page";
import { useRefused } from "@/lib/refused";
import type { orpc } from "@/utils/orpc";

/** Something a round saw that nobody has answered. */
export type Seen = Awaited<
  ReturnType<typeof orpc.diagnoses.waiting.call>
>[number];

/** One of the Vet's own conclusions, with the courses that followed it. */
export type Made = Awaited<ReturnType<typeof orpc.diagnoses.mine.call>>[number];

/** The refusals a health screen has something of its own to say about. */
const REFUSALS: Record<string, MessageKey> = {
  no_treatment_sop: "prescribe.noTreatmentSop",
};

/** The refusal in the reader's own language: this screen's own words for what only it meets, then the farm's. */
export const useRefusal = () => useRefused(REFUSALS);

/** An animal's Tag Number, as the way to her page. */
export const AnimalLink = ({ tagNumber }: { tagNumber: string }) => (
  <Link
    className="rounded-md outline-none hover:underline focus-visible:ring-2"
    params={{ tagNumber }}
    to="/animals/$tagNumber"
  >
    <TagChip>{tagNumber}</TagChip>
  </Link>
);
