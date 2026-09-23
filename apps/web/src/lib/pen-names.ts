import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * Every Pen's name as a person reads it, "shed / pen", by the Pen's id — for a list of animals, which carry the id.
 * None for a visiting Vet, who reaches their Cases and not the sheds, and none until `enabled`.
 */
export const usePenNames = (enabled = true): ReadonlyMap<string, string> => {
  const me = useQuery(orpc.people.me.queryOptions());
  const onlyCases =
    me.data?.roles.length === 1 && me.data.scopes?.vet?.kind === "cases";
  const sheds = useQuery({
    ...orpc.herd.list.queryOptions(),
    enabled: enabled && Boolean(me.data) && !onlyCases,
  });
  return new Map(
    (sheds.data ?? []).flatMap((shed) =>
      shed.pens.map((pen) => [pen.id, `${shed.name} / ${pen.name}`] as const)
    )
  );
};
