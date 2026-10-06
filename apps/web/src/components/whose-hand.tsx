import { Label } from "@OpenFarm/ui/components/label";
import { useQuery } from "@tanstack/react-query";

import { useIsOwner } from "@/components/money";
import { NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * Whose hand took the cash, asked of the Owner alone — writing up the Manager's livestock market sale that evening, the notes are in
 * his hand, where his Friday count will look for them. Her own by default ("" sends nothing, and the farm takes the
 * writer's); a Manager is never asked, since the cash he writes is his own.
 */
export const WhoseHandField = ({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (userId: string) => void;
  /** What the box asks, where it is not whose hand took the cash: who carries a Float. */
  label?: string;
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
      <Label htmlFor={id}>{label ?? t("cash.whoseHand")}</Label>
      <NativeSelect
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
      </NativeSelect>
    </div>
  );
};
