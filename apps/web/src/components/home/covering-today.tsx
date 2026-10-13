import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundCheck } from "lucide-react";
import { useState } from "react";

import { RecordList, Section } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import { nameIn, whoMayBeAway, whoMayCover } from "@/lib/covering";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The farm's refusals of a Cover, in the reader's words. */
const COVER_WORDS = {
  cover_is_themselves: "cover.themselves",
  cover_not_barn_staff: "cover.notBarnStaff",
  cover_no_pens: "cover.noPens",
  cover_not_standing: "cover.notStanding",
} as const;

/**
 * Covering today: when a milker is away, the Manager hands their Pens to somebody else for the day, here where he
 * starts the morning. The cover sees and does that work until the farm day turns, or until it is ended early; the one
 * away keeps their own Pens all along.
 */
export const CoveringToday = () => {
  const t = useT();
  const refused = useRefused(COVER_WORDS);
  const queryClient = useQueryClient();
  const people = useQuery(orpc.people.list.queryOptions());
  const today = useQuery(orpc.covers.today.queryOptions());
  const [away, setAway] = useState("");
  const [cover, setCover] = useState("");
  const settled = () =>
    queryClient.invalidateQueries({ queryKey: orpc.covers.key() });
  const set = useMutation(
    orpc.covers.set.mutationOptions({
      onError: refused,
      onSuccess: async () => {
        toast.success(t("cover.set"));
        setAway("");
        setCover("");
        await settled();
      },
    })
  );
  const end = useMutation(
    orpc.covers.end.mutationOptions({
      onError: refused,
      onSuccess: async () => {
        toast.success(t("cover.ended"));
        await settled();
      },
    })
  );

  const everybody = people.data?.people ?? [];
  const awayChoices = whoMayBeAway(everybody);
  // Nobody with Pens to be away from: a farm with one milker, or one still being set up, has no Cover to give.
  if (awayChoices.length === 0) {
    return null;
  }
  const coverChoices = away ? whoMayCover(everybody, away) : [];
  const standing = (today.data?.covers ?? []).filter(
    (one) => one.endedAt === null
  );
  const readyToSet = away !== "" && cover !== "" && !set.isPending;

  return (
    <Section description={t("cover.hint")} title={t("cover.title")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <NativeSelect
          aria-label={t("cover.away")}
          className="sm:w-56"
          onChange={(event) => {
            setAway(event.target.value);
            setCover("");
          }}
          value={away}
        >
          <option value="">{t("cover.chooseAway")}</option>
          {awayChoices.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("cover.by")}
          className="sm:w-56"
          disabled={away === ""}
          onChange={(event) => setCover(event.target.value)}
          value={cover}
        >
          <option value="">{t("cover.chooseCover")}</option>
          {coverChoices.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
        <Button
          disabled={!readyToSet}
          onClick={() => set.mutate({ absentUserId: away, coverUserId: cover })}
          type="button"
        >
          <UserRoundCheck aria-hidden data-icon="inline-start" />
          {t("cover.setIt")}
        </Button>
      </div>
      {standing.length > 0 ? (
        <RecordList className="mt-4">
          {standing.map((one) => (
            <div
              className="flex items-center justify-between gap-3 py-2"
              key={one.id}
            >
              <span className="text-sm">
                {t("cover.line", {
                  cover: nameIn(everybody, one.coverUserId),
                  away: nameIn(everybody, one.absentUserId),
                })}
              </span>
              <Button
                disabled={end.isPending}
                onClick={() => end.mutate({ id: one.id })}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("cover.end")}
              </Button>
            </div>
          ))}
        </RecordList>
      ) : null}
    </Section>
  );
};
