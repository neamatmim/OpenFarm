import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";

import { useIsOwner } from "@/components/money";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * Whose hand took the cash, asked of the Owner alone — writing up the Manager's haat sale that evening, the notes are in
 * his hand, where his Friday count will look for them. Her own by default ("" sends nothing, and the farm takes the
 * writer's); a Manager is never asked, since the cash he writes is his own.
 */
export const WhoseHandField = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (userId: string) => void;
}) => {
  const { t } = useLanguage();
  const isOwner = useIsOwner();
  const holders = useQuery({
    ...orpc.cash.holders.queryOptions(),
    enabled: isOwner,
  });
  const me = useQuery(orpc.people.me.queryOptions());
  if (!isOwner) {
    return null;
  }
  const others = (holders.data ?? []).filter(
    (one) => one.userId !== me.data?.id
  );
  if (others.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{t("cash.whoseHand")}</Label>
      <select
        className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t("cash.myOwnHand")}</option>
        {others.map((one) => (
          <option key={one.userId} value={one.userId}>
            {one.name}
          </option>
        ))}
      </select>
    </div>
  );
};
