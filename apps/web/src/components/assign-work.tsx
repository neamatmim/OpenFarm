import { mayTransition } from "@OpenFarm/domain";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { UserRoundCheck } from "lucide-react";
import { useId } from "react";

import { NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * Pinning work to one person — the milker who knows that Pen, the vet who is coming on Thursday — or leaving it to
 * whoever holds its Role. Only for those who run the farm, and only while the work is still open.
 */
export const AssignWork = ({
  instanceId,
  assignedRole,
  assignedTo,
  state,
  className,
}: {
  className?: string;
  instanceId: string;
  assignedRole: string;
  assignedTo: string | null;
  state: string;
}) => {
  const t = useT();
  const refused = useRefused();
  const id = useId();
  const me = useQuery(orpc.people.me.queryOptions());
  const runsTheFarm = (me.data?.roles ?? []).some(
    (role) => role === "owner" || role === "manager"
  );
  // Only work still owed is given to somebody: finished work is done, and work closed as Missed or Called Off is not.
  const mayAssign = mayTransition("assign", state);
  const people = useQuery({
    ...orpc.people.list.queryOptions(),
    enabled: runsTheFarm && mayAssign,
  });
  const assign = useMutation(
    orpc.work.assign.mutationOptions({
      onSuccess: () => {
        toast.success(t("work.assigned"));
      },
      onError: refused,
    })
  );

  if (!(runsTheFarm && mayAssign)) {
    return null;
  }
  const holders = (people.data?.people ?? []).filter(
    (person) =>
      !person.disabledAt && (person.roles as string[]).includes(assignedRole)
  );

  return (
    <div
      className={cn(
        "surface flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-3",
        className
      )}
    >
      <Label className="inline-flex shrink-0 items-center gap-2" htmlFor={id}>
        <UserRoundCheck aria-hidden className="text-muted-foreground size-4" />
        {t("work.assignTo")}
      </Label>
      <NativeSelect
        className="md:max-w-xs"
        disabled={assign.isPending || !people.data}
        id={id}
        onChange={(event) =>
          assign.mutate({ id: instanceId, userId: event.target.value || null })
        }
        value={assignedTo ?? ""}
      >
        <option value="">
          {t("work.anyoneInRole", {
            role: t(`role.${assignedRole}` as "role.staff"),
          })}
        </option>
        {holders.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </NativeSelect>
      {assign.isPending ? <Spinner /> : null}
    </div>
  );
};
